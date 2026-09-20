import { describe, expect, it } from "vitest";
import { AI_KANJI_WORDS } from "@/lib/ai-kanji";
import {
  buildQuizReviewPrompt,
  parseQuizReview,
  QUIZ_REVIEW_TOOL,
  type QuizReviewContext,
} from "@/lib/quiz/ai-review";

/**
 * 書いた ものを AIに 見て もらう（もんだいの 「🤖 AIに 見て もらう」）。
 *
 * ここで 固定するのは **契約**だけ（つなぎは `judge-api.ts`）:
 *  - 観点は 教材が 持ち、そのまま AIへ 渡る（問いごとの ものさし・2026-08-31 の 指定）
 *  - お手本は **見本**として 渡す（学習者の 文を お手本に 置きかえさせない）
 *  - 学習者が 読む ことばの 漢字は **一覧の ことばだけ**（AIの 返事には ルビを 足せない）
 *  - 知らない 観点は 落とす。1つも 返らなければ「見て もらえなかった」に する
 */

const CONTEXT: QuizReviewContext = {
  question: "Slackの メッセージを 書いて ください。",
  scene: "テスト用の URLが 変わった。",
  model: "お疲れさまです。テスト用の URLが 変わりました。",
  note: "",
  checks: [
    { id: "ketsuron", label: "1行目で 何の 連絡かが 分かる" },
    { id: "ryouhou", label: "変更前と 変更後が 両方 書いて ある" },
  ],
  written: "URLかわった",
};

describe("AIへの 頼み", () => {
  it("観点・お手本・学習者の 文を そのまま 渡す", () => {
    const prompt = buildQuizReviewPrompt(CONTEXT);
    expect(prompt).toContain("- ketsuron: 1行目で 何の 連絡かが 分かる");
    expect(prompt).toContain("- ryouhou: 変更前と 変更後が 両方 書いて ある");
    expect(prompt).toContain("お疲れさまです。テスト用の URLが 変わりました。");
    expect(prompt).toContain("URLかわった");
    expect(prompt).toContain("場面の メモ");
  });

  it("お手本で 置きかえさせない（学習者の ことばを 残して 直す）", () => {
    expect(buildQuizReviewPrompt(CONTEXT)).toContain("学生の 文を お手本に 置きかえない");
  });

  it("学習者が 読む ことばの 漢字を 一覧に しばる（ルビを 足せない ため）", () => {
    const prompt = buildQuizReviewPrompt(CONTEXT);
    expect(prompt).toContain(AI_KANJI_WORDS[0]);
    expect(prompt).toContain("ひらがな");
  });

  it("漢字が 混ざった ときの 2回目は、混ざって いたと 伝える（同じ 頼みを くり返さない）", () => {
    const again = buildQuizReviewPrompt(CONTEXT, true);
    expect(again).toContain("さっきの 返事に");
    expect(buildQuizReviewPrompt(CONTEXT)).not.toContain("さっきの 返事に");
  });

  it("道具は ブラッシュアップで 中身を 足させない", () => {
    const tool = QUIZ_REVIEW_TOOL.functionDeclarations[0]?.parameters.properties.polished;
    expect(tool?.description).toContain("書いて いない 中身");
  });
});

describe("AIの 返事の 読み取り", () => {
  const args = {
    ok: true,
    checks: [
      { id: "ketsuron", ok: true, note: "はじめに URLの 連絡だと 書いて あります。" },
      { id: "ryouhou", ok: false, note: "まえの URLも 書きましょう。" },
      { id: "shiranai", ok: true, note: "これは 教材に 無い 観点" },
    ],
    good: "みじかく 書けて います。",
    advice: "まえの URLを 足しましょう。",
    polished: "おつかれさまです。テストの URLが かわりました。",
  };

  it("教材の 観点だけを 通す（知らない id は 落とす）", () => {
    const review = parseQuizReview(args, CONTEXT.checks);
    expect(review?.checks.map((check) => check.id)).toEqual(["ketsuron", "ryouhou"]);
    expect(review?.ok).toBe(true);
    expect(review?.polished).toContain("テストの URLが かわりました");
  });

  it("同じ 観点が 2回 来ても 1つに する", () => {
    const twice = { ...args, checks: [...args.checks, args.checks[0]] };
    expect(parseQuizReview(twice, CONTEXT.checks)?.checks).toHaveLength(2);
  });

  it("「なし」「null」の ような 字は 空に する（画面に「アドバイス / なし」を 出さない）", () => {
    const empty = { ...args, advice: "なし", good: "null" };
    const review = parseQuizReview(empty, CONTEXT.checks);
    expect(review?.advice).toBe("");
    expect(review?.good).toBe("");
  });

  it("形が 崩れて いたら「見て もらえなかった」に する（にせの ⭕を 出さない）", () => {
    expect(parseQuizReview(null, CONTEXT.checks)).toBeNull();
    expect(parseQuizReview({ ok: true, checks: [] }, CONTEXT.checks)).toBeNull();
    // 教材に 無い 観点 しか 返らなかった ときも 同じ
    expect(parseQuizReview({ checks: [{ id: "x", ok: true }] }, CONTEXT.checks)).toBeNull();
  });

  it("ok は true の ときだけ true（言わなかった ことを ⭕に しない）", () => {
    expect(parseQuizReview({ ...args, ok: undefined }, CONTEXT.checks)?.ok).toBe(false);
  });
});
