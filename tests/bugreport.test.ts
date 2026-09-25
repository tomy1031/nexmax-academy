import { describe, expect, it } from "vitest";
import bugQuiz from "../content/quizsets/houkoku_bug_quiz.json";
import { quizSetSchema } from "@/content/schema";
import {
  EMPTY_BUG_REPORT,
  bugReportPassed,
  bugReportScore,
  bugReportsPassed,
  buildBugReviewPrompt,
  bugReviewContext,
  composeBugReport,
  parseBugReview,
  readAloudMatches,
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
  it("2つの 画面では もう 1つの 欄で 合格した 報告を 渡す（同じ バグの 二重どり 防止）", () => {
    const other = { ...judged(4), spoken: "ことばで 検索すると 出ません" };
    const context = bugReviewContext(
      double,
      1,
      [other, EMPTY_BUG_REPORT],
      "カテゴリーが ちがいます",
    );
    expect(context.others).toEqual(["ことばで 検索すると 出ません"]);
    expect(buildBugReviewPrompt(context)).toContain("ことばで 検索すると 出ません");
    expect(context.spoken).toBe("カテゴリーが ちがいます");
  });

  it("✗だった 報告は「すでに 報告した」に 数えない", () => {
    const failed = { ...judged(1), spoken: "ことばで 検索すると 出ません" };
    const context = bugReviewContext(double, 1, [failed, EMPTY_BUG_REPORT], "同じ はなし");
    expect(context.others).toEqual([]);
  });

  it("2回目からは ヒントを 具体的に 頼む", () => {
    const context = bugReviewContext(single, 0, [{ ...judged(1), tries: 1 }], "…");
    expect(context.attempt).toBe(2);
    expect(buildBugReviewPrompt(context)).toContain("2回目");
  });

  it("道具の 返事は 4項目 そろって はじめて 読む（点は 0〜25 に 丸める）", () => {
    const args = {
      items: [
        { id: "screen", points: 25, note: "" },
        { id: "action", points: 40, note: "" },
        { id: "result", points: -3, note: "" },
        { id: "expected", points: 12.4, note: "もう すこし" },
      ],
      understandable: true,
      polished: "",
      corrected: "フード注文画面で …",
    };
    const review = parseBugReview(args)!;
    expect(review.items.map((one) => one.points)).toEqual([25, 25, 0, 12]);
    expect(parseBugReview({ ...args, items: args.items.slice(0, 3) })).toBeNull();
  });
});

describe("部分点と 意味の 通らない 報告（2026-09-23 の 指定）", () => {
  const items = (points: number[]) =>
    points.map((p, i) => ({ id: String(i), ok: p === 25, points: p }));

  it("項目ごとに 25点・部分点は 足す", () => {
    expect(bugReportScore(items([25, 20, 15, 10]))).toBe(70);
  });

  it("意味が 通らない 報告は 60点を 超えない（＝進めない）", () => {
    expect(bugReportScore(items([25, 25, 20, 20]), false)).toBe(60);
    expect(bugReportPassed({ ...filled, spoken: "…", score: 60, items: [] })).toBe(false);
  });
});

describe("3回 だめなら 答えを 読んで 通す", () => {
  const shown =
    "フード注文画面で、＋を 押しました。すると、合計が 変わりませんでした。本当は、合計も 変わる はずです。";

  it("見せた 文を ほぼ そのまま 読めば 通る（聞き取りの 字の ゆれは 気に しない）", () => {
    expect(
      readAloudMatches(
        shown,
        "フード注文画面で プラスを押しました すると合計が変わりませんでした 本当は合計も変わるはずです",
      ),
    ).toBe(true);
    expect(readAloudMatches(shown, "ログイン画面で ボタンを 押しました")).toBe(false);
  });

  it("読めた 報告は 点に かかわらず 合格", () => {
    expect(bugReportPassed({ ...judged(1), readAnswer: true })).toBe(true);
  });
});

describe("ヒントは 学生の ことばに 向ける・文法も 見る（2026-09-25 の 指定）", () => {
  it("頼みに「」で 引く・逆なら ちがうと 言う・文法は grammar に 書く が 入る", () => {
    const prompt = buildBugReviewPrompt(
      bugReviewContext(single, 0, [filled], "ログイン画面で 表示が しちゃいました。"),
    );
    expect(prompt).toContain("「」で 引いて");
    expect(prompt).toContain("「ちがいます」と はっきり");
    expect(prompt).toContain("grammar に 1つずつ");
    // 文法は 点を 引かない（点の きまりは #524 の まま）
    expect(prompt).toContain("**点を 引かずに**");
  });

  it("文法の 直しを 読む（無くても 点は 出す・同じ 形や 空は 捨てる）", () => {
    const base = {
      items: ["screen", "action", "result", "expected"].map((id) => ({ id, points: 25, note: "" })),
      understandable: true,
      polished: "",
      corrected: "",
    };
    expect(parseBugReview(base)!.grammar).toEqual([]);
    const review = parseBugReview({
      ...base,
      grammar: [
        { said: "ログインが する", fix: "ログインする", why: "「が」は いりません。" },
        { said: "おなじ", fix: "おなじ", why: "" },
        { said: "", fix: "x", why: "" },
        "こわれた 形",
      ],
    })!;
    expect(review.grammar).toEqual([
      { said: "ログインが する", fix: "ログインする", why: "「が」は いりません。" },
    ]);
  });
});
