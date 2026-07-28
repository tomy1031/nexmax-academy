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
import type { FeedbackKey } from "@/lib/feedback";
import { answerMatches } from "@/lib/text/normalize";

export type QuizPhase =
  /** 出題中（emotion は1段階目の「気持ち」を聞いている）。 */
  | { readonly kind: "ask" }
  /** emotion の2段階目。気持ちが分かったうえで「言い方」を聞く。 */
  | { readonly kind: "emotionReply"; readonly feelingOk: boolean }
  | { readonly kind: "explain"; readonly correct: boolean; readonly feedback: FeedbackKey }
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
      return close(state, question, correct, partial ? "quiz.partial" : undefined);
    }

    case "answerKeyword": {
      if (state.phase.kind !== "ask" || question.type !== "keyword") return state;
      if (!action.input.trim()) return state;
      return close(
        state,
        question,
        answerMatches(action.input, [question.answer, ...question.accept]),
      );
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

function close(
  state: QuizState,
  question: QuizQuestion,
  correct: boolean,
  missFeedback: FeedbackKey = "quiz.review",
): QuizState {
  return {
    ...state,
    results: [
      ...state.results,
      { questionId: question.id, correct, earned: correct ? question.points : 0 },
    ],
    phase: {
      kind: "explain",
      correct,
      feedback: correct ? "quiz.correct" : missFeedback,
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
