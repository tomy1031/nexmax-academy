import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizResultCard } from "../src/components/quiz/quiz-runner";
import type { QuizResult } from "../src/components/quiz/quiz-reducer";
import { meetingSchema, quizSetSchema, type QuizSet } from "../src/content/schema";
import { notebookQuizSetIds } from "../src/lib/answers/notebook";
import { hasNoRightAnswer } from "../src/lib/quiz/draft";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * 正解の 無い もんだい（自由記述・じゅんばんに ならべて 書く だけ）の けっか画面。
 *
 * 「はなす じゅんび／つぎの 会話の『📋 自分の こたえ』で 見られます」と 言って よいのは、
 * **あとの 会話が その もんだいを こたえノートに 出す** とき だけ。報告ステージの
 * 2本（つぎは スキット／答え合わせの ページ）は 一律に そう 言われ、無い ひきだしを
 * 探させて いた。
 *
 * 見張るのは 3つ。
 *  1. 教材データの 上で、どの もんだいが ノートに 出るか（会社を知るは 出る・報告の 2本は 出ない）
 *  2. 画面で、ノートに 出る ときだけ 会話の 案内を 出し、出ない ときは 中立の 案内に なる
 *  3. どちらでも 点・％を 出さず「いくつ 書けたか」を 数える（これまでの ふるまいを 保つ）
 */

function read<T>(...path: string[]): T {
  return JSON.parse(readFileSync(join(...path), "utf8")) as T;
}

const meetings = readdirSync(join("content", "meetings"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => meetingSchema.parse(read("content", "meetings", name)));

const quiz = (id: string): QuizSet =>
  quizSetSchema.parse(read("content", "quizsets", `${id}.json`));

/** `quiz-runner` の `freeOnly` と 同じ 見分け（見分けは draft.ts の 1か所）。 */
function freeOnly(set: QuizSet): boolean {
  return set.questions.length > 0 && set.questions.every(hasNoRightAnswer);
}

describe("こたえノートに 出る もんだい（教材データ）", () => {
  const ids = notebookQuizSetIds(meetings);

  it("松井社長との 会話は「松井社長に 何を 話す？」を ノートに 出す", () => {
    expect(ids.has("kaisha_omoshiroi")).toBe(true);
  });

  it("報告ステージの 自由記述 2本は、どの 会話の ノートにも 出ない", () => {
    expect(ids.has("houkoku_answer")).toBe(false);
    expect(ids.has("houkoku_search_quiz")).toBe(false);
  });

  it("3本とも 正解の 無い もんだい（この 見分けが 効く 相手）", () => {
    for (const id of ["kaisha_omoshiroi", "houkoku_answer", "houkoku_search_quiz"]) {
      expect(freeOnly(quiz(id)), id).toBe(true);
    }
  });

  it("notes の 無い 会話は 数えない", () => {
    expect(notebookQuizSetIds([{}, { notes: [] }, { notes: [{ ref: "a" }] }])).toEqual(
      new Set(["a"]),
    );
  });

  it("朝礼・夕礼の 会話は、notes が あっても 数えない（ひきだしを 描かない 画面）", () => {
    expect(notebookQuizSetIds([{ asakai: { scenes: [] }, notes: [{ ref: "b" }] }])).toEqual(
      new Set(),
    );
  });
});

/** ぜんぶ 書いて 出した 回の けっか画面を 文字列に する。 */
function renderResult(set: QuizSet, inNotebook: boolean): string {
  const review = set.questions.map((question) => {
    const result: QuizResult = {
      questionId: question.id,
      correct: true,
      earned: question.points,
      answer: "書きました",
    };
    return { question, result };
  });
  const results = review.map(({ result }) => result);
  return renderToStaticMarkup(
    <QuizResultCard
      set={set}
      embedded
      summary={{
        total: results.length,
        correct: results.length,
        earned: results.length,
        maxPoints: results.length,
        percent: 100,
        passed: true,
        missedQuestionIds: [],
      }}
      review={review}
      skipped={0}
      furigana={buildFuriganaIndex(set.furigana ?? [])}
      freeOnly={freeOnly(set)}
      inNotebook={inNotebook}
      onRetryAll={() => {}}
    />,
  );
}

/** ルビ（<rt>…</rt>）と タグを 落とした、目に 見える 文。 */
function visibleText(html: string): string {
  return html.replace(/<rt>.*?<\/rt>/g, "").replace(/<[^>]+>/g, "");
}

/**
 * 案内の 札（FeedbackMessage・role="status"）の 中だけの 文。
 * カード ぜんたいを 見ると、下の 一覧に 出る 教材の 本文（設問・コツ）に 左右される。
 */
function statusText(html: string): string {
  const found = /role="status"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  if (!found?.[1]) throw new Error("案内の 札（role=status）が 見つからない");
  return visibleText(found[1]);
}

describe("自由記述の けっか画面", () => {
  it("ノートに 出る もんだいは「はなす じゅんび」と 会話の 案内を 出す", () => {
    const html = renderResult(quiz("kaisha_omoshiroi"), true);
    expect(visibleText(html)).toContain("はなす じゅんび");
    const status = statusText(html);
    expect(status).toContain("じゅんび できました！");
    expect(status).toContain("つぎの 会話の「📋 自分の こたえ」で 見られます");
  });

  for (const id of ["houkoku_answer", "houkoku_search_quiz"]) {
    it(`${id}: ノートに 出ないので、会話の 案内を 出さず 中立の 案内に する`, () => {
      const html = renderResult(quiz(id), false);
      const text = visibleText(html);
      expect(text).not.toContain("はなす じゅんび");
      expect(text).toContain("けっか");
      const status = statusText(html);
      expect(status).not.toContain("じゅんび できました");
      expect(status).not.toContain("会話");
      expect(status).not.toContain("自分の こたえ");
      expect(status).toContain("書いた ことは 下で もう一度 読めます");
      expect(status).toContain("読んだら、いちばん 下の ボタンで つぎへ 進みましょう");
    });
  }

  it("どちらでも 点・％を 出さず「いくつ 書けたか」を 数える", () => {
    for (const [id, inNotebook] of [
      ["kaisha_omoshiroi", true],
      ["houkoku_search_quiz", false],
    ] as const) {
      const set = quiz(id);
      const text = visibleText(renderResult(set, inNotebook));
      const n = set.questions.length;
      expect(text, id).toContain(`${n} / ${n} つ 書けました`);
      expect(text, id).toContain("ぜんぶ 書けました！");
      expect(text, id).not.toContain("せいかい");
      expect(text, id).not.toContain("%");
    }
  });

  it("中立の 案内の 漢字には ふりがなが 付く（規律2）", () => {
    const html = renderResult(quiz("houkoku_answer"), false);
    for (const [kanji, reading] of [
      ["書", "か"],
      ["下", "した"],
      ["一度", "いちど"],
      ["読", "よ"],
      ["進", "すす"],
    ]) {
      expect(html, kanji).toContain(`${kanji}<rt>${reading}</rt>`);
    }
  });
});
