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
 * 送りがなの ついた 形も 当てる ための **動詞の 語幹**。
 *
 * 辞書は 言い切りの 形（「見つける」）で 持つが、本文には 活用した 形
 *（「見つけた」「考えて」「終わった」「さがして」）で 出る。
 * 言い切りの 形しか 見て いなかった ころは、そこだけ 下線が 付かなかった
 *（2026-08-28 の 指摘「見つける（た）・さがして・考えて・終わった」）。
 *
 * 語幹が **1文字に なる ものは 当てない**（「知る」→「知」は
 * 「知識」「知らせ」まで 拾って しまう）。
 */
function stemOf(term: string): string | null {
  if (!/[うくすつぬぶむぐる]$/.test(term)) return null;
  const stem = term.slice(0, -1);
  return stem.length >= 2 ? stem : null;
}

/**
 * 名詞の あとに 来る 助詞・助動詞。ここが つづくなら 動詞の 活用では ない（「考えを」）。
 *
 * 「な」「よ」「さ」は **入れない**——「考えない」「考えよう」「考えさせる」に なるので、
 * 名詞の しるしに ならない。
 */
const NOUN_PARTICLE = /[はがをにへとでものやかだ]/u;

const HIRAGANA = /[ぁ-ゖー]/u;

/**
 * わたした 文字列の 中から、辞書に 載って いる ことばを **1つだけ** 見つける。
 *
 * 1文につき 下線は 1語だけ（設計07 §2.5）。同じ 文で 2回 タップさせない ため、
 * ここは 意図して「1つ」しか 返さない——**文に 分けるのは 呼ぶ 側**（`DictionaryText`）で、
 * ここには 1文ずつ 渡って くる。
 * どれを 選ぶかは **いちばん長い ところ**を 先に し、同じ 長さなら 文の 先頭に 近い ほう。
 * 短い 語を 先に 取ると「報告」が あるのに「報」だけが 下線に なる。
 *
 * 返す `length` は **本文で 当たった ところの 長さ**（語幹で 当たった ときは 語幹の 長さ）。
 * 見出し語の 長さでは ない——ここを 取りちがえると、下線が 本文の 字と ずれる。
 */
export function findDictionaryTerm(
  text: string,
  entries: readonly DictionaryEntry[],
): { entry: DictionaryEntry; at: number; length: number } | null {
  /*
   * 選ぶ 順は **長さ → 文の 先頭に 近い ほう → 下の rank**。
   *
   * 3つめは **まったく 同じ ところに 当たった ときだけ**の 決め手である。
   * 名詞の「考え」と 動詞「考える」の 語幹は 同じ 場所・同じ 長さに 当たるので、
   * それまでの 2つでは 決まらず、**並び順で 決まって いた**（「考えます」の ふきだしに
   * 名詞の「an idea」が 出て いた — 2026-08-30 の 指摘）。
   *
   * **長さに 混ぜて 数えない。** 混ぜると、離れた ところに ある 動詞が
   * 別の 語（「得意」）を 押しのけて しまう。順番の いちばん 最後に 置く。
   */
  const VERB = 2;
  /** 言い切りの 形で そのまま 当たった もの。 */
  const EXACT = 1;
  /** 語幹で 当たったが、次が 助詞——動詞の 活用では ない（「考えを」の「考える」）。 */
  const STEM_ONLY = 0;

  let best: { entry: DictionaryEntry; at: number; length: number; rank: number } | null = null;
  const consider = (entry: DictionaryEntry, at: number, length: number, rank: number) => {
    if (at < 0) return;
    const take = () => {
      best = { entry, at, length, rank };
    };
    if (!best) return take();
    const now = best as { at: number; length: number; rank: number };
    if (length !== now.length) return length > now.length ? take() : undefined;
    if (at !== now.at) return at < now.at ? take() : undefined;
    if (rank > now.rank) return take();
  };
  for (const entry of entries) {
    const at = text.indexOf(entry.term);
    if (at >= 0) {
      consider(entry, at, entry.term.length, EXACT);
      continue;
    }
    const stem = stemOf(entry.term);
    if (!stem) continue;
    const stemAt = text.indexOf(stem);
    /*
     * 語幹の あとに **送りがなが つづくか**まで 見る。
     * 送りがな（考え**ま**す・考え**る**）なら 動詞、助詞（考え**を**・考え**の**）なら
     * 名詞——**次の 1文字**で 見分けられる。
     *
     * 助詞が つづく ときは `STEM_ONLY`（いちばん 弱い）に する。こうすると
     * 「考えを」では 言い切りの「考え」が **並び順に よらず** 勝つ——
     * 動詞だけを 強く すると、名詞側は まだ 並び順まかせの ままに なる。
     */
    const next = stemAt < 0 ? "" : (text[stemAt + stem.length] ?? "");
    const verb = next !== "" && !NOUN_PARTICLE.test(next) && HIRAGANA.test(next);
    consider(entry, stemAt, stem.length, verb ? VERB : STEM_ONLY);
  }
  if (!best) return null;
  const { entry, at, length } = best as { entry: DictionaryEntry; at: number; length: number };
  return { entry, at, length };
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
