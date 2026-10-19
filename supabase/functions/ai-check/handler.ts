/**
 * AIチェック（Claude）の 窓口 — 中身（願い #586）
 *
 * `index.ts` が Deno の 道具（Supabase・Anthropic の SDK）を つないで、ここを 呼ぶ。
 * ここは **Web の Request／Response と 渡された 道具だけ**で 書く——vitest から そのまま
 * 呼べる ように する ため（`tests/ai_check_handler.test.ts`）。
 *
 * ## 2つの 頼み
 * - `{ op: "status" }` … いま 使えるか だけ 返す（画面が つなぎの したくを 決める）
 * - `{ op: "review", kind, system, prompt, tool }` … 門番を 通ったら Claude に 1回 頼み、
 *   道具の 引数（JSON）を そのまま 返す。読みとり（`parseQuizReview` 等）は 画面の 側
 *
 * ## 指示文は 画面から 受けとる
 * Gemini の 見かた係と **同じ 指示文・同じ 道具**を 使う（`src/lib/quiz/ai-review.ts`・
 * `bugreport.ts`）。こちらで 書き直すと 2つが ずれる。そのかわり 受けとる 形を 絞る:
 * kind ごとに 道具の 名前を 決め、文の 長さに 上限を 置き、**道具を 必ず 呼ばせる**
 *（返事は 道具の 引数＝JSON だけ）。ログインと 門番と 1人の 上限が 外の 乱用を 止める。
 */

import {
  aiGroupOf,
  decideAiGate,
  parseExceptions,
  parseWindows,
  type AiGateClosed,
  type AiGlobalSettings,
  type AiGroupRule,
  type AiOverride,
} from "./claude-gate.ts";

/** 頼める チェックと、その 道具の 名前（ちがう 名前は 断る）。 */
export const AI_CHECK_TOOLS = {
  quiz: "kotae_no_check",
  bug: "bug_houkoku_no_check",
} as const;
export type AiCheckKind = keyof typeof AI_CHECK_TOOLS;

/** 受けとる 文の 上限（字）。指示文・道具の 形・頼みの 本文。 */
export const AI_CHECK_LIMITS = { system: 2_000, tool: 12_000, prompt: 16_000 } as const;

/** 返事の 上限（トークン）。道具の 引数だけ なので これで 足りる。 */
export const AI_CHECK_MAX_TOKENS = 2_048;

/**
 * 100万トークン あたりの 値段（ドル）。入力 10万トークン 以下の とき。
 * 2026-10-08 に 公式の 資料で 確かめた 値（docs/proposals/2026-10-08_ClaudeAPIで学習を補助する計画.md §3）。
 */
export const AI_CHECK_PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export interface AiUsageTokens {
  readonly input_tokens?: number | null;
  readonly output_tokens?: number | null;
  readonly cache_read_input_tokens?: number | null;
  readonly cache_creation_input_tokens?: number | null;
}

/** 1回の 費用（ドル）。知らない モデルは いちばん 高い 見積もり（Haiku の 10倍）で 数える。 */
export function aiCostUsd(model: string, usage: AiUsageTokens): number {
  const price = AI_CHECK_PRICES[model] ?? {
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  };
  const perToken = (value: number | null | undefined, rate: number) =>
    ((value ?? 0) * rate) / 1_000_000;
  return (
    perToken(usage.input_tokens, price.input) +
    perToken(usage.output_tokens, price.output) +
    perToken(usage.cache_read_input_tokens, price.cacheRead) +
    perToken(usage.cache_creation_input_tokens, price.cacheWrite)
  );
}

/** 門番が 読む もの（DB）。 */
export interface AiCheckContext {
  readonly profile: { university: string | null; cohort: number | null } | null;
  readonly settings: {
    stopped: boolean;
    monthly_budget_usd: number | string;
    daily_user_limit: number;
    model: string;
  } | null;
  readonly rule: {
    university: string;
    cohort: number;
    windows: unknown;
    /** 日付の 例外（列を 足す 前の 行・古い 窓口では 無い）。 */
    exceptions?: unknown;
    override: string;
    override_until: string | null;
  } | null;
  readonly monthCostUsd: number;
  readonly userCallsToday: number;
}

/** Claude に 1回 頼んだ けっか。 */
export type ClaudeCallResult =
  | {
      readonly ok: true;
      /** 道具の 引数。道具が 呼ばれなかった ときは null。 */
      readonly input: unknown;
      readonly stopReason: string | null;
      readonly usage: AiUsageTokens;
    }
  | { readonly ok: false; readonly reason: AiCheckFailure; readonly usage?: AiUsageTokens };

export type AiCheckFailure =
  "rateLimited" | "overloaded" | "timeout" | "upstream" | "refused" | "badShape";

export interface AiCheckDeps {
  /** Claude の 鍵が 入って いるか。 */
  readonly hasKey: boolean;
  readonly now: () => Date;
  /** Authorization の 鍵から 呼んだ 人の id を 出す。だめなら null。 */
  readonly userIdFromJwt: (jwt: string) => Promise<string | null>;
  readonly loadContext: (userId: string) => Promise<AiCheckContext>;
  readonly callClaude: (request: {
    model: string;
    system: string;
    prompt: string;
    tool: { name: string; description: string; input_schema: Record<string, unknown> };
    maxTokens: number;
  }) => Promise<ClaudeCallResult>;
  readonly recordUsage: (row: {
    user_id: string;
    university: string;
    cohort: number;
    kind: AiCheckKind;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_usd: number;
    ok: boolean;
  }) => Promise<void>;
}

/** 呼べる 場所（ブラウザ）。返事の 頭に つける。 */
export const AI_CHECK_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...AI_CHECK_CORS, "Content-Type": "application/json" },
  });
}

type ReviewRequest = {
  kind: AiCheckKind;
  system: string;
  prompt: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
};

/** 頼みの 形を 確かめる。だめなら null。 */
export function parseReviewRequest(body: unknown): ReviewRequest | null {
  if (!body || typeof body !== "object") return null;
  const bag = body as Record<string, unknown>;
  const kind = bag.kind;
  if (kind !== "quiz" && kind !== "bug") return null;
  const { system, prompt, tool } = bag;
  if (typeof system !== "string" || typeof prompt !== "string") return null;
  if (system.trim() === "" || prompt.trim() === "") return null;
  if (system.length > AI_CHECK_LIMITS.system || prompt.length > AI_CHECK_LIMITS.prompt) {
    return null;
  }
  if (!tool || typeof tool !== "object") return null;
  const t = tool as Record<string, unknown>;
  if (t.name !== AI_CHECK_TOOLS[kind]) return null;
  if (typeof t.description !== "string") return null;
  if (!t.input_schema || typeof t.input_schema !== "object" || Array.isArray(t.input_schema)) {
    return null;
  }
  if ((t.input_schema as { type?: unknown }).type !== "object") return null;
  if (JSON.stringify(tool).length > AI_CHECK_LIMITS.tool) return null;
  return {
    kind,
    system,
    prompt,
    tool: {
      name: AI_CHECK_TOOLS[kind],
      description: t.description,
      input_schema: t.input_schema as Record<string, unknown>,
    },
  };
}

function settingsOf(context: AiCheckContext): AiGlobalSettings & { model: string } {
  const row = context.settings;
  /*
   * 行が 読めない ときは **閉じる 側**に 倒す（止めて いる のと 同じ）。
   * 開く 側に 倒すと、上限も 見ずに 費用が 出る。
   */
  if (!row) {
    return { stopped: true, monthlyBudgetUsd: 0, dailyUserLimit: 0, model: "claude-haiku-5-5" };
  }
  return {
    stopped: row.stopped === true,
    monthlyBudgetUsd: Number(row.monthly_budget_usd) || 0,
    dailyUserLimit: row.daily_user_limit,
    model: row.model,
  };
}

function ruleOf(context: AiCheckContext): AiGroupRule | null {
  const row = context.rule;
  if (!row) return null;
  const override: AiOverride =
    row.override === "on" || row.override === "off" ? row.override : "auto";
  return {
    university: row.university,
    cohort: row.cohort,
    windows: parseWindows(row.windows),
    exceptions: parseExceptions(row.exceptions),
    override,
    overrideUntil: row.override_until,
  };
}

/** 窓口の 本体。 */
export async function handleAiCheck(request: Request, deps: AiCheckDeps): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: AI_CHECK_CORS });
  if (request.method !== "POST") return json({ ok: false, reason: "badRequest" }, 405);

  const auth = request.headers.get("Authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const userId = jwt === "" ? null : await deps.userIdFromJwt(jwt);
  if (!userId) return json({ ok: false, reason: "noAuth" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: "badRequest" }, 400);
  }
  const op = (body as { op?: unknown } | null)?.op;
  if (op !== "status" && op !== "review") return json({ ok: false, reason: "badRequest" }, 400);

  const context = await deps.loadContext(userId);
  const settings = settingsOf(context);
  const group = context.profile ? aiGroupOf(context.profile) : null;
  const gate = decideAiGate({
    now: deps.now(),
    hasKey: deps.hasKey,
    settings,
    group,
    rule: ruleOf(context),
    monthCostUsd: context.monthCostUsd,
    userCallsToday: context.userCallsToday,
  });
  if (!gate.open) return json({ ok: false, reason: gate.reason satisfies AiGateClosed });
  if (op === "status") return json({ ok: true, open: true, model: settings.model });

  const review = parseReviewRequest(body);
  if (!review) return json({ ok: false, reason: "badRequest" }, 400);

  const result = await deps.callClaude({
    model: settings.model,
    system: review.system,
    prompt: review.prompt,
    tool: review.tool,
    maxTokens: AI_CHECK_MAX_TOKENS,
  });

  const usage = result.usage ?? {};
  const failed: AiCheckFailure | null = !result.ok
    ? result.reason
    : result.stopReason === "refusal"
      ? "refused"
      : result.input === null || typeof result.input !== "object"
        ? "badShape"
        : null;

  /*
   * **断られた・崩れた 回も 数える**（費用は かかって いる）。記録に 失敗しても
   * 返事は 返す——記録の ために 学習者を 待たせない。
   */
  if (result.usage) {
    await deps
      .recordUsage({
        user_id: userId,
        university: group?.university ?? "",
        cohort: group?.cohort ?? 0,
        kind: review.kind,
        model: settings.model,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_tokens: usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
        cost_usd: aiCostUsd(settings.model, usage),
        ok: failed === null,
      })
      .catch(() => undefined);
  }

  if (failed !== null) return json({ ok: false, reason: failed });
  return json({ ok: true, input: (result as { input: unknown }).input, model: settings.model });
}
