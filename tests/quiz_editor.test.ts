import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLANK_MARK, contentSchema, type QuizQuestion } from "@/content/schema";
import { emptyQuizQuestion, emptyQuizSet } from "@/components/studio/drafts";
import {
  answerIndexAfterMove,
  answerIndexAfterRemove,
  answersAfterMove,
  answersAfterRemove,
  countBlanks,
  describeQuestionIssues,
  describeWordbankIssues,
  type WordbankQuestion,
} from "@/components/studio/quiz-editor";

/**
 * もんだいエディタの判定ロジック。
 *
 * 語群の穴埋めは「文の空欄・こたえ・語群」の3つが噛み合って はじめて問題になる。
 * ずれたまま公開すると、学習者は正しく答えても先へ進めない。判定を画面の中に
 * 埋めずここで固めておく（保存を止めるのはAPI側の役目で、画面は気づかせるだけ）。
 */

function wordbank(part: Partial<WordbankQuestion> = {}): WordbankQuestion {
  return {
    type: "wordbank",
    id: "q1",
    q: "あいている ところに 入る ことばを えらんでください。",
    explain: "ほうこくは はやいほど たすかります。",
    points: 1,
    lines: [`きのう ${BLANK_MARK} を おくりました。`],
    blanks: ["メール"],
    bank: ["メール", "でんわ"],
    ...part,
  };
}

describe("describeWordbankIssues", () => {
  it("空欄・こたえ・語群が そろっていれば 何も言わない", () => {
    expect(describeWordbankIssues(wordbank())).toEqual([]);
  });

  it("文の空欄の数と こたえの数が 合わないときに 気づかせる", () => {
    const notices = describeWordbankIssues(
      wordbank({ blanks: ["メール", "でんわ"], bank: ["メール", "でんわ", "ほうこく"] }),
    );
    expect(notices).toHaveLength(1);
    // 「いくつ対いくつ」が分からないと、先生はどちらを直すか決められない
    expect(notices[0]).toContain("1こ");
    expect(notices[0]).toContain("2こ");
  });

  it("こたえが 語群に ないときに 気づかせる", () => {
    const notices = describeWordbankIssues(wordbank({ bank: ["でんわ", "ほうこく"] }));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("メール");
    expect(notices[0]).toContain("語群");
  });

  it("語群が こたえだけ（まぎらわしい語なし）のときに 気づかせる", () => {
    const notices = describeWordbankIssues(
      wordbank({
        lines: [`きのう ${BLANK_MARK} と ${BLANK_MARK} を おくりました。`],
        blanks: ["メール", "しりょう"],
        bank: ["メール", "しりょう"],
      }),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("にた ことば");
  });

  it("そろっていないところが 重なれば まとめて 出す", () => {
    const notices = describeWordbankIssues(
      wordbank({ blanks: ["メール", "でんわ"], bank: ["でんわ"] }),
    );
    expect(notices).toHaveLength(3);
  });

  it("空欄の数え方は 保存時の検査（schema.ts）と同じ", () => {
    expect(countBlanks([`${BLANK_MARK}を ${BLANK_MARK}に おくる`])).toBe(2);
    expect(countBlanks(["ふつうの 文です。"])).toBe(0);
  });

  it("空欄の しるしを ベタ書きせず schema.ts の BLANK_MARK を使っている", () => {
    // しるしを schema.ts で変えたとき、エディタだけ古い文字のまま残ると
    // 「画面ではそろっているのに保存で止まる」になる。ソースを直接見て止める。
    const source = readFileSync(
      new URL("../src/components/studio/quiz-editor.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("BLANK_MARK");
    expect(source.includes(BLANK_MARK)).toBe(false);

    // 別のしるしで書いた文は「空欄0こ」と数えられ、正しいしるしを添えて知らせる
    const notices = describeWordbankIssues(
      wordbank({ lines: ["きのう ＿＿＿ を おくりました。"] }),
    );
    expect(notices[0]).toContain(BLANK_MARK);
  });
});

describe("describeQuestionIssues", () => {
  it("語群の穴埋めは describeWordbankIssues に そのまま任せる", () => {
    const question = wordbank({ bank: ["でんわ", "ほうこく"] });
    expect(describeQuestionIssues(question)).toEqual(describeWordbankIssues(question));
  });

  it("ぜんぶが こたえの 複数選択は 問題に ならないと 伝える", () => {
    const notices = describeQuestionIssues({
      type: "multi",
      id: "q1",
      q: "ほうこくに 入れる ことを ぜんぶ えらんでください。",
      explain: "いつ・なにが・これから どうするか の 3つです。",
      points: 1,
      options: ["いつ", "なにが", "これから"],
      answers: [0, 1, 2],
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("1つ のこして");
  });

  it("書いて こたえる もんだいは こたえが 空だと 気づかせる", () => {
    const base = {
      type: "keyword" as const,
      id: "q1",
      q: "先輩に なんと 言いますか。",
      explain: "はやく つたえるほど たすかります。",
      points: 1,
      accept: [],
    };
    expect(describeQuestionIssues({ ...base, answer: "" })).toHaveLength(1);
    expect(describeQuestionIssues({ ...base, answer: "ほうこく します" })).toEqual([]);
  });
});

describe("drafts（もんだい）", () => {
  it("空の問題セットは 読みとりの かくにん から始まる（産出だと1問目から置けない）", () => {
    const set = emptyQuizSet();
    expect(set.kind).toBe("quizset");
    expect(set.phase).toBe("research");
    expect(set.questions).toHaveLength(1);
    expect(set.questions[0]?.id).toBe("q1");
    // 中身が空のままでは保存の検査で止まる = 意図どおり
    expect(contentSchema.safeParse(set).success).toBe(false);
  });

  it("どの型も スキーマの下限の数だけ 枠を出して生まれる", () => {
    const counts: Record<QuizQuestion["type"], number> = {
      choose: 2,
      multi: 3,
      keyword: 0,
      wordbank: 2,
      emotion: 3,
      // 自由記述は 枠を 出さない（正解を 書く 欄が 無い）
      free: 0,
    };
    for (const [type, least] of Object.entries(counts) as [QuizQuestion["type"], number][]) {
      const question = emptyQuizQuestion(type);
      expect(question.type).toBe(type);
      if (question.type === "choose" || question.type === "multi") {
        expect(question.options).toHaveLength(least);
      }
      if (question.type === "wordbank") expect(question.bank).toHaveLength(least);
      if (question.type === "emotion") {
        expect(question.feelings).toHaveLength(least);
        expect(question.replies).toHaveLength(least);
      }
    }
  });

  it("生まれたてでも こたえの数え方は 成り立っている（書けば そのまま保存できる）", () => {
    const multi = emptyQuizQuestion("multi");
    // ぜんぶが こたえの複数選択は問題にならない。初期値の時点で1つ残しておく
    if (multi.type !== "multi") throw new Error("multi ではない");
    expect(multi.answers.length).toBeLessThan(multi.options.length);
    expect(describeQuestionIssues(multi)).toEqual([]);
  });

  it("書き終えた問題セットは スキーマを通る（5つの型すべて）", () => {
    const set = {
      ...emptyQuizSet(),
      id: "m7-quiz",
      title: "トラブルの ほうこく",
      description: "まんがで 読んだ ことばを たしかめます。",
      questions: [
        {
          ...emptyQuizQuestion("choose"),
          id: "q1",
          q: "先輩に さいしょに つたえるのは どれですか。",
          explain: "おきた ことを さきに つたえます。",
          options: ["おきた こと", "きのうの てんき"],
          answer: 0,
        },
        {
          ...emptyQuizQuestion("multi"),
          id: "q2",
          q: "ほうこくに 入れる ことを ぜんぶ えらんでください。",
          explain: "いつ・なにが の 2つが あれば つたわります。",
          options: ["いつ", "なにが", "すきな 色"],
          answers: [0, 1],
        },
        {
          ...emptyQuizQuestion("keyword"),
          id: "q3",
          q: "先輩に なんと 言いますか。",
          explain: "みじかく はやく つたえます。",
          answer: "ほうこく します",
          accept: ["ほうこくが あります"],
        },
        {
          ...emptyQuizQuestion("wordbank"),
          id: "q4",
          q: "あいている ところに 入る ことばを えらんでください。",
          explain: "気づいた ときに すぐ つたえます。",
          lines: [`さきほど ${BLANK_MARK} を おくりました。`],
          blanks: ["メール"],
          bank: ["メール", "でんわ"],
        },
        {
          ...emptyQuizQuestion("emotion"),
          id: "q5",
          q: "先輩は どんな 気もちですか。",
          explain: "気もちが 分かると 言い方が きまります。",
          feelings: ["こまっている", "うれしい", "ねむい"],
          answerFeeling: 0,
          replyQ: "その とき なんと 言いますか。",
          replies: ["すぐ なおします", "しりません", "あとで 見ます"],
          answerReply: 0,
        },
      ],
    };
    const parsed = contentSchema.safeParse(set);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});

describe("こたえの 指し先の 追いかけ", () => {
  it("選択肢を 動かすと こたえも 一緒に 動く", () => {
    // 0番がこたえ → 下へ動かせば こたえは1番
    expect(answerIndexAfterMove(0, 0, 1, 3)).toBe(1);
    // 入れ替わった相手がこたえだった場合は 逆へ動く
    expect(answerIndexAfterMove(1, 0, 1, 3)).toBe(0);
    // 関係ない位置は そのまま
    expect(answerIndexAfterMove(2, 0, 1, 3)).toBe(2);
    // 端をこえる指定では moveItem 側も動かないので こたえも動かさない
    expect(answerIndexAfterMove(0, 0, -1, 3)).toBe(0);
  });

  it("選択肢を 消すと うしろの こたえが 1つ 前に つまる", () => {
    expect(answerIndexAfterRemove(2, 0)).toBe(1);
    expect(answerIndexAfterRemove(0, 2)).toBe(0);
    // こたえそのものを消したら 先頭に戻す（どれも指さない番号を残さない）
    expect(answerIndexAfterRemove(1, 1)).toBe(0);
  });

  it("複数の こたえも 並べ替え・削除に ついていく", () => {
    expect(answersAfterMove([0, 2], 0, 1, 3)).toEqual([1, 2]);
    expect(answersAfterRemove([0, 2], 1)).toEqual([0, 1]);
    // 消した選択肢が こたえだったときは こたえから 落ちる
    expect(answersAfterRemove([0, 2], 2)).toEqual([0]);
  });
});
