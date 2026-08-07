/**
 * 辞書 — 単語ステージを ことば単位で 畳んだもの
 *
 * **新しい保存先は作らない。** 辞書は単語ステージ（`content/wordstages/*.json` と
 * スタジオで作ったもの）の集合であって、別のデータではない。
 *
 * そうする理由は重複である。同じ「報告」が3つのステージの教材に出てきたとき、
 * 辞書を別に持つと「単語ゲームの報告」と「辞書の報告」が別々に育ち、
 * 説明文がいつのまにか食い違う。畳めば、ことばは1つしか存在しえない。
 *
 * 同じ `term` が2つ以上の単語ステージにあるときは**先に出てきたほうが勝つ**。
 * 並びは呼ぶ側が決める（ふつうは ID 順）。あとから足した課で説明を書き換えても、
 * 学習者が最初に習ったときの説明が辞書に残る——習った説明と辞書が違うほうが困る。
 *
 * 純関数だけ。node:fs も React も持たないので、ページからも scripts からも呼べる。
 */

import type { FuriganaEntry } from "@/lib/text/furigana";
import type { WordStage } from "@/content/schema";

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
  /** この ことばを 最初に 出した 単語ステージ。 */
  stageId: string;
  stageTitle: string;
  /**
   * 出典の単語ステージの読み辞書。
   *
   * 説明文と例文にも漢字が入る（「配属の初日に、チームのみんなに挨拶をして回ること」）。
   * これを持ち歩かないと、辞書と吹き出しだけ**裸の漢字**になる——いちばん助けが
   * 要る場所で読めなくなるので、ここは必ず一緒に運ぶ（AGENTS.md 規律2）。
   */
  furigana: readonly FuriganaEntry[];
}

/** 単語ステージの集まりを、ことば単位の辞書に畳む（先に出たほうが勝つ）。 */
export function buildDictionary(stages: readonly WordStage[]): DictionaryEntry[] {
  const byTerm = new Map<string, DictionaryEntry>();
  for (const stage of stages) {
    for (const word of stage.words) {
      if (byTerm.has(word.term)) continue;
      byTerm.set(word.term, {
        term: word.term,
        reading: word.reading,
        explanationJa: word.explanationJa,
        meaningEn: word.meaningEn,
        example: word.example,
        stageId: stage.id,
        stageTitle: stage.title,
        furigana: stage.furigana ?? [],
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
