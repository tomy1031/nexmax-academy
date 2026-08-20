/**
 * ことばの 正 — 語彙は ここから しか 引かない
 *
 * 語は `content/vocab/vocabulary.json`（kind: `vocab`）に 1つだけ 置く。
 * 単語ゲーム・辞書・記事・まんが・スライドは、どれも **id で 参照する**。
 *
 * こうする 理由は 重複である。2026-08-20 に 数えたところ、語彙は 5か所に
 * 合計 255件 あり、term で 畳むと **164語**しか なかった——91件は 同じ ことばの
 * 別の 説明で、直しても 一部にしか 届かない 形に なっていた。
 *
 * 純関数だけ。node:fs も React も 持たない。
 */

import type { StoredWordStage, VocabWord, Word, WordStage } from "@/content/schema";
import { mergeFuriganaEntries, type FuriganaEntry } from "@/lib/text/furigana";

/** id → ことば。 */
export function vocabById(words: readonly VocabWord[]): ReadonlyMap<string, VocabWord> {
  return new Map(words.map((word) => [word.id, word]));
}

/** 表記 → ことば。同じ表記は スキーマが 弾くので ぶつからない。 */
export function vocabByTerm(words: readonly VocabWord[]): ReadonlyMap<string, VocabWord> {
  return new Map(words.map((word) => [word.term, word]));
}

/**
 * 単語ゲームに 出せる 語か。
 *
 * 4択は **対訳の1語（正解）＋ 誤答3つ**で できているので、その2つが 無い 語は
 * ゲームに 出せない（辞書や ツールチップには 出る）。
 */
export function isPlayable(
  word: VocabWord,
): word is VocabWord & { englishTerm: string; wrongMeanings: string[] } {
  return Boolean(word.englishTerm) && word.wrongMeanings?.length === 3;
}

/**
 * ゲームの 語の かたちへ 直す。
 *
 * ことばアーケードは `Word`（`meaningEn` / `explanationJa`）で できている。
 * 正の かたちを 変える たびに ゲームを 書き直すのは 割に 合わないので、
 * **境目を ここ 1つに する**。
 */
export function toGameWord(word: VocabWord): Word | null {
  if (!isPlayable(word)) return null;
  return {
    id: word.id,
    term: word.term,
    reading: word.reading,
    romaji: word.romaji,
    meaningEn: word.englishTerm,
    wrongMeanings: word.wrongMeanings,
    explanationJa: word.meaningJa,
    example: word.example ?? "",
  };
}

/** id の 並びから、ゲームに 出せる 語だけを 順番どおりに 取り出す。 */
export function gameWordsOf(
  ids: readonly string[],
  words: readonly VocabWord[],
): { words: Word[]; missing: string[]; notPlayable: string[] } {
  const index = vocabById(words);
  const out: Word[] = [];
  const missing: string[] = [];
  const notPlayable: string[] = [];
  for (const id of ids) {
    const found = index.get(id);
    if (!found) {
      missing.push(id);
      continue;
    }
    const game = toGameWord(found);
    if (!game) {
      notPlayable.push(id);
      continue;
    }
    out.push(game);
  }
  return { words: out, missing, notPlayable };
}

/**
 * 保存の かたち（`wordIds` の 参照）を、読み出しの かたち（`words` が ある）に 直す。
 *
 * **境目は ここ 1つ**。ゲーム・辞書・スタジオは これまでどおり `words` を 見る。
 * 参照が 切れて いたら その語を 落とす——1語 消えても 遊べるが、
 * 画面が 真っ白に なると 学習者は 何も できない。切れた ぶんは `lint:content` が 止める。
 */
export function hydrateWordStage(
  stored: StoredWordStage,
  vocab: readonly VocabWord[],
  /** 正の 読み辞書（説明文・例文の 漢字を 覆う）。 */
  vocabFurigana: readonly FuriganaEntry[] = [],
): WordStage | null {
  const { wordIds, words, furigana, ...rest } = stored;
  if (!wordIds) return words ? { ...rest, furigana, words } : null;

  const picked = gameWordsOf(wordIds, vocab);
  if (picked.words.length === 0) return null;

  /*
   * 読み辞書は **正の 側**が 運ぶ（説明文・例文の 漢字は 正に 書いて あるため）。
   * ステージが 自分の 読み辞書を 持って いれば、そちらを 後ろに 置いて 勝たせる。
   */
  const fromVocab = vocab
    .filter((word) => wordIds.includes(word.id))
    .map((word): FuriganaEntry => [word.term, word.reading]);
  return {
    ...rest,
    furigana: mergeFuriganaEntries(fromVocab, vocabFurigana, furigana).map(
      ([surface, reading]): [string, string] => [surface, reading],
    ),
    words: picked.words,
  };
}

/** 記事・まんがの ことばカードの かたちへ 直す。 */
export function toVocabItem(word: VocabWord): {
  term: string;
  reading: string;
  meaning: string;
  en?: string;
} {
  return {
    term: word.term,
    reading: word.reading,
    meaning: word.meaningJa,
    ...(word.englishTerm ? { en: word.englishTerm } : {}),
  };
}

/**
 * 記事の ことばブロックを 正から 埋める。
 *
 * 単語ステージと 同じ 考えかた——**保存は 参照、読み出しは 中身**。
 * 記事の 表示（`article-view.tsx`）は これまでどおり `items` を 見れば よい。
 */
export function hydrateArticle<T extends { blocks: readonly unknown[] }>(
  article: T,
  vocab: readonly VocabWord[],
): T {
  const index = vocabById(vocab);
  return {
    ...article,
    blocks: article.blocks.map((block) => {
      const b = block as { kind?: string; wordIds?: string[]; items?: unknown };
      if (b.kind !== "vocab" || !b.wordIds) return block;
      const items = b.wordIds
        .map((id) => index.get(id))
        .filter(Boolean)
        .map((w) => toVocabItem(w!));
      return { ...b, items };
    }),
  };
}

/** まんがの 復習語彙を 正から 埋める。 */
export function hydrateManga<T extends { vocab?: unknown; vocabIds?: readonly string[] }>(
  manga: T,
  vocab: readonly VocabWord[],
): T {
  if (!manga.vocabIds) return manga;
  const index = vocabById(vocab);
  return {
    ...manga,
    vocab: manga.vocabIds
      .map((id) => index.get(id))
      .filter(Boolean)
      .map((w) => toVocabItem(w!)),
  };
}
