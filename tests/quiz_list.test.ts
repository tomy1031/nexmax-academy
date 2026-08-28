import { describe, expect, it } from "vitest";
import { quizQuestionSchema, type QuizQuestion } from "@/content/schema";
import { correctAnswerText, draftAnswered, gradeDraft, type QuizDraft } from "@/lib/quiz/draft";

/**
 * 順不同の 入力（`list`）— 「5つの サービスを 書いて ください」
 *
 * ## なぜ 語群では 足りなかったか
 * 語群（`wordbank`）は 並んだ ふだから えらぶので、**サイトを 見なくても
 * 消去法で 当たる**。配布資料の 調査シートは 5つの 空欄に 自分で 打たせて いた——
 * 名前を 思い出して 打つ ところまでが この 問いの ねらいで ある
 *（2026-08-27 の 指定「5つのサービス：入力問題にして（順不同をOKとする）」）。
 *
 * 見張るのは 3つ。
 *  1. **どの 欄に 書いても よい**（順を 見ない）
 *  2. 同じ ことばを 2つの 欄に 書いても 1つ ぶんに しか ならない
 *  3. 表記ゆれは `normalize.ts` が 吸収する（辞書に 全部 並べなくてよい）
 */

const SERVICES: QuizQuestion = {
  id: "q5",
  type: "list",
  q: "5つの サービスを 書いて ください",
  explain: "5つです。",
  points: 1,
  groups: [
    { label: "NMClaw", accept: ["エヌエムクロー"] },
    { label: "観光DX", accept: ["かんこうDX"] },
    { label: "Verify", accept: ["ベリファイ"] },
    { label: "セキュリティドローン", accept: [] },
    { label: "NEXTMAKE Internship Lab", accept: ["Internship Lab"] },
  ],
  placeholders: ["1", "2", "3", "4", "5"],
};

const draft = (...inputs: string[]): QuizDraft => ({ kind: "list", inputs });

describe("順不同の 入力の 形", () => {
  it("スキーマを 通る", () => {
    expect(quizQuestionSchema.safeParse(SERVICES).success).toBe(true);
  });

  it("こたえは 2つ 未満に できない（1つなら keyword で 足りる）", () => {
    const one = { ...SERVICES, groups: [{ label: "NMClaw", accept: [] }] };
    expect(quizQuestionSchema.safeParse(one).success).toBe(false);
  });
});

describe("順不同の 採点", () => {
  it("並びが ちがっても 正解（サイトの 並びを おぼえる 問いでは ない）", () => {
    const graded = gradeDraft(
      SERVICES,
      draft("Verify", "NEXTMAKE Internship Lab", "NMClaw", "セキュリティドローン", "観光DX"),
    );
    expect(graded.correct).toBe(true);
    expect(graded.earned).toBe(SERVICES.points);
  });

  it("表記ゆれと 別名で 通る", () => {
    const graded = gradeDraft(
      SERVICES,
      draft("エヌエムクロー", "かんこうdx", "ベリファイ", "せきゅりてぃどろーん", "Internship Lab"),
    );
    expect(graded.correct).toBe(true);
  });

  /*
   * ここが いちばん だいじ。同じ ことばを 5つの 欄に 打てば 通る、では
   * **調べなくても 満点**に なる。まとまり単位で 数える ことで 防ぐ。
   */
  it("同じ ことばを ならべても 1つ ぶんに しか ならない", () => {
    const graded = gradeDraft(SERVICES, draft("NMClaw", "NMClaw", "NMClaw", "NMClaw", "NMClaw"));
    expect(graded.correct).toBe(false);
    expect(graded.partial).toBe(true);
  });

  it("足りない ぶんは「あと すこし」に なる（0点だが 責めない）", () => {
    const graded = gradeDraft(SERVICES, draft("NMClaw", "観光DX", "", "", ""));
    expect(graded.correct).toBe(false);
    expect(graded.earned).toBe(0);
    expect(graded.partial).toBe(true);
  });

  it("1つも 書いて いなければ「まだ」（0点・あと すこしにも しない）", () => {
    expect(draftAnswered(SERVICES, draft("", "", "", "", ""))).toBe(false);
    const graded = gradeDraft(SERVICES, draft("", "", "", "", ""));
    expect(graded.partial).toBe(false);
    expect(graded.answer).toBe("");
  });

  it("1つでも 書けば「こたえた」に 数える", () => {
    expect(draftAnswered(SERVICES, draft("NMClaw", "", "", "", ""))).toBe(true);
  });

  it("けっかには 番号つきで 書いた ものが 並ぶ", () => {
    expect(gradeDraft(SERVICES, draft("NMClaw", "観光DX", "", "", "")).answer).toContain(
      "（1）NMClaw",
    );
  });

  it("正解の 見せ方は 代表の 書き方を 並べる", () => {
    expect(correctAnswerText(SERVICES)).toBe(
      "NMClaw ／ 観光DX ／ Verify ／ セキュリティドローン ／ NEXTMAKE Internship Lab",
    );
  });
});
