import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "@/lib/progress/store";
import {
  clearNotebook,
  notebookLines,
  readNotebook,
  saveNotebook,
  spokenAnswer,
  type NotebookLine,
} from "@/lib/answers/notebook";

/**
 * こたえノート — **出した こたえを、あとの 会話で もう一度 見る**ための 置き場
 *
 * 見張るのは 3つ。
 *  1. 出したものが そのまま 戻る（戻らないと 会話の 最中に カンペが 空に なる）
 *  2. 壊れた 保存値で 会話を 止めない（「まだ 無い」として 扱う）
 *  3. **絞りすぎて 空に しない**——しるしの 無い 教材で `reportOnly` を 立てても、
 *     開いたら 何か 出る（空の ひきだしは 原因が 学習者に 分からない）
 */

const line = (over: Partial<NotebookLine> = {}): NotebookLine => ({
  questionId: "q1",
  q: "会社の 名前は？",
  answer: "",
  correctAnswer: "",
  correct: false,
  report: false,
  section: "",
  ...over,
});

describe("こたえノート", () => {
  it("出した こたえは そのまま 戻る", () => {
    const backend = createMemoryBackend();
    saveNotebook(
      {
        quizSetId: "kaisha_houkoku",
        at: "2026-08-27T00:00:00.000Z",
        lines: [{ questionId: "q1", q: "会社の 名前は？", answer: "ネクストメイク" }],
      },
      backend,
    );

    const back = readNotebook("kaisha_houkoku", backend);
    expect(back?.lines).toHaveLength(1);
    expect(back?.lines[0]?.answer).toBe("ネクストメイク");
    // 省いた 欄は 既定で 埋まる（読む 側が undefined を 気にしなくて よい）
    expect(back?.lines[0]?.correct).toBe(false);
    expect(back?.lines[0]?.report).toBe(false);
  });

  it("まだ 出して いない もんだいは null（会話は 止めない）", () => {
    const backend = createMemoryBackend();
    expect(readNotebook("kaisha_houkoku", backend)).toBeNull();
  });

  it("壊れた 保存値は「まだ 無い」として 扱う", () => {
    const backend = createMemoryBackend();
    backend.set("nexmax:v1:answers:kaisha_houkoku", "{ こわれて いる");
    expect(readNotebook("kaisha_houkoku", backend)).toBeNull();

    backend.set("nexmax:v1:answers:kaisha_houkoku", JSON.stringify({ lines: "文字列" }));
    expect(readNotebook("kaisha_houkoku", backend)).toBeNull();
  });

  it("出し直したら 新しい ほうで 上書きする（古い こたえを 口に 出させない）", () => {
    const backend = createMemoryBackend();
    const at = "2026-08-27T00:00:00.000Z";
    saveNotebook(
      { quizSetId: "s", at, lines: [{ questionId: "q1", q: "?", answer: "ふるい" }] },
      backend,
    );
    saveNotebook(
      { quizSetId: "s", at, lines: [{ questionId: "q1", q: "?", answer: "あたらしい" }] },
      backend,
    );
    expect(readNotebook("s", backend)?.lines[0]?.answer).toBe("あたらしい");
  });

  it("消せる", () => {
    const backend = createMemoryBackend();
    saveNotebook({ quizSetId: "s", at: "2026-08-27T00:00:00.000Z", lines: [] }, backend);
    clearNotebook("s", backend);
    expect(readNotebook("s", backend)).toBeNull();
  });
});

describe("メモに 出す 行", () => {
  const notebook = {
    quizSetId: "s",
    at: "2026-08-27T00:00:00.000Z",
    lines: [line({ questionId: "a", report: true }), line({ questionId: "b", report: false })],
  };

  it("ふだんは ぜんぶ 出す", () => {
    expect(notebookLines(notebook).map((l) => l.questionId)).toEqual(["a", "b"]);
  });

  it("ほうこくの しるしだけに 絞れる（カンペに なる）", () => {
    expect(notebookLines(notebook, { reportOnly: true }).map((l) => l.questionId)).toEqual(["a"]);
  });

  it("しるしが 1つも 無い 教材では、絞っても 空に しない", () => {
    const noMarks = { ...notebook, lines: [line({ questionId: "a" }), line({ questionId: "b" })] };
    expect(notebookLines(noMarks, { reportOnly: true })).toHaveLength(2);
  });
});

describe("口に 出す ことば", () => {
  it("合って いた 問いは 自分の こたえ", () => {
    expect(
      spokenAnswer(line({ answer: "ベトナム", correctAnswer: "ベトナム", correct: true })),
    ).toBe("ベトナム");
  });

  it("外した 問いは 正解（会話では 正しい 事実を 言う）", () => {
    expect(
      spokenAnswer(line({ answer: "カンボジア", correctAnswer: "ベトナム", correct: false })),
    ).toBe("ベトナム");
  });

  it("書いて いない 問いも 正解を 出す（空の 行を 読ませない）", () => {
    expect(spokenAnswer(line({ answer: "", correctAnswer: "ベトナム" }))).toBe("ベトナム");
  });

  it("正解の 無い 問い（自由記述）は 自分の こたえ", () => {
    expect(spokenAnswer(line({ answer: "私は 観光DXが いいと 思いました。", correct: true }))).toBe(
      "私は 観光DXが いいと 思いました。",
    );
  });
});
