/**
 * 辞書 — 学習者が **読むため**の 引き先（ことばの 正を そのまま 畳んだもの）
 *
 * **ポップアップ辞書と 単語テストは 別の もの**（2026-08-25 の指定）。
 *
 *   ことばの 正（content/vocab/vocabulary.json）
 *     ├─► **辞書**（この ファイル）… 本文・ミーティング・`/dictionary` の ふきだし。
 *     │     読む ための 助けなので **多くて よい**
 *     └─► **単語テスト**（`content/wordstages/*.json`）… その中から 先生が えらんだ 一部。
 *           おぼえる ものなので 少なく 厳しく えらぶ
 *
 * 前は 辞書を **単語テストを 畳んで** 作って いた。すると「テストから 外す」と
 * 「意味が 引けなく なる」が いつも 同時に 起きるので、覚えなくて よい 語まで
 * テストに 入れる しか なかった。引き先を 正に 変えて、この 2つを 切り離す。
 *
 * **新しい保存先は作らない。** 語は いまも `content/vocab` の 1か所だけ。
 * 同じ `term` が 2つ あれば **先に 出た ほうが 勝つ**（スキーマが 重複を 止めるので
 * ふつうは 起きない）。
 *
 * 純関数だけ。node:fs も React も持たないので、ページからも scripts からも呼べる。
 */

import { mergeFuriganaEntries, type FuriganaEntry } from "@/lib/text/furigana";
import type { VocabBook, VocabWord, WordStage } from "@/content/schema";

export interface DictionaryEntry {
  /** 見出し語（教材に出てくる表記そのまま）。 */
  term: string;
  reading: string;
  /** やさしい日本語の説明。 */
  explanationJa: string;
  /** 最後の受け皿としての英語。 */
  meaningEn: string;
  /** 出典教材と同じ文脈の例文。 */
  example: string;
  /**
   * この ことばを **単語テストに 出して いる** セット。
   * どの セットにも 入って いなければ 空——**辞書には 出るが テストには 出ない**語で、
   * 「ことばで あそぶ」の リンクを 出さない 目じるしに なる。
   */
  stageId: string;
  stageTitle: string;
  /**
   * この ことばの 読み辞書。
   *
   * 説明文と例文にも漢字が入る（「配属の初日に、チームのみんなに挨拶をして回ること」）。
   * これを持ち歩かないと、辞書と吹き出しだけ**裸の漢字**になる——いちばん助けが
   * 要る場所で読めなくなるので、ここは必ず一緒に運ぶ（AGENTS.md 規律2）。
   *
   * **その語に 要る ぶんだけ**を 入れる。束の 読み辞書（600語超）を どの語にも
   * 複製すると、画面に わたす 荷物が 語数ぶん ふくらむ（20人同時アクセスの 制約）。
   */
  furigana: readonly FuriganaEntry[];
}

/** その語の 説明文・例文に 要る 読みだけを、束から 拾う。 */
function furiganaFor(word: VocabWord, shared: readonly FuriganaEntry[]): FuriganaEntry[] {
  const text = `${word.term}\n${word.meaningJa}\n${word.example ?? ""}`;
  return mergeFuriganaEntries(
    shared.filter(([surface]) => text.includes(surface)),
    // 見出し語 そのものと、その語ごとの 足し前は **あと勝ち**（より 近い ほうが 正しい）
    [[word.term, word.reading] as FuriganaEntry],
    word.furigana ?? [],
  ).map(([surface, reading]): FuriganaEntry => [surface, reading]);
}

/**
 * ことばの 正を 辞書に する。
 *
 * `stages`（単語テストの セット）は **リンクを 出すため だけ**に 見る——
 * 辞書に 載るかどうかは セットに 入って いるかと 関係ない。
 */
export function buildDictionary(
  books: readonly VocabBook[],
  stages: readonly WordStage[] = [],
): DictionaryEntry[] {
  const owners = new Map<string, WordStage>();
  for (const stage of stages) {
    for (const word of stage.words) {
      if (!owners.has(word.term)) owners.set(word.term, stage);
    }
  }

  const byTerm = new Map<string, DictionaryEntry>();
  for (const book of books) {
    const shared = book.furigana ?? [];
    for (const word of book.words) {
      if (byTerm.has(word.term)) continue;
      const owner = owners.get(word.term);
      byTerm.set(word.term, {
        term: word.term,
        reading: word.reading,
        explanationJa: word.meaningJa,
        meaningEn: word.englishTerm ?? word.englishMeaning ?? "",
        example: word.example ?? "",
        stageId: owner?.id ?? "",
        stageTitle: owner?.title ?? "",
        furigana: furiganaFor(word, shared),
      });
    }
  }
  // 見出し語の五十音順。日本語の並べ替えは読みで行う（漢字のコード順では引けない）
  return [...byTerm.values()].sort((a, b) => a.reading.localeCompare(b.reading, "ja"));
}

/** ことば → 説明。ツールチップの引き当てに使う。 */
export function dictionaryIndex(
  entries: readonly DictionaryEntry[],
): ReadonlyMap<string, DictionaryEntry> {
  return new Map(entries.map((entry) => [entry.term, entry]));
}

/**
 * 文の中から、辞書に載っている ことばを **1つだけ** 見つける。
 *
 * 1文につき下線は1語だけにする（設計07 §2.5）。同じ文で2回タップさせない、
 * という決まりを守るため、ここは意図的に「最初の1つ」しか返さない。
 * どれを選ぶかは **いちばん長い語**を優先し、同じ長さなら文の先頭に近いほう。
 * 短い語を先に取ると「報告」があるのに「報」だけが下線になる。
 */
export function findDictionaryTerm(
  text: string,
  entries: readonly DictionaryEntry[],
): { entry: DictionaryEntry; at: number } | null {
  let best: { entry: DictionaryEntry; at: number } | null = null;
  for (const entry of entries) {
    const at = text.indexOf(entry.term);
    if (at < 0) continue;
    if (
      !best ||
      entry.term.length > best.entry.term.length ||
      (entry.term.length === best.entry.term.length && at < best.at)
    ) {
      best = { entry, at };
    }
  }
  return best;
}

/** 「この ことばは もう ○○に あります」を出すための索引（term → ステージの見出し）。 */
export function termOwners(stages: readonly WordStage[]): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const stage of stages) {
    for (const word of stage.words) {
      if (!owners.has(word.term)) owners.set(word.term, stage.title);
    }
  }
  return owners;
}
