import { FunctionRegion, FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * AIチェック（Claude）を 呼ぶ — 画面の 側の つなぎ（願い #586）
 *
 * 呼ぶ 先は Supabase の 関数 `ai-check`（`supabase/functions/ai-check/`）。
 * **シンガポールに 固定して 呼ぶ**——Cloudflare（香港で 動く ことが ある）からは
 * Claude API を 使えない ため、関数の 側で 呼ぶ。鍵は 関数の 秘密だけに ある。
 *
 * ## 「閉じて いる」と「失敗した」を 分けて 返す
 * - 閉じて いる（`closed: true`）… 授業の 時間の 外・組の 設定が 無い・上限 など。
 *   呼ぶ 側は **いまの 動き（Gemini／お手本）に そのまま 落とす**
 * - 失敗した（`closed: false`）… 混んで いる・遅い・崩れた 返事。呼ぶ 側が 決める
 *
 * デモモード（Supabase 無し）・未ログイン・関数が まだ 無い ときも「閉じて いる」——
 * CI と E2E は いまの まま 動く。
 */

export type ClaudeCheckKind = "quiz" | "bug";

/** Claude に 渡す 道具（Anthropic の 形）。 */
export interface ClaudeTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

export type ClaudeToolResult =
  | { readonly ok: true; readonly input: unknown; readonly model: string }
  | { readonly ok: false; readonly reason: string; readonly closed: boolean };

/**
 * 門番が 閉じた わけ（関数の `AiGateClosed`）と、呼ぶ 前に 分かる わけ。
 * これらは **いまの 動きに 落とす**。
 */
const CLOSED_REASONS = new Set([
  "unconfigured",
  "stopped",
  "noGroup",
  "noRule",
  "off",
  "outside",
  "budget",
  "userLimit",
  "noAuth",
  "noClient",
  "notDeployed",
]);

/** 関数の 往復の 上限。関数の 中で Claude を 15秒×2回 まで 待つ ぶんを 見込む。 */
const INVOKE_TIMEOUT_MS = 35_000;

/** 「いま 使えるか」を 覚えて おく 時間。 */
const STATUS_TTL_MS = 60_000;

let statusCache: { at: number; open: boolean; reason: string } | null = null;

/** テスト用: 覚えた 状態を 捨てる。 */
export function resetClaudeStatusCache(): void {
  statusCache = null;
}

async function invoke(
  body: Record<string, unknown>,
): Promise<ClaudeToolResult | { ok: true; open: true; model: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, reason: "noClient", closed: true };
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, reason: "noAuth", closed: true };

  const { data, error } = await supabase.functions.invoke("ai-check", {
    body,
    region: FunctionRegion.ApSoutheast1,
    timeout: INVOKE_TIMEOUT_MS,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = (error.context as Response | undefined)?.status ?? 0;
      // 関数が まだ 出て いない（404）・ログインが 切れた（401）は いまの 動きへ
      if (status === 404) return { ok: false, reason: "notDeployed", closed: true };
      if (status === 401) return { ok: false, reason: "noAuth", closed: true };
      return { ok: false, reason: "upstream", closed: false };
    }
    const aborted =
      error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`);
    return { ok: false, reason: aborted ? "timeout" : "network", closed: false };
  }
  return parseInvokeResult(data);
}

/** 関数の 返事を 読む（形が 崩れて いたら 失敗）。 */
export function parseInvokeResult(
  data: unknown,
): ClaudeToolResult | { ok: true; open: true; model: string } {
  if (!data || typeof data !== "object") return { ok: false, reason: "badShape", closed: false };
  const bag = data as {
    ok?: unknown;
    reason?: unknown;
    input?: unknown;
    open?: unknown;
    model?: unknown;
  };
  const model = typeof bag.model === "string" ? bag.model : "";
  if (bag.ok === true && bag.open === true) return { ok: true, open: true, model };
  if (bag.ok === true && "input" in bag) return { ok: true, input: bag.input, model };
  const reason = typeof bag.reason === "string" ? bag.reason : "badShape";
  return { ok: false, reason, closed: CLOSED_REASONS.has(reason) };
}

/**
 * いま Claude が 使えるか（60秒 覚える）。
 *
 * 使う ところは 1つ: **Gemini の つなぎを 先に 張るか**を 決める（使えるなら 張らない——
 * 生徒の Gemini の 枠を むだに しない）。判定の 本番は 頼む たびに 関数が する。
 * 呼ぶと 関数も 起きる（1回目の 待ちが 短く なる）。
 */
export async function claudeAvailable(): Promise<boolean> {
  return (await claudeStatus()).open;
}

/** いま Claude が 使えるか と、使えない わけ（60秒 覚える）。 */
export async function claudeStatus(): Promise<{ open: boolean; reason: string }> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) {
    return { open: statusCache.open, reason: statusCache.reason };
  }
  const result = await invoke({ op: "status" }).catch((): ClaudeToolResult => ({
    ok: false,
    reason: "network",
    closed: false,
  }));
  const open = result.ok === true && "open" in result;
  const reason = result.ok ? "" : result.reason;
  statusCache = { at: Date.now(), open, reason };
  return { open, reason };
}

/** Claude に 道具を 1回 呼ばせる。返すのは 道具の 引数（読みとりは 呼ぶ 側）。 */
export async function requestClaudeTool(
  kind: ClaudeCheckKind,
  request: { system: string; prompt: string; tool: ClaudeTool },
): Promise<ClaudeToolResult> {
  const result = await invoke({ op: "review", kind, ...request }).catch((): ClaudeToolResult => ({
    ok: false,
    reason: "network",
    closed: false,
  }));
  if (result.ok && "open" in result) return { ok: false, reason: "badShape", closed: false };
  // 閉じて いた ことが 分かったら 覚えて おく（つぎの 温めで Gemini を 張る）
  if (!result.ok && result.closed)
    statusCache = { at: Date.now(), open: false, reason: result.reason };
  if (result.ok) statusCache = { at: Date.now(), open: true, reason: "" };
  return result;
}

/** Gemini の 道具の 形（`functionDeclarations` の 1つ）。 */
interface GeminiDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** Gemini の 型名（"OBJECT"）を JSON Schema の 型名（"object"）に そろえる。 */
function lowerTypes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(lowerTypes);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] =
      key === "type" && typeof inner === "string" ? inner.toLowerCase() : lowerTypes(inner);
  }
  return out;
}

/**
 * Gemini の 見かた係の 道具を、そのまま Claude の 道具に 写す。
 * **指示文も 道具も 1つ**に して おく（2つ 持つと Gemini と Claude で 見かたが ずれる）。
 */
export function claudeToolOf(tool: {
  functionDeclarations: readonly GeminiDeclaration[];
}): ClaudeTool {
  const declaration = tool.functionDeclarations[0];
  if (!declaration) throw new Error("道具が ありません");
  return {
    name: declaration.name,
    description: declaration.description,
    input_schema: lowerTypes(declaration.parameters) as Record<string, unknown>,
  };
}
