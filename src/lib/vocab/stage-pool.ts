/**
 * ステージの ことば — **その ステージの 本文に 出て くる 語**を 集める
 *
 * スタジオの「📚 辞書から えらぶ」は、前は **辞書ぜんぶ（559語）**を 並べて いた。
 * 先生は その 中から この 課の 語を 思い出して 探す ことに なり、
 * 「抜き出した 語を 使う」と いう 手順が 事実上 使えなかった
 *（2026-08-25 の 指定・願い #203「抽出された単語が『辞書から選ぶ』で表示されるべき」）。
 *
 * 置き場は **増やさない**。語の 正は `content/vocab/vocabulary.json` の 1つ だけで、
 * 「この ステージの 語」は **そのつど 計算する**——
 *
 *   1. いま 出題中（ステージの セットが 指して いる `wordIds`）
 *   2. 学習者が 読む 本文と 突き合わせて 出て きた 語（下の `appearsAsWord`）
 *   3. リンク教材（学習用サイト）は 本文が 静的な JS に あって アプリからは 読めない
 *      ので、`npm run gen:content` が 焼いた `gakushu-terms.generated.ts` を 見る
 *
 * 純関数だけ（React も fs も 持たない）。
 */

import type { VocabWord } from "@/content/schema";
import { GAKUSHU_TERMS } from "@/content/gakushu-terms.generated";

const KANJI_CHAR = /[㐀-鿿々]/u;

/**
 * その語が **語として** 本文に出ているか。
 *
 * ただの `includes` だと、複合語の 一部を 拾って しまう——「外国」から「国」、
 * 「前例」から「例」。そこで **前後が 漢字の ときは 語と みなさない**。
 * 読み辞書が「ここで 切れる」と 決めて いる 表記（`readingUnits`）は 例外に する。
 * また やさしい日本語は 語の 間を あける ので、**分かち書きの 空白を 飛ばして** さがす。
 *
 * `scripts/gen_gakushu.mjs` の 同じ 名前の 関数と **同じ 見かた**（あちらは
 * 学習用サイトの 辞典を 焼く ときに 使う）。どちらかを 直したら 両方 直す。
 */
export function appearsAsWord(
  haystack: string,
  term: string,
  readingUnits: ReadonlySet<string> = new Set(),
): boolean {
  if (readingUnits.has(term)) return haystack.includes(term);

  const pattern = [...term]
    .map((char) => char.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("\\s*");
  const finder = new RegExp(pattern, "gu");
  for (const found of haystack.matchAll(finder)) {
    if (!KANJI_CHAR.test(term)) return true;
    const before = haystack[found.index - 1] ?? "";
    const after = haystack[found.index + found[0].length] ?? "";
    if (!KANJI_CHAR.test(before) && !KANJI_CHAR.test(after)) return true;
  }
  return false;
}

/** ステージの ことばの 候補。画面は この 2つを 分けて 見せる。 */
export interface StageVocabPool {
  /** いま この ステージの セットが 出して いる 語。 */
  playing: VocabWord[];
  /** 本文に 出て くるが、まだ 出題して いない 語。 */
  appears: VocabWord[];
}

export function stageVocabPool({
  vocab,
  texts,
  playingIds,
  refs,
  readingUnits,
}: {
  /** ことばの 正（束を ならべた もの）。 */
  vocab: readonly VocabWord[];
  /** この ステージの 教材の、学習者が 読む 文。 */
  texts: readonly string[];
  /** すでに この ステージの セットが 指して いる 語の id。 */
  playingIds: ReadonlySet<string>;
  /** この ステージが 指して いる 教材の id（リンク教材の 焼き込みを 引く ため）。 */
  refs: readonly string[];
  /** 読み辞書が「ここで 切れる」と 決めて いる 表記。 */
  readingUnits?: ReadonlySet<string>;
}): StageVocabPool {
  const haystack = texts.join("\n");
  const baked = new Set(refs.flatMap((ref) => GAKUSHU_TERMS[ref] ?? []));

  const playing: VocabWord[] = [];
  const appears: VocabWord[] = [];
  for (const word of vocab) {
    if (playingIds.has(word.id)) {
      playing.push(word);
      continue;
    }
    /*
     * 1文字の 見出し語は 候補に しない。正に ある 1文字の 語は「紙・国・聞・教」の
     * ような **N5の 基礎語と 動詞の 語幹**で、単語テストに 出したい 語では ない
     *（制約 2026-08-18「辞書は 多いほど 良いのでは ない」）。
     */
    if (word.term.length < 2) continue;
    if (baked.has(word.id) || appearsAsWord(haystack, word.term, readingUnits)) {
      appears.push(word);
    }
  }
  return { playing, appears };
}
