import { describe, expect, it } from "vitest";
import { quizSetSchema, type QuizSet } from "@/content/schema";
import { createMemoryBackend } from "@/lib/progress/store";
import { saveNotebook } from "@/lib/answers/notebook";
import { saveQuizResume } from "@/lib/quiz/resume";
import {
  draftsFromNotebook,
  keepsAnswers,
  openQuiz,
  rankRowsOfAnswer,
  shouldTakeDbAnswers,
} from "@/lib/quiz/reopen";

/**
 * 出したあとに 開き直したら、**前の こたえが 入力欄に 戻る**（2026-09-22 の 指定）
 *
 * 調査（リサーチ）を 開き直したら 欄が 空で、先生には「回答が 消えた」ように 見えた。
 * 記録は 残って いたのに、入力欄が どこからも 読み戻して いなかった。
 *
 * 見張るのは 4つ。
 *  1. 正解の 無い 問いだけの 教材は、出した こたえが そのまま 戻る（free も ranklist も）
 *  2. えらび直す 練習（正解の ある 問い）が 混ざる 教材は 戻さない——前の 選択が
 *     入った まま 出ると 練習に ならない
 *  3. **書きかけの つづきが 先**（古い 提出で、いま 書いた ものを 上書きしない）
 *  4. ならべた こたえは 行に ほどける（`（1）社長　（2）取締役` → 2行）
 */

/** 調査（リサーチ）と 同じ 作り — ならべる 1問 ＋ 自由に 書く 1問。 */
const research: QuizSet = quizSetSchema.parse({
  kind: "quizset",
  id: "reopen_fixture_research",
  title: "調査の かたち",
  description: "正解の 無い 問いだけで できた 教材",
  questions: [
    {
      id: "kaikyuu_order",
      type: "ranklist",
      q: "えらい 順に ならべて ください。",
      explain: "つぎの ページで 答え合わせを します。",
      topLabel: "↑ いちばん えらい",
      bottomLabel: "↓ いちばん 下",
      placeholder: "ここに 書く",
    },
    {
      id: "kaikyuu",
      type: "free",
      q: "あなたの 国の 会社は どうですか。",
      explain: "くらべながら 読んで ください。",
      minLength: 1,
    },
  ],
});

/** 同じ 形だが、えらぶ 問いが 1つ 混ざる 教材。 */
const graded: QuizSet = quizSetSchema.parse({
  kind: "quizset",
  id: "reopen_fixture_graded",
  title: "えらぶ 問いが ある",
  description: "正解の ある 問いが 混ざる 教材",
  questions: [
    {
      id: "kaikyuu",
      type: "free",
      q: "あなたの 国の 会社は どうですか。",
      explain: "くらべながら 読んで ください。",
      minLength: 1,
    },
    {
      id: "erabu",
      type: "choose",
      q: "いちばん 上は だれですか。",
      explain: "社長が いちばん 上です。",
      options: ["社長", "部長"],
      answer: 0,
    },
  ],
});

function noteResearch(backend: ReturnType<typeof createMemoryBackend>) {
  saveNotebook(
    {
      quizSetId: research.id,
      at: "2026-09-22T09:57:09.000Z",
      lines: [
        { questionId: "kaikyuu_order", q: "えらい 順に…", answer: "（1）社長　（2）取締役" },
        {
          questionId: "kaikyuu",
          q: "あなたの 国の…",
          answer: "わたしの 国では ほとんど 同じです。",
        },
      ],
    },
    backend,
  );
}

describe("出したあとに 開き直す", () => {
  it("正解の 無い 問いだけの 教材は、出した こたえが 入力欄に 戻る", () => {
    const backend = createMemoryBackend();
    noteResearch(backend);

    const start = openQuiz(research, backend);

    expect(start.reopened).toBe(true);
    expect(start.drafts["kaikyuu_order"]).toEqual({
      kind: "ranklist",
      rows: ["社長", "取締役"],
    });
    expect(start.drafts["kaikyuu"]).toEqual({
      kind: "free",
      input: "わたしの 国では ほとんど 同じです。",
    });
  });

  it("えらぶ 問いが 混ざる 教材は 戻さない（はじめから 挑戦できる ままに する）", () => {
    const backend = createMemoryBackend();
    saveNotebook(
      {
        quizSetId: graded.id,
        at: "2026-09-22T09:57:09.000Z",
        lines: [{ questionId: "kaikyuu", q: "あなたの 国の…", answer: "同じです。" }],
      },
      backend,
    );

    expect(keepsAnswers(graded)).toBe(false);
    const start = openQuiz(graded, backend);
    expect(start.reopened).toBe(false);
    expect(start.drafts).toEqual({});
  });

  it("書きかけの つづきが あれば、そちらが 勝つ（古い 提出で 上書きしない）", () => {
    const backend = createMemoryBackend();
    noteResearch(backend);
    saveQuizResume(
      {
        quizSetId: research.id,
        results: [],
        mode: "submit",
        drafts: { kaikyuu: { kind: "free", input: "いま 書いて いる とちゅう" } },
        index: 0,
      },
      backend,
    );

    const start = openQuiz(research, backend);

    expect(start.reopened).toBe(false);
    expect(start.resumed).toBe(true);
    expect(start.drafts["kaikyuu"]).toEqual({ kind: "free", input: "いま 書いて いる とちゅう" });
  });

  it("ノートが 無ければ 何も 戻らない（はじめての 人）", () => {
    const backend = createMemoryBackend();
    const start = openQuiz(research, backend);
    expect(start.reopened).toBe(false);
    expect(start.drafts).toEqual({});
  });

  it("id の 合わない 行は 落とす（教材が 直されて 設問が 入れ替わっても 開く）", () => {
    const backend = createMemoryBackend();
    saveNotebook(
      {
        quizSetId: research.id,
        at: "2026-09-22T09:57:09.000Z",
        lines: [
          { questionId: "mukashi_no_toi", q: "もう 無い 問い", answer: "むかしの こたえ" },
          { questionId: "kaikyuu", q: "あなたの 国の…", answer: "同じです。" },
        ],
      },
      backend,
    );

    const drafts = draftsFromNotebook(research, {
      quizSetId: research.id,
      at: "2026-09-22T09:57:09.000Z",
      lines: [
        {
          questionId: "mukashi_no_toi",
          q: "もう 無い 問い",
          answer: "むかしの こたえ",
          correctAnswer: "",
          correct: false,
          report: false,
          section: "",
        },
        {
          questionId: "kaikyuu",
          q: "あなたの 国の…",
          answer: "同じです。",
          correctAnswer: "",
          correct: false,
          report: false,
          section: "",
        },
      ],
    });

    expect(Object.keys(drafts)).toEqual(["kaikyuu"]);
  });

  it("空の こたえは 戻さない（書かずに 出した 問い）", () => {
    const backend = createMemoryBackend();
    saveNotebook(
      {
        quizSetId: research.id,
        at: "2026-09-22T09:57:09.000Z",
        lines: [
          { questionId: "kaikyuu_order", q: "えらい 順に…", answer: "" },
          { questionId: "kaikyuu", q: "あなたの 国の…", answer: "同じです。" },
        ],
      },
      backend,
    );

    const start = openQuiz(research, backend);
    expect(Object.keys(start.drafts)).toEqual(["kaikyuu"]);
  });
});

describe("ならべた こたえを 行に ほどく", () => {
  it("番号で 切って、前後の 空白を 落とす", () => {
    expect(rankRowsOfAnswer("（1）社長　（2）取締役　（3）部長")).toEqual([
      "社長",
      "取締役",
      "部長",
    ]);
  });

  it("10行を こえても ほどける（2けたの 番号）", () => {
    const answer = Array.from({ length: 12 }, (_, i) => `（${i + 1}）やく${i + 1}`).join("　");
    expect(rankRowsOfAnswer(answer)).toHaveLength(12);
  });

  it("空の 文は 0行", () => {
    expect(rankRowsOfAnswer("")).toEqual([]);
  });
});

describe("端末の 写しと DB の どちらを 採るか", () => {
  it("DB の ほうが 新しければ DB", () => {
    expect(shouldTakeDbAnswers("2026-09-20T18:36:28.000Z", "2026-09-22T09:57:09.000Z")).toBe(true);
  });

  it("端末で 出し直した 直後は 手もとの まま（古い 提出で 上書きしない）", () => {
    expect(shouldTakeDbAnswers("2026-09-22T09:57:09.000Z", "2026-09-20T18:36:28.000Z")).toBe(false);
  });

  it("同じ 時こくなら 動かさない", () => {
    const at = "2026-09-22T09:57:09.000Z";
    expect(shouldTakeDbAnswers(at, at)).toBe(false);
  });

  it("写しが 無ければ DB を 採る（別の 端末で 書いた 人）", () => {
    expect(shouldTakeDbAnswers(undefined, "2026-09-22T09:57:09.000Z")).toBe(true);
  });

  it("DB の 時こくが 読めない ときは 動かさない", () => {
    expect(shouldTakeDbAnswers(undefined, "")).toBe(false);
  });
});
