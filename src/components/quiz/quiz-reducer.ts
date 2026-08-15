/**
 * 問題エンジンの状態機械（純関数）
 *
 * 問題の種類は旧アプリ「まなびの島」から引き継ぐ（4択・気持ち2段階・自由入力・
 * 語群穴埋め・複数選択）。実装とデザインは新テーマで作り直している。
 *
 * 判定はすべて共有の normalize.ts を通す。旧実装のように「accept」に表記ゆれを
 * 人力で並べる必要はない。
 */

import type { QuizQuestion, QuizSet } from "@/content/schema";
import { INPUT_ISSUE_FEEDBACK, type FeedbackKey } from "@/lib/feedback";
import { answerMatches, inspectReadingInput } from "@/lib/text/normalize";

export type QuizPhase =
  /** 出題中（emotion は1段階目の「気持ち」を聞いている）。 */
  | {
      readonly kind: "ask";
      /**
       * 回答としては受け取らず、入力の直しだけをお願いしている状態。
       * IME が英語のままなど「答えは分かっているのに打てない」ときに使う。
       */
      readonly inputIssue?: FeedbackKey;
    }
  /** emotion の2段階目。気持ちが分かったうえで「言い方」を聞く。 */
  | { readonly kind: "emotionReply"; readonly feelingOk: boolean }
  | {
      readonly kind: "explain";
      readonly correct: boolean;
      readonly feedback: FeedbackKey;
      /** 自由入力のとき、学習者が書いた文字（「あなたの こたえ」に出す）。 */
      readonly input?: string;
    }
  | { readonly kind: "finished" };

export interface QuizResult {
  readonly questionId: string;
  readonly correct: boolean;
  readonly earned: number;
}

export interface QuizState {
  readonly setId: string;
  readonly passRate: number;
  readonly questions: readonly QuizQuestion[];
  readonly index: number;
  readonly phase: QuizPhase;
  readonly results: readonly QuizResult[];
}

export type QuizAction =
  | { readonly type: "answerChoice"; readonly index: number }
  | { readonly type: "answerMulti"; readonly indexes: readonly number[] }
  | { readonly type: "answerKeyword"; readonly input: string }
  /** 「こたえを 見る」。点は入らないが解説へ進む（分からないまま止まらせない）。 */
  | { readonly type: "skipKeyword" }
  | { readonly type: "answerWordbank"; readonly filled: readonly (string | null)[] }
  | { readonly type: "answerFeeling"; readonly index: number }
  | { readonly type: "answerReply"; readonly index: number }
  | { readonly type: "next" };

export function createQuizSession(set: QuizSet, questions = set.questions): QuizState {
  return {
    setId: set.id,
    passRate: set.passRate,
    questions,
    index: 0,
    phase: questions.length === 0 ? { kind: "finished" } : { kind: "ask" },
    results: [],
  };
}

export function currentQuestion(state: QuizState): QuizQuestion | null {
  return state.questions[state.index] ?? null;
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  const question = currentQuestion(state);
  if (!question || state.phase.kind === "finished") return state;

  switch (action.type) {
    case "answerChoice":
      if (state.phase.kind !== "ask" || question.type !== "choose") return state;
      return close(state, question, action.index === question.answer);

    case "answerMulti": {
      if (state.phase.kind !== "ask" || question.type !== "multi") return state;
      const picked = [...action.indexes].sort((a, b) => a - b);
      const expected = [...question.answers].sort((a, b) => a - b);
      const correct =
        picked.length === expected.length && picked.every((v, i) => v === expected[i]);
      // 一部だけ合っているときは「あと すこし」に寄せる
      const partial = !correct && picked.some((v) => expected.includes(v));
      return close(
        state,
        question,
        correct,
        partial ? "quiz.partial" : undefined,
        undefined,
        multiPoints(picked, expected, question.points, correct),
      );
    }

    case "answerKeyword": {
      if (state.phase.kind !== "ask" || question.type !== "keyword") return state;
      if (!action.input.trim()) return state;
      const correct = answerMatches(action.input, [question.answer, ...question.accept]);

      // IME が英語のままの取りこぼしを救う。**必ず判定を済ませてから**見る——
      // accept には「AUPP」「Japanese IT Pathway」のようなラテン文字の正解があり、
      // 先に弾くと正解を「打ち直して」と突き返すことになる。
      // ここでは回答を消費しない（1問を IME のせいで失わせない）。
      if (!correct && inspectReadingInput(action.input) === "latin") {
        return { ...state, phase: { kind: "ask", inputIssue: INPUT_ISSUE_FEEDBACK.latin } };
      }
      return close(state, question, correct, undefined, action.input);
    }

    case "skipKeyword": {
      if (state.phase.kind !== "ask" || question.type !== "keyword") return state;
      // 分からないときの逃げ道。点は入らないが、解説を読んで次へ行ける。
      return close(state, question, false);
    }

    case "answerWordbank": {
      if (state.phase.kind !== "ask" || question.type !== "wordbank") return state;
      const correct =
        action.filled.length === question.blanks.length &&
        question.blanks.every((expected, i) => action.filled[i] === expected);
      const partial =
        !correct && question.blanks.some((expected, i) => action.filled[i] === expected);
      return close(state, question, correct, partial ? "quiz.partial" : undefined);
    }

    case "answerFeeling": {
      if (state.phase.kind !== "ask" || question.type !== "emotion") return state;
      // 気持ちを外しても2段階目には進む。ここで止めると学びが切れる。
      return {
        ...state,
        phase: { kind: "emotionReply", feelingOk: action.index === question.answerFeeling },
      };
    }

    case "answerReply": {
      if (state.phase.kind !== "emotionReply" || question.type !== "emotion") return state;
      const replyOk = action.index === question.answerReply;
      return close(state, question, state.phase.feelingOk && replyOk);
    }

    case "next": {
      if (state.phase.kind !== "explain") return state;
      const next = state.index + 1;
      if (next >= state.questions.length) return { ...state, phase: { kind: "finished" } };
      return { ...state, index: next, phase: { kind: "ask" } };
    }

    default:
      return state;
  }
}

/**
 * 複数選択の 部分点。
 *
 * 全か無かだと、5つ中4つ 選ぶ問題で 1つ 足りないだけで 配点が まるごと 消える。
 * 画面は「あと すこし」と 言うのに 点は 0——**言っていることと 点が 食い違う**。
 * 合計が 小さい 問題セットでは、それだけで 合格の 見込みが 消える。
 *
 * 決めごとは2つ:
 *  - 誤選択は 正解1つぶんを 打ち消す（`hits - wrongs`）。打ち消さないと、
 *    ぜんぶ 選ぶのが いちばん 点の 高い 答え方になり、読まなくても 点が 入る。
 *  - **満点は そろったときだけ**。按分の 結果が 満点に 届いても 1点 下げる
 *    （そろっていないのに 満点だと、どこが 足りないのかが 点から 消える）。
 *
 * 点は 整数で 持つ（画面は「◯/◯ てん」と 出す。小数は 読む負担を 増やす）。
 * そのため 配点1点の 問題は 割れず、これまでどおり 満点か 0 になる。
 */
function multiPoints(
  picked: readonly number[],
  expected: readonly number[],
  points: number,
  correct: boolean,
): number {
  if (correct) return points;
  const hits = picked.filter((index) => expected.includes(index)).length;
  const wrongs = picked.length - hits;
  const ratio = Math.max(0, hits - wrongs) / expected.length;
  return Math.min(points - 1, Math.floor(points * ratio));
}

function close(
  state: QuizState,
  question: QuizQuestion,
  correct: boolean,
  missFeedback: FeedbackKey = "quiz.review",
  /** 自由入力のときだけ渡す（解説で「あなたの こたえ」を見せるため）。 */
  input?: string,
  /** 部分点があるとき（複数選択）だけ渡す。省略すると 全か無か。 */
  earned = correct ? question.points : 0,
): QuizState {
  return {
    ...state,
    results: [...state.results, { questionId: question.id, correct, earned }],
    phase: {
      kind: "explain",
      correct,
      feedback: correct ? "quiz.correct" : missFeedback,
      ...(input === undefined ? {} : { input }),
    },
  };
}

export interface QuizSummary {
  readonly total: number;
  readonly correct: number;
  readonly earned: number;
  readonly maxPoints: number;
  readonly passed: boolean;
  readonly missedQuestionIds: readonly string[];
}

export function summarizeQuiz(state: QuizState): QuizSummary {
  const answered = state.results.length;
  const correct = state.results.filter((r) => r.correct).length;
  const earned = state.results.reduce((sum, r) => sum + r.earned, 0);
  const maxPoints = state.questions.slice(0, answered).reduce((sum, q) => sum + q.points, 0);
  return {
    total: answered,
    correct,
    earned,
    maxPoints,
    passed: maxPoints > 0 && (earned / maxPoints) * 100 >= state.passRate,
    missedQuestionIds: state.results.filter((r) => !r.correct).map((r) => r.questionId),
  };
}
