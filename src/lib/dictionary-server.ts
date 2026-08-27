/**
 * 学習者に 出す ポップアップ辞書を 組み立てる（サーバ側）
 *
 * 引き先は **ことばの 正 ぜんぶ**（`content/vocab`）。単語テストの セットは
 * 「○○で あそぶ」の リンクを 出すためだけに 見る——**覚える 語（テスト）と
 * 読む ための 助け（ふきだし）は 別**（2026-08-25 の 指定）。
 *
 * ステージの ぶんだけに 絞らないのは、本文に 出て くる ことばは 前の 課で 習った
 * ものが 多い ため。絞ると いちばん 助けが 要る「前に 習ったが 忘れた語」に
 * 説明が 出なくなる。
 *
 * **1か所に 置く。** 前は `[stage]/[content]/page.tsx` の 中だけに あり、
 * もんだいの 単独ページ（`/quiz/<id>`）から 呼べなかった——同じ 教材なのに
 * 入口に よって 辞書が 出たり 出なかったり する（2026-08-27）。
 */
import { listVocabBooks, listWordStages } from "@/lib/content";
import { buildDictionary, type DictionaryEntry } from "@/lib/dictionary";

export async function learnerDictionary(): Promise<DictionaryEntry[]> {
  const [books, stages] = await Promise.all([listVocabBooks(), listWordStages()]);
  return buildDictionary(books, stages);
}
