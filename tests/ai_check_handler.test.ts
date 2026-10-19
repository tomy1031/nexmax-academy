import { describe, expect, it, vi } from "vitest";
import {
  AI_CHECK_TOOLS,
  aiCostUsd,
  handleAiCheck,
  type AiCheckContext,
  type AiCheckDeps,
  type ClaudeCallResult,
} from "../supabase/functions/ai-check/handler.ts";

/**
 * AIチェック（Claude）の 窓口（`supabase/functions/ai-check/handler.ts`・願い #586）
 *
 * Deno の 関数の 中身を、道具を 差しかえて 通す。見る ところ:
 * - ログイン・門番を 通らない 頼みで **Claude を 呼ばない**（費用を 出さない）
 * - 道具の 名前が ちがう 頼みは 断る（窓口を 何にでも 使わせない）
 * - 断られた・崩れた 回も **使った 量を 残す**（費用は かかって いる）
 */

const OPEN_CONTEXT: AiCheckContext = {
  profile: { university: "AUPP", cohort: 3 },
  settings: {
    stopped: false,
    monthly_budget_usd: "90.00",
    daily_user_limit: 80,
    model: "claude-haiku-5-5",
  },
  rule: {
    university: "AUPP",
    cohort: 3,
    windows: [{ days: [2, 3, 5], start: "17:30", end: "19:00" }],
    override: "auto",
    override_until: null,
  },
  monthCostUsd: 0,
  userCallsToday: 0,
};

/** 2026-10-13（火）18:00 カンボジア時間。 */
const IN_CLASS = new Date(Date.UTC(2026, 9, 13, 11, 0));

function deps(overrides: Partial<AiCheckDeps> = {}) {
  const callClaude = vi.fn(async (): Promise<ClaudeCallResult> => ({
    ok: true,
    input: { ok: true, items: [], polished: "" },
    stopReason: "tool_use",
    usage: { input_tokens: 6_000, output_tokens: 800 },
  }));
  const recordUsage = vi.fn(async () => undefined);
  const all: AiCheckDeps = {
    hasKey: true,
    now: () => IN_CLASS,
    userIdFromJwt: async (jwt) => (jwt === "good" ? "user-1" : null),
    loadContext: async () => OPEN_CONTEXT,
    callClaude,
    recordUsage,
    ...overrides,
  };
  return {
    all,
    callClaude: all.callClaude as typeof callClaude,
    recordUsage: all.recordUsage as typeof recordUsage,
  };
}

function post(body: unknown, jwt = "good"): Request {
  return new Request("https://example.test/functions/v1/ai-check", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const REVIEW = {
  op: "review",
  kind: "quiz",
  system: "あなたは 見かた係です。",
  prompt: "# しつもん\nテスト",
  tool: {
    name: AI_CHECK_TOOLS.quiz,
    description: "見る",
    input_schema: { type: "object", properties: {} },
  },
};

describe("入口", () => {
  it("ブラウザの 下見（OPTIONS）に 答える", async () => {
    const response = await handleAiCheck(
      new Request("https://example.test/", { method: "OPTIONS" }),
      deps().all,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("x-region");
  });

  it("ログインして いなければ 断る（Claude を 呼ばない）", async () => {
    const { all, callClaude } = deps();
    const response = await handleAiCheck(post(REVIEW, "bad"), all);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, reason: "noAuth" });
    expect(callClaude).not.toHaveBeenCalled();
  });
});

describe("門番", () => {
  it("授業の 時間なら status は 開いて いる", async () => {
    const response = await handleAiCheck(post({ op: "status" }), deps().all);
    expect(await response.json()).toEqual({ ok: true, open: true, model: "claude-haiku-5-5" });
  });

  it("時間の 外は 閉じる（Claude を 呼ばない・記録も しない）", async () => {
    const { all, callClaude, recordUsage } = deps({
      now: () => new Date(Date.UTC(2026, 9, 13, 12, 0)), // 19:00
    });
    const response = await handleAiCheck(post(REVIEW), all);
    expect(await response.json()).toEqual({ ok: false, reason: "outside" });
    expect(callClaude).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("設定が 読めない ときは 止めて いる ものと みなす", async () => {
    const { all } = deps({ loadContext: async () => ({ ...OPEN_CONTEXT, settings: null }) });
    const response = await handleAiCheck(post({ op: "status" }), all);
    expect(await response.json()).toEqual({ ok: false, reason: "stopped" });
  });

  it("鍵が 無ければ unconfigured", async () => {
    const { all } = deps({ hasKey: false });
    const response = await handleAiCheck(post({ op: "status" }), all);
    expect(await response.json()).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("組の 設定が 無ければ 使えない", async () => {
    const { all } = deps({ loadContext: async () => ({ ...OPEN_CONTEXT, rule: null }) });
    const response = await handleAiCheck(post({ op: "status" }), all);
    expect(await response.json()).toEqual({ ok: false, reason: "noRule" });
  });
});

describe("頼み", () => {
  it("道具の 名前が kind と ちがえば 断る", async () => {
    const { all, callClaude } = deps();
    const response = await handleAiCheck(
      post({ ...REVIEW, tool: { ...REVIEW.tool, name: "free_chat" } }),
      all,
    );
    expect(response.status).toBe(400);
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("長すぎる 頼みは 断る", async () => {
    const { all, callClaude } = deps();
    const response = await handleAiCheck(post({ ...REVIEW, prompt: "あ".repeat(16_001) }), all);
    expect(response.status).toBe(400);
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("通ったら 道具の 引数を 返し、使った 量を 残す", async () => {
    const { all, callClaude, recordUsage } = deps();
    const response = await handleAiCheck(post(REVIEW), all);
    expect(await response.json()).toEqual({
      ok: true,
      input: { ok: true, items: [], polished: "" },
      model: "claude-haiku-5-5",
    });
    expect(callClaude).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-5-5", tool: REVIEW.tool }),
    );
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        university: "AUPP",
        cohort: 3,
        kind: "quiz",
        input_tokens: 6_000,
        output_tokens: 800,
        ok: true,
      }),
    );
  });

  it("断られた 回も 記録する（費用は かかって いる）", async () => {
    const { all, recordUsage } = deps({
      callClaude: async () => ({
        ok: true,
        input: null,
        stopReason: "refusal",
        usage: { input_tokens: 100, output_tokens: 5 },
      }),
    });
    const response = await handleAiCheck(post(REVIEW), all);
    expect(await response.json()).toEqual({ ok: false, reason: "refused" });
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("届かなかった（使った 量が 無い）回は 記録しない", async () => {
    const { all, recordUsage } = deps({
      callClaude: async () => ({ ok: false, reason: "timeout" }),
    });
    const response = await handleAiCheck(post(REVIEW), all);
    expect(await response.json()).toEqual({ ok: false, reason: "timeout" });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("記録に 失敗しても 返事は 返す", async () => {
    const { all } = deps({ recordUsage: async () => Promise.reject(new Error("db down")) });
    const response = await handleAiCheck(post(REVIEW), all);
    expect((await response.json()).ok).toBe(true);
  });
});

describe("費用", () => {
  it("Haiku 5.5 の 値段で 数える（入力 0.10・出力 0.50 ドル／100万）", () => {
    expect(
      aiCostUsd("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }),
    ).toBeCloseTo(0.6);
    expect(aiCostUsd("claude-haiku-5-5", { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.01);
  });

  it("知らない モデルは 高い 側で 見積もる", () => {
    expect(aiCostUsd("unknown", { input_tokens: 1_000_000 })).toBeCloseTo(1);
  });
});

describe("日付の 例外（窓口でも 効く）", () => {
  it("その 日だけ「なし」なら 授業の 時間でも 閉じる", async () => {
    const { all, callClaude } = deps({
      loadContext: async () => ({
        ...OPEN_CONTEXT,
        rule: { ...OPEN_CONTEXT.rule!, exceptions: [{ date: "2026-10-13" }] },
      }),
    });
    const response = await handleAiCheck(post(REVIEW), all);
    expect(await response.json()).toEqual({ ok: false, reason: "outside" });
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("例外の 列が 無い 古い 行は 曜日の 時間だけで 見る", async () => {
    const response = await handleAiCheck(post({ op: "status" }), deps().all);
    expect((await response.json()).open).toBe(true);
  });
});
