import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quizSetSchema, type QuizSet } from "../src/content/schema";
import {
  answeredCount,
  createQuizSession,
  currentQuestion,
  quizReducer,
  resumeQuizSession,
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

/**
 * ラテン文字の正解を持つ問題（「AUPP」「Japanese IT Pathway」等）。
 * 実データを名指しすると、教材が直された日にこの検査が消える。契約だけを固定する。
 */
const latinAnswerSet: QuizSet = quizSetSchema.parse({
  kind: "quizset",
  id: "latin_accept_fixture",
  title: "ラテン文字の こたえ",
  description: "IMEの 注意より 判定が 先に 来ることを 見る",
  questions: [
    {
      id: "q_latin",
      type: "keyword",
      q: "プログラムの 名前は なに？",
      explain: "Japanese IT Pathway は 日本語と ITを いっしょに 学ぶ プログラム。",
      answer: "Japanese IT Pathway",
      accept: ["AUPP"],
    },
  ],
});

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
    expect(s.phase).toEqual({
      kind: "emotionReply",
      feelingOk: true,
      feelingIndex: q.answerFeeling,
    });
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
    expect(s.phase).toEqual({
      kind: "emotionReply",
      feelingOk: false,
      feelingIndex: wrongFeeling,
    });

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

  /**
   * **そろって いる ときだけ 点が 入る**（2026-08-19 ユーザー指定）。
   * 按分すると、5択4正解の ような 形では ぜんぶ 選ぶだけで 半分の 点が 入り、
   * 読まなくても 点が 取れて しまう。一部だけ 合って いる ことは 言い方で 返す。
   */
  it("複数選択は そろった ときだけ 点が 入る（ぜんぶ 選んでも 点は 入らない）", () => {
    const q = quizSetSchema.parse({
      kind: "quizset",
      id: "multi_all_or_nothing_fixture",
      title: "ふくすう えらぶ",
      description: "そろった ときだけ 点が 入る",
      questions: [
        {
          id: "q_multi",
          type: "multi",
          q: "しらべる ときに する ことは どれですか",
          options: ["ひとつめ", "ふたつめ", "みっつめ", "よっつめ", "いつつめ"],
          answers: [0, 1, 2, 3],
          explain: "4つが どうぐです",
          points: 2,
        },
      ],
    });
    const earnedFor = (indexes: number[]) =>
      quizReducer(createQuizSession(q), { type: "answerMulti", indexes }).results[0]?.earned;

    expect(earnedFor([0, 1, 2, 3])).toBe(2); // そろった
    expect(earnedFor([0, 1, 2])).toBe(0); // 1つ 足りない
    expect(earnedFor([0])).toBe(0);
    // ぜんぶ 選ぶ（読まなくても できる 答え方）で 点は 入らない
    expect(earnedFor([0, 1, 2, 3, 4])).toBe(0);
    expect(earnedFor([4])).toBe(0);
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

  it("合否は 何問中 何問（％）で 決まる。画面に 出す 数と 同じ", () => {
    const q = quizSetSchema.parse({
      kind: "quizset",
      id: "percent_fixture",
      title: "わりあいの かくにん",
      description: "点では なく 問題の 数で 数える",
      passRate: 70,
      questions: [
        // 配点は ばらばら。それでも 合否は 問題の 数で 決まる
        { id: "p1", type: "keyword", q: "ひとつめ", explain: "せつめい", answer: "あ", points: 5 },
        { id: "p2", type: "keyword", q: "ふたつめ", explain: "せつめい", answer: "い", points: 1 },
        { id: "p3", type: "keyword", q: "みっつめ", explain: "せつめい", answer: "う", points: 1 },
        { id: "p4", type: "keyword", q: "よっつめ", explain: "せつめい", answer: "え", points: 1 },
      ],
    });
    // 配点の 大きい 1問だけ 落とす → 点では 3/8=37% だが、問題の 数では 3/4=75%
    let s = createQuizSession(q);
    s = run(s, [
      { type: "answerKeyword", input: "ちがう" },
      { type: "next" },
      { type: "answerKeyword", input: "い" },
      { type: "next" },
      { type: "answerKeyword", input: "う" },
      { type: "next" },
      { type: "answerKeyword", input: "え" },
      { type: "next" },
    ]);
    const summary = summarizeQuiz(s);
    expect(summary.correct).toBe(3);
    expect(summary.total).toBe(4);
    expect(summary.percent).toBe(75);
    expect(summary.passed).toBe(true);
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

describe("つづきから 復元する（resumeQuizSession）", () => {
  it("途中の 番号・結果を そのまま 積んで、出題中の 状態で 始める", () => {
    const results = [
      {
        questionId: set.questions[0]!.id,
        correct: true,
        earned: set.questions[0]!.points,
        answer: "はい",
      },
      { questionId: set.questions[1]!.id, correct: false, earned: 0, answer: "いいえ" },
    ];
    const s = resumeQuizSession(set, 2, results);
    expect(s.index).toBe(2);
    expect(s.phase).toEqual({ kind: "ask" });
    expect(s.results).toEqual(results);
    expect(currentQuestion(s)).toBe(set.questions[2]);
  });

  it("答えて いない 状態は createQuizSession と 同じ 形になる", () => {
    expect(resumeQuizSession(set, 0, [])).toEqual(createQuizSession(set));
  });

  /**
   * しおり（位置）だけが 残って いた 回は、**答えた 問題と 出題順の 先頭が ずれる**。
   * 満点を「先頭から N問」で 数えると、配点の ちがう 教材では 取った 点が 満点を
   * 超える（「6 / 5 てん」で 合格！ と 出る）。満点は **答えた 問題の 配点**で 数える。
   */
  it("途中から 始めた 回でも、満点は 答えた 問題の 配点で 数える", () => {
    let s = resumeQuizSession(set, 1, []);
    while (currentQuestion(s)) {
      s = answerCorrectly(s);
      s = quizReducer(s, { type: "next" });
      if (s.phase.kind === "finished") break;
    }
    const summary = summarizeQuiz(s);
    const answered = set.questions.slice(1).reduce((sum, q) => sum + q.points, 0);
    expect(summary.maxPoints).toBe(answered);
    expect(summary.earned).toBe(answered);
    expect(summary.earned).toBeLessThanOrEqual(summary.maxPoints);
  });
});

describe("自由入力の救済（IME・こたえを見る）", () => {
  const keyword = set.questions.find((x) => x.type === "keyword")!;

  it("ローマ字のままなら回答を消費せず、入力の直しだけをお願いする", () => {
    const s = quizReducer(createQuizSession(set, [keyword]), {
      type: "answerKeyword",
      input: "horenso",
    });
    expect(s.phase).toEqual({ kind: "ask", inputIssue: "reading.hasLatin" });
    expect(s.results).toHaveLength(0); // 1問を IME のせいで失わせない
  });

  it("次の入力で 入力の注意は消える", () => {
    let s = quizReducer(createQuizSession(set, [keyword]), {
      type: "answerKeyword",
      input: "horenso",
    });
    s = quizReducer(s, { type: "answerKeyword", input: "ほうれんそう" });
    expect(s.phase).toMatchObject({ kind: "explain", correct: true });
  });

  it("ラテン文字の正解は先に正解として通す（IMEの注意より判定が先）", () => {
    const s0 = createQuizSession(latinAnswerSet);
    expect(quizReducer(s0, { type: "answerKeyword", input: "AUPP" }).phase).toMatchObject({
      kind: "explain",
      correct: true,
    });
    expect(
      quizReducer(s0, { type: "answerKeyword", input: "Japanese IT Pathway" }).phase,
    ).toMatchObject({ kind: "explain", correct: true });
  });

  it("書いた文字を解説に持っていく（「あなたの こたえ」に出すため）", () => {
    const s = quizReducer(createQuizSession(set, [keyword]), {
      type: "answerKeyword",
      input: "ホウレンソウ",
    });
    expect(s.phase).toMatchObject({ kind: "explain", answer: "ホウレンソウ" });
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

describe("back（まえの もんだいを 読み直す）", () => {
  /** 2問 答えて 3問目に いる 状態。 */
  const afterTwo = () => {
    let state = createQuizSession(set);
    for (let i = 0; i < 2; i += 1) {
      state = answerCorrectly(state);
      state = quizReducer(state, { type: "next" });
    }
    return state;
  };

  it("1問目では 戻らない", () => {
    const state = createQuizSession(set);
    expect(quizReducer(state, { type: "back" })).toBe(state);
  });

  it("戻ると 前の問題の 解説が 出る（点も 記録も 動かない）", () => {
    const state = afterTwo();
    const back = quizReducer(state, { type: "back" });
    expect(back.index).toBe(1);
    expect(back.phase.kind).toBe("explain");
    expect(back.results).toEqual(state.results);
  });

  it("戻って つぎへ を 押しても、同じ問題を もう一度 答えさせない", () => {
    // ここが 壊れると 1問の 記録が 2行 でき、先生の 見る 正答率が 狂う
    const state = afterTwo();
    const returned = run(state, [{ type: "back" }, { type: "next" }]);
    expect(returned.index).toBe(2);
    expect(returned.results).toHaveLength(2);
  });

  it("2つ 戻って 2つ 進むと、もとの 場所に 帰る", () => {
    const state = afterTwo();
    const round = run(state, [
      { type: "back" },
      { type: "back" },
      { type: "next" },
      { type: "next" },
    ]);
    expect(round.index).toBe(state.index);
    expect(round.results).toEqual(state.results);
  });

  it("答えて いない ところへは 戻らない（しおりで 途中から 始めた とき）", () => {
    const resumed = resumeQuizSession(set, 2, []);
    expect(quizReducer(resumed, { type: "back" })).toBe(resumed);
  });
});

/**
 * まとめて 出す（提出モード）
 *
 * 1問ずつと ちがい、**出すまで 採点しない**。ここで 見張るのは 3つ:
 *  - 途中で 正誤が 漏れない（漏れたら テストの やりかたに ならない）
 *  - 行ったり 来たり しても 書いた ものが 消えない
 *  - 出した ときに **ぜんぶの 問題が 1行ずつ 残る**（書かなかった ものも 記録に 残す）
 */
describe("まとめて 出す（提出モード）", () => {
  const submitSession = (questions = set.questions) => createQuizSession(set, questions, "submit");

  it("こたえても 採点しない（解説に 行かず、下書きだけ たまる）", () => {
    const choose = set.questions.find((q) => q.type === "choose")!;
    const s = quizReducer(submitSession([choose]), { type: "answerChoice", index: 0 });
    expect(s.phase).toEqual({ kind: "ask" });
    expect(s.results).toEqual([]);
    expect(s.drafts[choose.id]).toEqual({ kind: "choice", index: 0 });
  });

  it("さいごの もんだいの つぎは「出す まえの かくにん」（いきなり 採点しない）", () => {
    let s = submitSession(set.questions.slice(0, 2));
    s = quizReducer(s, { type: "next" });
    expect(s.index).toBe(1);
    s = quizReducer(s, { type: "next" });
    expect(s.phase).toEqual({ kind: "confirm" });
    expect(s.results).toEqual([]);
  });

  it("行ったり 来たり しても 書いた ものは 消えない", () => {
    const [q1, q2] = [set.questions[0]!, set.questions[1]!];
    let s = submitSession([q1, q2]);
    s = answerCorrectly(s);
    s = run(s, [{ type: "next" }, { type: "back" }]);
    expect(s.index).toBe(0);
    expect(s.drafts[q1.id]).toBeDefined();
    // かくにん画面から その もんだいへ 飛べる
    s = run(s, [{ type: "next" }, { type: "next" }, { type: "goto", index: 0 }]);
    expect(s.phase).toEqual({ kind: "ask" });
    expect(s.index).toBe(0);
    expect(s.drafts[q1.id]).toBeDefined();
  });

  it("出した ときに ぜんぶの 問題が 1行ずつ 残る（書かなかった ものは 0点）", () => {
    const [q1, q2] = [set.questions[0]!, set.questions[1]!];
    let s = submitSession([q1, q2]);
    s = answerCorrectly(s); // 1問目だけ 書く
    s = run(s, [{ type: "next" }, { type: "next" }, { type: "submit" }]);
    expect(s.phase).toEqual({ kind: "finished" });
    expect(s.results).toHaveLength(2);
    expect(s.results[0]).toMatchObject({ questionId: q1.id, correct: true });
    expect(s.results[1]).toMatchObject({
      questionId: q2.id,
      correct: false,
      earned: 0,
      answer: "",
    });
  });

  it("点は 全問ぶんで 数える（書かなかった ぶんも 分母に 入る）", () => {
    const [q1, q2] = [set.questions[0]!, set.questions[1]!];
    let s = submitSession([q1, q2]);
    s = answerCorrectly(s);
    s = run(s, [{ type: "next" }, { type: "next" }, { type: "submit" }]);
    const summary = summarizeQuiz(s);
    expect(summary.total).toBe(2);
    expect(summary.correct).toBe(1);
    expect(summary.maxPoints).toBe(q1.points + q2.points);
    expect(summary.missedQuestionIds).toEqual([q2.id]);
  });

  it("出したら もう 動かない（出しなおしで 記録が 増えない）", () => {
    let s = submitSession(set.questions.slice(0, 1));
    s = run(s, [{ type: "next" }, { type: "submit" }]);
    const after = quizReducer(s, { type: "submit" });
    expect(after).toBe(s);
    expect(quizReducer(s, { type: "answerChoice", index: 0 })).toBe(s);
  });

  it("「こたえを 見る」の 逃げ道は どこにも 置かない（2度 消えた ものが 戻らないように）", () => {
    // 2026-08-19 の 指定で 機能ごと 外した（前にも 一度 消して、直しの ついでに 戻っていた）。
    // reducer の 行き先も UI も 無い ことを、字で 見張る。
    const ui = readFileSync(join(__dirname, "../src/components/quiz/question-types.tsx"), "utf8");
    const reducer = readFileSync(join(__dirname, "../src/components/quiz/quiz-reducer.ts"), "utf8");
    expect(ui).not.toContain("こたえを 見る");
    expect(ui).not.toContain("onSkip");
    expect(reducer).not.toContain("skipKeyword");
  });

  it("ローマ字の 注意は 出すが、合って いるかは 漏らさない（書いた ものは 残る）", () => {
    const keyword = set.questions.find((q) => q.type === "keyword")!;
    const s = quizReducer(submitSession([keyword]), {
      type: "answerKeyword",
      input: "houkoku",
    });
    expect(s.phase).toMatchObject({ kind: "ask" });
    expect(s.results).toEqual([]);
    expect(s.drafts[keyword.id]).toEqual({ kind: "keyword", input: "houkoku" });
  });

  it("気もちを えらび直すと、言い方は えらび直しに なる", () => {
    const emotion = set.questions.find((q) => q.type === "emotion")!;
    if (emotion.type !== "emotion") throw new Error("emotion の 設問が ない");
    let s = submitSession([emotion]);
    s = run(s, [
      { type: "answerFeeling", index: 0 },
      { type: "answerReply", index: 1 },
    ]);
    expect(s.drafts[emotion.id]).toEqual({ kind: "emotion", feeling: 0, reply: 1 });
    // 同じ 気もちを 押し直しても 言い方は 残る
    s = quizReducer(s, { type: "answerFeeling", index: 0 });
    expect(s.drafts[emotion.id]).toEqual({ kind: "emotion", feeling: 0, reply: 1 });
    // ちがう 気もちに 変えたら、その 気もちの 言い方を えらび直す
    s = quizReducer(s, { type: "answerFeeling", index: 1 });
    expect(s.drafts[emotion.id]).toEqual({ kind: "emotion", feeling: 1, reply: null });
  });

  it("気もちだけでは「こたえた」に しない（2段階 そろって はじめて 数える）", () => {
    const emotion = set.questions.find((q) => q.type === "emotion")!;
    let s = submitSession([emotion]);
    expect(answeredCount(s)).toBe(0);
    s = quizReducer(s, { type: "answerFeeling", index: 0 });
    expect(answeredCount(s)).toBe(0);
    s = quizReducer(s, { type: "answerReply", index: 0 });
    expect(answeredCount(s)).toBe(1);
  });

  it("1問ずつでは かくにん画面・出すは 効かない（やりかたが 混ざらない）", () => {
    const s = createQuizSession(set);
    expect(quizReducer(s, { type: "submit" })).toBe(s);
    expect(quizReducer(s, { type: "goto", index: 3 })).toBe(s);
  });
});
