import { describe, expect, it } from "vitest";
import { claudeToolOf, parseInvokeResult } from "@/lib/ai/claude-check";
import { claudeFailReason, fallBackToGemini } from "@/lib/ai/claude-review";
import { judgeFailNote } from "@/components/meeting/judge-api";
import { BUG_REVIEW_SYSTEM, BUG_REVIEW_TOOL } from "@/lib/quiz/bugreport";
import { QUIZ_REVIEW_SYSTEM, QUIZ_REVIEW_TOOL } from "@/lib/quiz/ai-review";
import { AI_CHECK_LIMITS, AI_CHECK_TOOLS } from "../supabase/functions/ai-check/handler.ts";

/**
 * AIチェック（Claude）の 画面の 側の つなぎ（`src/lib/ai/claude-check.ts`・`claude-review.ts`）
 *
 * Gemini の 見かた係と **同じ 指示文・同じ 道具**を Claude に 渡す。ここが ずれると
 * 窓口（関数）が 頼みを 断り、授業中でも 黙って Gemini／お手本に 落ちる。
 */

describe("道具を Claude の 形に 写す", () => {
  it("型名を 小文字に する（OBJECT → object）", () => {
    const tool = claudeToolOf(QUIZ_REVIEW_TOOL);
    expect(tool.name).toBe("kotae_no_check");
    expect(tool.input_schema.type).toBe("object");
    const items = (
      tool.input_schema.properties as Record<string, { type: string; items?: { type: string } }>
    ).items;
    expect(items?.type).toBe("array");
    expect(items?.items?.type).toBe("object");
    expect(JSON.stringify(tool)).not.toMatch(/"type":"[A-Z]+"/);
  });

  it("窓口が 受けつける 名前と そろって いる（メール・Slack と バグ報告）", () => {
    expect(claudeToolOf(QUIZ_REVIEW_TOOL).name).toBe(AI_CHECK_TOOLS.quiz);
    expect(claudeToolOf(BUG_REVIEW_TOOL).name).toBe(AI_CHECK_TOOLS.bug);
  });

  it("窓口の 字数の 上限に 収まる", () => {
    for (const tool of [QUIZ_REVIEW_TOOL, BUG_REVIEW_TOOL]) {
      expect(JSON.stringify(claudeToolOf(tool)).length).toBeLessThanOrEqual(AI_CHECK_LIMITS.tool);
    }
    expect(QUIZ_REVIEW_SYSTEM.length).toBeLessThanOrEqual(AI_CHECK_LIMITS.system);
    expect(BUG_REVIEW_SYSTEM.length).toBeLessThanOrEqual(AI_CHECK_LIMITS.system);
  });
});

describe("窓口の 返事を 読む", () => {
  it("開いて いる・道具の 引数・閉じて いる・失敗", () => {
    expect(parseInvokeResult({ ok: true, open: true, model: "claude-haiku-5-5" })).toEqual({
      ok: true,
      open: true,
      model: "claude-haiku-5-5",
    });
    expect(parseInvokeResult({ ok: true, input: { a: 1 }, model: "m" })).toEqual({
      ok: true,
      input: { a: 1 },
      model: "m",
    });
    expect(parseInvokeResult({ ok: false, reason: "outside" })).toEqual({
      ok: false,
      reason: "outside",
      closed: true,
    });
    expect(parseInvokeResult({ ok: false, reason: "overloaded" })).toEqual({
      ok: false,
      reason: "overloaded",
      closed: false,
    });
    expect(parseInvokeResult("壊れた 返事")).toEqual({
      ok: false,
      reason: "badShape",
      closed: false,
    });
  });
});

describe("Claude が だめな とき", () => {
  it("閉じて いれば Gemini へ 回す（いまの 動き）。遅かった ときは 回さない", () => {
    expect(fallBackToGemini({ reason: "outside", closed: true })).toBe(true);
    expect(fallBackToGemini({ reason: "overloaded", closed: false })).toBe(true);
    expect(fallBackToGemini({ reason: "timeout", closed: false })).toBe(false);
  });

  it("時間の 外・設定なしは いまと 同じ 一言（noKey）。上限は「いま つかえません」", () => {
    expect(claudeFailReason({ reason: "outside", closed: true })).toBe("noKey");
    expect(claudeFailReason({ reason: "noRule", closed: true })).toBe("noKey");
    expect(judgeFailNote(claudeFailReason({ reason: "budget", closed: true }))).toBe(
      judgeFailNote("unavailable"),
    );
    // Anthropic の 429 は Google の「1日の 使いすぎ」とは ちがう——「こんで います」
    expect(claudeFailReason({ reason: "rateLimited", closed: false })).toBe("overloaded");
  });

  it("一言に 仕組みの ことば（Claude・時間・鍵）を 出さない", () => {
    for (const reason of ["outside", "budget", "userLimit", "stopped", "noRule"]) {
      const note = judgeFailNote(claudeFailReason({ reason, closed: true }));
      expect(note).not.toMatch(/Claude|クロード|時間|鍵/);
    }
  });
});
