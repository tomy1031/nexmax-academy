/**
 * content/ の ことば まわりを、`src/lib/content.ts` と **同じ 並び・同じ 形**で 読む。
 *
 * ブラウザへ 出す 2枚（ポップアップ辞書・単語セット）の 元に なる。
 * 並びを 実行時と そろえないと、書き出した ものと 画面が 静かに ずれる——
 * `npm run lint:content` の ずれ検査が 効くのは **同じ 手順で 作った** ときだけ。
 *
 * DB は 見ない。ここで 作るのは **git の 分**で、先生が スタジオで 足した 語は
 * 次の デプロイで 合流する（docs/deploy.md §0.13 の 代償）。
 */
import type { Stage, StoredWordStage, VocabBook, WordStage } from "../../src/content/schema";
import { hydrateWordStage } from "../../src/lib/vocabulary";
import { parsedContents } from "./bake_content";

export function gitWordData(): {
  books: VocabBook[];
  /** 語を 埋めた 単語ステージ（`listWordStages` と 同じ）。 */
  stages: WordStage[];
  /** 順番つきの ステージ（`listStages` と 同じ）。 */
  lessons: Stage[];
} {
  const contents = parsedContents() as { kind: string }[];
  const books = contents.filter((item): item is VocabBook => item.kind === "vocab");
  const stored = contents.filter((item): item is StoredWordStage => item.kind === "wordstage");
  const lessons = contents.filter((item): item is Stage => item.kind === "stage");

  books.sort((a, b) => a.id.localeCompare(b.id));
  stored.sort((a, b) => a.id.localeCompare(b.id));
  lessons.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const words = books.flatMap((book) => book.words);
  const furigana = books.flatMap((book) => book.furigana ?? []);
  const stages = stored
    .map((stage) => hydrateWordStage(stage, words, furigana))
    .filter((stage): stage is WordStage => stage !== null);

  return { books, stages, lessons };
}
