import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quizSetSchema, type QuizSet } from "../src/content/schema";
import {
  createQuizSession,
  currentQuestion,
  isWholeSetRun,
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
   * 全か無かだと「あと すこし」と言いながら 点は 0 になる。
   * 言っていることと 点を そろえる（配点2点以上のときに 割れる）。
   */
  it("複数選択は そろった ぶんだけ 点が 入る（満点は そろったときだけ）", () => {
    const q = quizSetSchema.parse({
      kind: "quizset",
      id: "multi_partial_fixture",
      title: "ぶぶんてんの かくにん",
      description: "そろった ぶんだけ 点が 入る",
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
    expect(earnedFor([0, 1, 2])).toBe(1); // 1つ 足りない — 0 にしない
    expect(earnedFor([0])).toBe(0); // 1つだけでは まだ
    // ぜんぶ 選ぶ（誤選択1つ）を 満点にしない。読まずに 点が 入る 道を 作らない
    expect(earnedFor([0, 1, 2, 3, 4])).toBe(1);
    expect(earnedFor([4])).toBe(0);
  });

  it("配点1点の 複数選択は これまでどおり 満点か 0（点は 整数で 持つ）", () => {
    const q = quizSetSchema.parse({
      kind: "quizset",
      id: "multi_single_point_fixture",
      title: "1てんの ふくすう",
      description: "わけられない 配点",
      questions: [
        {
          id: "q_multi1",
          type: "multi",
          q: "どれですか",
          options: ["ひとつめ", "ふたつめ", "みっつめ"],
          answers: [0, 1],
          explain: "2つです",
          points: 1,
        },
      ],
    });
    const earnedFor = (indexes: number[]) =>
      quizReducer(createQuizSession(q), { type: "answerMulti", indexes }).results[0]?.earned;

    expect(earnedFor([0, 1])).toBe(1);
    expect(earnedFor([0])).toBe(0);
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
});

/**
 * 「この回を 成績に 残してよいか」（`isWholeSetRun`）。
 *
 * しおり（`position.question`）だけが 残って いる ときは 内訳なしで 途中から 始まる
 *（`@/lib/quiz/resume` の 規則5）。その回も 最後まで 行けるので、答えた 数を 分母に
 * すると 5問の 教材が「3 / 3・合格」で 固まった——成績は 初回だけが 正式で、あとから
 * 直せない。**触った 問題の 数では なく、教材ぜんぶを 通したか**で 分ける。
 */
describe("成績に 残してよい回か（isWholeSetRun）", () => {
  /** その番号から 最後まで 正解して 通す（しおりだけの 再開＝内訳は 空）。 */
  function playFrom(index: number): QuizState {
    let s = resumeQuizSession(set, index, []);
    while (s.phase.kind !== "finished") {
      s = s.phase.kind === "explain" ? quizReducer(s, { type: "next" }) : answerCorrectly(s);
    }
    return s;
  }

  it("1問目から 全問 通した回は true", () => {
    expect(isWholeSetRun(playFrom(0), set.questions.length)).toBe(true);
  });

  it("しおりだけで 途中から 始めた 回は、最後まで 行っても false", () => {
    const s = playFrom(2);
    const summary = summarizeQuiz(s);
    expect(summary.total).toBe(3); // 見たのは 3問だけ
    expect(summary.passed).toBe(true); // その3問は 全部 正解——画面は ほめてよい
    expect(isWholeSetRun(s, set.questions.length)).toBe(false); // が、成績には 残さない
  });

  it("満点は 答えた 問題の 配点で 数える（先頭から N問 では ない）", () => {
    const summary = summarizeQuiz(playFrom(2));
    const answered = set.questions.slice(2);
    expect(summary.maxPoints).toBe(answered.reduce((sum, q) => sum + q.points, 0));
    expect(summary.earned).toBe(summary.maxPoints); // 「8 / 7 てん」に ならない
  });

  it("「まちがえた もんだいだけ」の やり直しも false", () => {
    let s = createQuizSession(set, [set.questions[0]!]);
    while (s.phase.kind !== "finished") {
      s = s.phase.kind === "explain" ? quizReducer(s, { type: "next" }) : answerCorrectly(s);
    }
    expect(isWholeSetRun(s, set.questions.length)).toBe(false);
  });

  it("問題の 無い セットは 数えない（0問で 合格を 作らない）", () => {
    expect(isWholeSetRun(createQuizSession(set, []), 0)).toBe(false);
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
    expect(s.phase).toMatchObject({ kind: "explain", input: "ホウレンソウ" });
  });

  it("「こたえを 見る」は点が入らないが解説へ進む", () => {
    const s = quizReducer(createQuizSession(set, [keyword]), { type: "skipKeyword" });
    expect(s.phase).toMatchObject({ kind: "explain", correct: false, feedback: "quiz.review" });
    expect(s.results[0]?.earned).toBe(0);
  });

  it("「こたえを 見る」は自由入力の出題中だけ効く", () => {
    const choose = set.questions.find((x) => x.type === "choose")!;
    const s = createQuizSession(set, [choose]);
    expect(quizReducer(s, { type: "skipKeyword" })).toBe(s);
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
