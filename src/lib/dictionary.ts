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

/** 本文の どこに どの ことばが 当たったか。 */
export interface DictionaryMatch {
  readonly entry: DictionaryEntry;
  /** 本文の 中の 位置。 */
  readonly at: number;
  /**
   * **本文で 当たった ところの 長さ**（語幹で 当たった ときは 語幹の 長さ）。
   * 見出し語の 長さでは ない——ここを 取りちがえると、下線が 本文の 字と ずれる。
   */
  readonly length: number;
}

/**
 * わたした 文字列の 中から、辞書に 載って いる ことばを **ぜんぶ** 見つける。
 *
 * ## むかしは「1文につき 1語」だった
 * 「同じ 文で 2回 タップさせない」ために、ここは 意図して 1つしか 返して いなかった
 *（設計07 §2.5・呼ぶ 側が 文に 分けて いた）。ところが 本文には むずかしい 語が
 * かたまって 出る。「観光DXで、カンボジアの 町の 物語を 動画に したいです。」の ような 文では
 * 4語の うち 1語しか 下線が つかず、**辞書に 載って いるのに 引けない 語**が 残った
 *（2026-08-31 の 指摘「辞書が 足りて いません。DX・物語・動画・チャットボット」）。
 *
 * 決まりを **当たった ところ ぜんぶ**に 書きかえた。読む 手を 止めさせない ための しくみ
 *（のせるだけで 出る）なので、下線が 増えて 困るのは 読む 人では なく、
 * 引けない ほうが 困る。
 *
 * ## 選びかた
 * 左から 見て、その 位置で **いちばん長く 当たる 語**を 取り、その ぶんだけ 進む。
 * 短い 語を 先に 取ると「報告」が あるのに「報」だけが 下線に なる。
 * 重なりは 出ない（`annotateRuby` と 同じ 走査）。
 *
 * ## ルビの ことばは 切らない
 * 当たった ところで 文字列を 切るので、**ルビの ことばの 途中で 切ると
 * 切れた 側が 読み辞書に 当たらず 裸の 漢字に なる**。「お客様」の「様」だけが
 * 辞書に あると「お客」と「様」に 割れて「客」の ルビが 消えた
 *（2026-08-31 に 実発生）。`noCut` に 内側の 位置を もらって、そこは 飛ばす。
 */
export function findDictionaryTerms(
  text: string,
  entries: readonly DictionaryEntry[],
  /**
   * **ここでは 切らない**位置（`rubyInnerPositions`）。
   * ルビの ついた ことばの 途中で 切ると、切れた 側が 読み辞書に 当たらず
   * 裸の 漢字に なる。渡さなければ どこでも 切る。
   */
  noCut?: ReadonlySet<number>,
): DictionaryMatch[] {
  /*
   * まず この 文に 出て くる 語だけに しぼる。辞書は 600語 近く あるので、
   * 位置ごとに 全語を 見ると 走査が 文字数×語数に なる。
   */
  const candidates: { entry: DictionaryEntry; surface: string }[] = [];
  for (const entry of entries) {
    if (text.includes(entry.term)) {
      candidates.push({ entry, surface: entry.term });
      continue;
    }
    const stem = stemOf(entry.term);
    if (stem && text.includes(stem)) candidates.push({ entry, surface: stem });
  }
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => b.surface.length - a.surface.length);

  const matches: DictionaryMatch[] = [];
  let i = 0;
  while (i < text.length) {
    const hit = candidates.find(
      (c) =>
        text.startsWith(c.surface, i) &&
        (!noCut || (!noCut.has(i) && !noCut.has(i + c.surface.length))),
    );
    if (!hit) {
      i += 1;
      continue;
    }
    matches.push({ entry: hit.entry, at: i, length: hit.surface.length });
    i += hit.surface.length;
  }
  return matches;
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
