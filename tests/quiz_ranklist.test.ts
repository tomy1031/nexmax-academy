import { describe, expect, it } from "vitest";
import { quizQuestionSchema, quizSetSchema, type QuizQuestion } from "@/content/schema";
import {
  correctAnswerText,
  draftAnswered,
  draftFits,
  gradeDraft,
  hasNoRightAnswer,
  quizDraftSchema,
  type QuizDraft,
} from "@/lib/quiz/draft";
import { readQuizResume, saveQuizResume, type QuizResume } from "@/lib/quiz/resume";
import { createMemoryBackend } from "@/lib/progress/store";
import { createQuizSession, quizReducer, summarizeQuiz } from "@/components/quiz/quiz-reducer";

/**
 * じゅんばんに ならべて 書く（`ranklist`）— 行を ふやして・消して・↑↓で ならべかえる
 *
 * 2026-09-18 の 指定「自分でいくらでも追加できる回答コンポーネント。人によって
 * 20でも30でも階級が作れるように」。**正解は 無い**（同日「採点しない」）。
 *
 * 見張るのは 4つ。
 *  1. 書いた 行を 上から 番号つきで 残す（空の 行は 詰める）——先生の 画面で 読める
 *  2. 1行でも 書けば「こたえた」・点が 入る。空の 行だけなら まだ
 *  3. 正解を 見せない（`correctAnswerText` が 空）・けっかで「せいかい」と 言わない
 *  4. 行の 数が 多くても 下書きが 消えない（保存の 形に 上限を 付けない）
 */

const RANKS = quizQuestionSchema.parse({
  id: "kaikyuu_order",
  type: "ranklist",
  q: "日本の 会社の 階級を、えらい 順に ならべて ください。",
  explain: "つぎの ページで 答え合わせを します。",
  topLabel: "↑ いちばん えらい",
  bottomLabel: "↓ いちばん 下",
  placeholder: "ここに 書く",
}) as Extract<QuizQuestion, { type: "ranklist" }>;

const rows = (...values: string[]): QuizDraft => ({ kind: "ranklist", rows: values });

describe("じゅんばんに ならべて 書く の 形", () => {
  it("さいしょは 5行・上限は 50行（人に よって 20でも 30でも 書ける）", () => {
    expect(RANKS.start).toBe(5);
    expect(RANKS.max).toBe(50);
  });

  it("さいしょの 行が 上限より 多い 教材は 止める", () => {
    const broken = { ...RANKS, start: 10, max: 5 };
    expect(quizQuestionSchema.safeParse(broken).success).toBe(false);
  });

  it("産出フェーズ（自分で 日本語を 出す）に 置ける（選択式では ない）", () => {
    const set = quizSetSchema.safeParse({
      kind: "quizset",
      id: "t",
      title: "しらべる",
      description: "しらべる",
      phase: "production",
      questions: [RANKS],
    });
    expect(set.success).toBe(true);
  });
});

describe("こたえの 数えかた", () => {
  it("空の 行だけなら まだ こたえて いない", () => {
    expect(draftAnswered(RANKS, rows("", "  ", ""))).toBe(false);
    expect(draftAnswered(RANKS, undefined)).toBe(false);
  });

  it("1行でも 書けば こたえた（いくつ 書くかは 人に よって ちがう）", () => {
    expect(draftAnswered(RANKS, rows("", "社長", ""))).toBe(true);
  });

  it("書いた 行を 上から 番号つきで 残し、空の 行は 詰める", () => {
    const graded = gradeDraft(RANKS, rows(" 社長 ", "", "取締役", "部長"));
    expect(graded.answer).toBe("（1）社長　（2）取締役　（3）部長");
    expect(graded.correct).toBe(true);
    expect(graded.earned).toBe(RANKS.points);
    expect(graded.partial).toBe(false);
  });

  it("30行でも そのまま 残す", () => {
    const many = Array.from({ length: 30 }, (_, i) => `役職${i + 1}`);
    const graded = gradeDraft(RANKS, { kind: "ranklist", rows: many });
    expect(graded.answer.split("　")).toHaveLength(30);
    expect(graded.answer.endsWith("（30）役職30")).toBe(true);
  });

  it("何も 書かずに 出したら 0点の 見送り（行は 残す）", () => {
    expect(gradeDraft(RANKS, rows("", ""))).toEqual({
      correct: false,
      earned: 0,
      answer: "",
      partial: false,
    });
  });

  it("正解は 見せない（自分の 並びが まちがいに 見えない）", () => {
    expect(correctAnswerText(RANKS)).toBe("");
    expect(hasNoRightAnswer(RANKS)).toBe(true);
  });

  it("前に 自由記述だった ころの 下書きは 使わない（形が ちがう）", () => {
    expect(draftFits(RANKS, { kind: "free", input: "社長　部長" })).toBe(false);
    expect(draftFits(RANKS, rows("社長"))).toBe(true);
  });
});

describe("下書きが 消えない", () => {
  it("行の 数が 多くても 保存の 形を 通る（上限を 付けない）", () => {
    const many = Array.from({ length: 80 }, (_, i) => `r${i}`);
    expect(quizDraftSchema.safeParse({ kind: "ranklist", rows: many }).success).toBe(true);
  });

  it("ぜんぶ 1ページで 書いた 並びを、そのまま 読み戻せる", () => {
    const saved: QuizResume = {
      quizSetId: "houkoku_search_quiz",
      results: [],
      mode: "all",
      drafts: {
        kaikyuu_order: { kind: "ranklist", rows: ["社長", "取締役", "", "部長"] },
        kaikyuu: { kind: "free", input: "CEO" },
      },
      index: 0,
      checked: {},
    };
    const backend = createMemoryBackend();
    saveQuizResume(saved, backend);
    expect(readQuizResume("houkoku_search_quiz", backend)).toEqual(saved);
  });
});

describe("問題エンジンの 中で", () => {
  const set = quizSetSchema.parse({
    kind: "quizset",
    id: "t",
    title: "しらべる",
    description: "しらべる",
    phase: "production",
    answerMode: "all",
    questions: [RANKS],
  });

  it("書いた 並びを 下書きに 置き、出すと 1問 書けた ことに なる", () => {
    let state = createQuizSession(set, set.questions, "all");
    state = quizReducer(state, {
      type: "answerRanklist",
      rows: ["社長", "部長"],
      questionId: RANKS.id,
    });
    expect(state.drafts[RANKS.id]).toEqual({ kind: "ranklist", rows: ["社長", "部長"] });
    state = quizReducer(state, { type: "submit" });
    const summary = summarizeQuiz(state);
    expect(summary.correct).toBe(1);
    expect(state.results[0]?.answer).toBe("（1）社長　（2）部長");
  });

  it("ほかの 型の 問いには 置かない", () => {
    const free: QuizQuestion = {
      id: "f",
      type: "free",
      q: "なぜ？",
      explain: "。",
      points: 1,
      minLength: 1,
    };
    const other = quizSetSchema.parse({ ...set, questions: [free] });
    const state = quizReducer(createQuizSession(other, other.questions, "all"), {
      type: "answerRanklist",
      rows: ["社長"],
      questionId: "f",
    });
    expect(state.drafts.f).toBeUndefined();
  });
});
