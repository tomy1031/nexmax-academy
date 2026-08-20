/**
 * ステージに ぶら下がった 単語ステージを 1つに まとめる
 *
 * 学習者から 見ると、1つの ステージで ならった ことばは **1かたまり**である。
 * ことばの グループが 2つに 分かれて カードが 2枚 出ると、学習者は
 *「どっちを やるのか」を 先に 決めさせられる——その 判断は 学習では ない
 *（2026-08-19 ユーザー指定「複数選んだときも単語を統合した問題を1つで出してほしい」）。
 *
 * そこで **画面に 出すのは 1枚**にし、出題は まとめた ことばから 引く。
 * 単語ステージ そのものは 分けたまま 持つ（先生が スタジオで 課ごとに 直せる形を
 * こわさない）。まとめるのは **見せかた と 出題だけ**である。
 *
 * 純関数だけ。node:fs も React も持たないので、ページからも scripts からも 呼べる。
 */

import type { WordStage } from "@/content/schema";
import { mergeFuriganaEntries } from "@/lib/text/furigana";

/** まとめた ことばの カードの 見出し（漢字を 置かない — 親ステージ名を 借りない）。 */
export const MERGED_TITLE = "この ステージの ことば";
export const MERGED_DESCRIPTION = "ここまでに ならった ことばを ぜんぶ まとめて れんしゅうします。";

/**
 * 2つ以上の 単語ステージを 1つに まとめる。1つだけの ときは そのまま 返す
 *（1課しか 無い ステージの 見た目を 変えない）。
 *
 * - ことばは **同じ表記なら 先に 出たほうが 勝つ**（`src/lib/dictionary.ts` と同じ規則。
 *   説明が 2つ 育つのを 避ける）
 * - `id` は 呼ぶ側が 決める。ことばアーケードは この id で 進み具合を 覚えるので、
 *   親ステージの id を 渡す（`/arcade/<ステージ>` で 開ける）
 * - 1回の 出題数は 部分の いちばん 多い もの、合格ラインは いちばん 高い ものに そろえる
 */
export function mergeWordStages(id: string, stages: readonly WordStage[]): WordStage | null {
  if (stages.length === 0) return null;
  if (stages.length === 1) return stages[0]!;

  const seenTerms = new Set<string>();
  const seenIds = new Set<string>();
  const words: WordStage["words"] = [];
  for (const stage of stages) {
    for (const word of stage.words) {
      if (seenTerms.has(word.term)) continue;
      seenTerms.add(word.term);
      // ことばの id は 課ごとの 名前空間なので、まとめると ぶつかりうる
      //（両方に「houkoku」がいる等）。ぶつかったら 出どころを 前に 付ける。
      const wordId = seenIds.has(word.id) ? `${stage.id}__${word.id}` : word.id;
      seenIds.add(wordId);
      words.push({ ...word, id: wordId });
    }
  }

  return {
    kind: "wordstage",
    id,
    title: MERGED_TITLE,
    description: MERGED_DESCRIPTION,
    fieldSequence: stages[0]!.fieldSequence,
    questionCount: Math.min(Math.max(...stages.map((s) => s.questionCount)), words.length),
    passRate: Math.max(...stages.map((s) => s.passRate)),
    /*
     * 語ごとの (表記, よみ) を 先に、読み辞書を あとに 置く（あと勝ち）。
     * stage-detail.tsx と 同じ 順番——ぶつかったら **読み辞書が 勝つ**
     *（「報告書」は 語の よみ より 複合語の よみが 正しい）。
     */
    furigana: mergeFuriganaEntries(
      words.map((w) => [w.term, w.reading] as const),
      ...stages.map((s) => s.furigana),
    ).map(([surface, reading]): [string, string] => [surface, reading]),
    words,
  };
}
