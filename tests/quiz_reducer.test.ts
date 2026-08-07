import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quizSetSchema, type QuizSet } from "../src/content/schema";
import {
  createQuizSession,
  currentQuestion,
  quizReducer,
  summarizeQuiz,
  type QuizAction,
  type QuizState,
} from "../src/components/quiz/quiz-reducer";

function loadSet(): QuizSet {
  const raw = readFileSync(
    join(__dirname, "..", "content", "quizsets", "sample_horenso.json"),
    "utf8",
  );
  return quizSetSchema.parse(JSON.parse(raw));
}

const set = loadSet();

function run(state: QuizState, actions: QuizAction[]): QuizState {
  return actions.reduce(quizReducer, state);
}

/** その問題の正しい答えを出す（型ごとの正解の形）。 */
function answerCorrectly(state: QuizState): QuizState {
  const q = currentQuestion(state);
  if (!q) return state;
  switch (q.type) {
    case "choose":
      return quizReducer(state, { type: "answerChoice", index: q.answer });
    case "multi":
      return quizReducer(state, { type: "answerMulti", indexes: q.answers });
    case "keyword":
      return quizReducer(state, { type: "answerKeyword", input: q.answer });
    case "wordbank":
      return quizReducer(state, { type: "answerWordbank", filled: q.blanks });
    case "emotion":
      return run(state, [
        { type: "answerFeeling", index: q.answerFeeling },
        { type: "answerReply", index: q.answerReply },
      ]);
  }
}

describe("問題エンジンの状態機械", () => {
  it("解説をはさんで次の問題へ進む", () => {
    let s = createQuizSession(set);
    expect(s.phase.kind).toBe("ask");
    s = answerCorrectly(s);
    expect(s.phase.kind).toBe("explain");
    s = quizReducer(s, { type: "next" });
    expect(s.index).toBe(1);
    expect(s.phase.kind).toBe("ask");
  });

  it("気持ち→言い方の2段階になっている", () => {
    const emotionIndex = set.questions.findIndex((q) => q.type === "emotion");
    let s = createQuizSession(set, [set.questions[emotionIndex]!]);
    const q = set.questions[emotionIndex]!;
    if (q.type !== "emotion") throw new Error("emotion 問題が見つからない");

    s = quizReducer(s, { type: "answerFeeling", index: q.answerFeeling });
    expect(s.phase).toEqual({ kind: "emotionReply", feelingOk: true });
    expect(s.results).toHaveLength(0); // まだ採点しない

    s = quizReducer(s, { type: "answerReply", index: q.answerReply });
    expect(s.phase.kind).toBe("explain");
    expect(s.results[0]?.correct).toBe(true);
  });

  it("気持ちを外しても2段階目には進む（学びを切らない）", () => {
    const q = set.questions.find((x) => x.type === "emotion")!;
    if (q.type !== "emotion") throw new Error("emotion 問題が見つからない");
    const wrongFeeling = (q.answerFeeling + 1) % q.feelings.length;

    let s = createQuizSession(set, [q]);
    s = quizReducer(s, { type: "answerFeeling", index: wrongFeeling });
    expect(s.phase).toEqual({ kind: "emotionReply", feelingOk: false });

    s = quizReducer(s, { type: "answerReply", index: q.answerReply });
    expect(s.results[0]?.correct).toBe(false); // 両方そろって正解
  });

  it("自由入力は表記ゆれを吸収する（accept に並べなくてよい）", () => {
    const q = set.questions.find((x) => x.type === "keyword")!;
    let s = createQuizSession(set, [q]);
    // カタカナで打っても、ひらがなの別解と同じものとして扱う
    s = quizReducer(s, { type: "answerKeyword", input: "ホウレンソウ" });
    expect(s.results[0]?.correct).toBe(true);
  });

  it("空の自由入力は回答として受け付けない", () => {
    const q = set.questions.find((x) => x.type === "keyword")!;
    const s0 = createQuizSession(set, [q]);
    expect(quizReducer(s0, { type: "answerKeyword", input: "  " })).toBe(s0);
  });

  it("複数選択は組み合わせがそろって正解、一部だけなら「あと すこし」", () => {
    const q = set.questions.find((x) => x.type === "multi")!;
    if (q.type !== "multi") throw new Error("multi 問題が見つからない");

    const partial = quizReducer(createQuizSession(set, [q]), {
      type: "answerMulti",
      indexes: [q.answers[0]!],
    });
    expect(partial.results[0]?.correct).toBe(false);
    expect(partial.phase).toMatchObject({ feedback: "quiz.partial" });

    // 順番が違っても正解にする
    const reversed = quizReducer(createQuizSession(set, [q]), {
      type: "answerMulti",
      indexes: [...q.answers].reverse(),
    });
    expect(reversed.results[0]?.correct).toBe(true);
  });

  it("語群穴埋めは全部そろって正解", () => {
    const q = set.questions.find((x) => x.type === "wordbank")!;
    if (q.type !== "wordbank") throw new Error("wordbank 問題が見つからない");

    const missing = quizReducer(createQuizSession(set, [q]), {
      type: "answerWordbank",
      filled: [q.blanks[0]!, null, null],
    });
    expect(missing.results[0]?.correct).toBe(false);

    const filled = quizReducer(createQuizSession(set, [q]), {
      type: "answerWordbank",
      filled: q.blanks,
    });
    expect(filled.results[0]?.correct).toBe(true);
  });

  it("全問正解なら満点で合格し、まちがえた問題は残らない", () => {
    let s = createQuizSession(set);
    while (s.phase.kind !== "finished") {
      s = s.phase.kind === "explain" ? quizReducer(s, { type: "next" }) : answerCorrectly(s);
    }
    const summary = summarizeQuiz(s);
    expect(summary.total).toBe(set.questions.length);
    expect(summary.correct).toBe(set.questions.length);
    expect(summary.earned).toBe(summary.maxPoints);
    expect(summary.passed).toBe(true);
    expect(summary.missedQuestionIds).toEqual([]);
  });

  it("解説を見ずに次の問題へ飛べない", () => {
    const s = createQuizSession(set);
    expect(quizReducer(s, { type: "next" })).toBe(s);
  });
});

describe("問題セットのスキーマ（検収の契約）", () => {
  it("産出フェーズには選択式を置けない（規律3）", () => {
    const production = { ...set, phase: "production" as const };
    const parsed = quizSetSchema.safeParse(production);
    expect(parsed.success).toBe(false);
  });

  it("空欄の数と blanks の数が合わないと弾く", () => {
    const broken = structuredClone(set) as unknown as {
      questions: { type: string; blanks?: string[] }[];
    };
    const wordbank = broken.questions.find((q) => q.type === "wordbank")!;
    wordbank.blanks = wordbank.blanks!.slice(0, 1);
    expect(quizSetSchema.safeParse(broken).success).toBe(false);
  });

  it("語群に まぎらわしい語がないと弾く", () => {
    const broken = structuredClone(set) as unknown as {
      questions: { type: string; blanks?: string[]; bank?: string[] }[];
    };
    const wordbank = broken.questions.find((q) => q.type === "wordbank")!;
    wordbank.bank = [...wordbank.blanks!];
    expect(quizSetSchema.safeParse(broken).success).toBe(false);
  });

  it("すべてが正解の複数選択は弾く", () => {
    const broken = structuredClone(set) as unknown as {
      questions: { type: string; options?: string[]; answers?: number[] }[];
    };
    const multi = broken.questions.find((q) => q.type === "multi")!;
    multi.answers = multi.options!.map((_, i) => i);
    expect(quizSetSchema.safeParse(broken).success).toBe(false);
  });
});
