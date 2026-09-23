import { describe, expect, it } from "vitest";
import bugQuiz from "../content/quizsets/houkoku_bug_quiz.json";
import { quizSetSchema } from "@/content/schema";
import {
  EMPTY_BUG_REPORT,
  bugReportPassed,
  bugReportScore,
  bugReportsPassed,
  bugReviewContext,
  composeBugReport,
  type BugReportEntry,
  type BugReportQuestion,
} from "@/lib/quiz/bugreport";
import { gradeDraft } from "@/lib/quiz/draft";

const set = quizSetSchema.parse(bugQuiz);
const questions = set.questions.filter((q): q is BugReportQuestion => q.type === "bugreport");
const single = questions.find((q) => q.bugs.length === 1)!;
const double = questions.find((q) => q.bugs.length === 2)!;

const filled: BugReportEntry = {
  ...EMPTY_BUG_REPORT,
  screen: "フード注文画面",
  action: "＋を 押しました。",
  result: "合計が 変わりませんでした。",
  expected: "合計も 変わる はずです。",
};
const judged = (ok: number): BugReportEntry => ({
  ...filled,
  spoken: "フード注文画面で …",
  items: ["screen", "action", "result", "expected"].map((id, i) => ({ id, ok: i < ok, note: "" })),
  score: bugReportScore(["screen", "action", "result", "expected"].map((_, i) => ({ ok: i < ok }))),
});

describe("バグ報告の 教材", () => {
  it("8画面・バグが 2つの 画面は さいごの 2問（2026-09-23 の 指定）", () => {
    expect(questions).toHaveLength(8);
    const counts = questions.map((q) => q.bugs.length);
    expect(counts.slice(-2)).toEqual([2, 2]);
    expect(counts.slice(0, -2).every((n) => n === 1)).toBe(true);
  });

  it("テストする サイトは public/ に ある", async () => {
    const { existsSync } = await import("node:fs");
    for (const q of questions) expect(existsSync(`public${q.site}`), q.site).toBe(true);
  });
});

describe("点と 関門", () => {
  it("60点 以下は 通さない（4つ中 2つ＝50点）・3つ（75点）で 通す", () => {
    expect(bugReportPassed(judged(2))).toBe(false);
    expect(bugReportPassed(judged(3))).toBe(true);
    expect(bugReportPassed(judged(4))).toBe(true);
  });

  it("話して いない（点が 無い）報告は 通さない。鍵が 無い 端末だけ 欄で 通す", () => {
    expect(bugReportPassed(filled)).toBe(false);
    expect(bugReportPassed({ ...filled, skipped: true })).toBe(true);
    expect(bugReportPassed({ ...filled, action: "", skipped: true })).toBe(false);
  });

  it("バグが 2つの 画面は 2つとも 通って はじめて 合格", () => {
    expect(bugReportsPassed(double, [judged(4)])).toBe(false);
    expect(bugReportsPassed(double, [judged(4), judged(2)])).toBe(false);
    expect(bugReportsPassed(double, [judged(4), judged(3)])).toBe(true);
  });

  it("採点（記録）は 関門と 同じ ものさし", () => {
    const pass = gradeDraft(single, { kind: "bugreport", reports: [judged(3)] });
    const fail = gradeDraft(single, { kind: "bugreport", reports: [judged(2)] });
    expect(pass.correct).toBe(true);
    expect(fail.correct).toBe(false);
    // 先生に 残す 文に 話した ことばと 点が 入る
    expect(pass.answer).toContain("🎤 フード注文画面で");
    expect(pass.answer).toContain("点: 75");
  });
});

describe("まとめて 報告しましょう", () => {
  it("元の report.js と 同じ 組み立て", () => {
    expect(composeBugReport(filled)).toBe(
      "フード注文画面で、＋を 押しました。\nすると、合計が 変わりませんでした。\n本当は、合計も 変わる はずです。",
    );
  });
});

describe("AIへの 頼み", () => {
  it("2つの 画面では もう 1つの 欄で 話した ことを 渡す（同じ バグの 二重どり 防止）", () => {
    const other = { ...judged(4), spoken: "ことばで 検索すると 出ません" };
    const context = bugReviewContext(
      double,
      1,
      [other, EMPTY_BUG_REPORT],
      "カテゴリーが ちがいます",
    );
    expect(context.note).toContain("ことばで 検索すると 出ません");
    expect(context.items.map((one) => one.id)).toEqual(["screen", "action", "result", "expected"]);
    expect(context.written).toBe("カテゴリーが ちがいます");
  });

  it("✗だった 報告は「すでに 報告した」に 数えない（正しい 報告を 二重どりで 落とさない）", () => {
    const failed = { ...judged(1), spoken: "ことばで 検索すると 出ません" };
    const context = bugReviewContext(double, 1, [failed, EMPTY_BUG_REPORT], "同じ はなし");
    expect(context.note).not.toContain("ことばで 検索すると 出ません");
  });
});
