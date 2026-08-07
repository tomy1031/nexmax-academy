import type { Reading } from "@/content/personality";

/** 漢字1文字。 */
const KANJI = /[一-鿿]/;

/**
 * 読み辞書を当てたあとに**ふりがなが付かずに残る漢字**を返す。
 *
 * `RubyText` と同じ走査（同じ位置なら配列で先に出たほうが勝つ）を、表示せずに行う。
 * 学習者向けの文に裸の漢字が出ていないかを機械で確かめるために使う。
 *
 * 読めない漢字は「読めない」で止まるのではなく、**その文ごと読み飛ばされる**。
 * だから辞書漏れは字面の問題ではなく、その画面が伝わらなくなる問題として扱う。
 *
 * @returns 重複を除いた、ふりがなの付かない漢字の一覧（出現順）
 */
export function uncoveredKanji(text: string, readings: readonly Reading[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  let cursor = 0;

  while (cursor < text.length) {
    let nextReading: Reading | undefined;
    let nextIndex = text.length;

    for (const reading of readings) {
      const index = text.indexOf(reading.text, cursor);
      if (index >= 0 && index < nextIndex) {
        nextIndex = index;
        nextReading = reading;
      }
    }

    // 次の一致までの区間に漢字が残っていれば、それは裸のまま出る。
    const plain = text.slice(cursor, nextIndex);
    for (const char of plain) {
      if (KANJI.test(char) && !seen.has(char)) {
        seen.add(char);
        found.push(char);
      }
    }

    if (!nextReading) break;
    cursor = nextIndex + nextReading.text.length;
  }

  return found;
}
