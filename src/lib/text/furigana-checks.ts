/**
 * 読み辞書エントリの構造検査 — 「そのエントリは 画面で ちゃんと 働けるか」。
 *
 * ふりがなの事故は 3つの 型で 繰り返し 起きた（2026-08-25 #197 / 08-28 #233 / 08-30 監査）:
 *
 *  1. **死にエントリ**: 見出しの 先頭が かな・数字だと、`annotateRuby` は 漢字の 位置から
 *     しか 引かないので **絶対に 当たらない**。「お時間 → おじかん」と 書いても 画面は
 *     単漢字の 読みで 出て、書いた 人には 覆えて いる ように 見える（いちばん たちが 悪い）。
 *  2. **送りがな落ち**: 「考え → かんが」の ように、見出しの かな部分が 読みに 無いと、
 *     画面では 「考え(かんが)ます」＝ *かんがます* と 読める。
 *  3. **同表記異読**: 同じ 表記に 別の 読みが 2つ あると、どちらが 勝つかは 並び順しだいで、
 *     検査（先勝ち）と 画面（`mergeFuriganaEntries` は 後勝ち）で **逆**になる。
 *
 * どれも 「覆えて いるか」の 検査（checkFuriganaCoverage）は 素通しする。
 * ここは エントリ **そのもの** を 見る——書いた 時点で 壊れて いる ものを 保存させない。
 *
 * 純関数のみ（node:fs も React も 無い）。コンテンツの furigana 配列にも、
 * コード側の 読み台帳（ai-kanji / ui-furigana / feedback / personality）にも 同じ 検査を 当てる。
 */

import { KANJI, type FuriganaEntry } from "./furigana";

/** 読み1文字（スキーマ `hiragana` と同じ範囲: ひらがな・ー・ゔ・・・空白）。 */
const READING_CHAR = "[ぁ-ゖーゔ・\\s]";

/** ひらがな・カタカナ・ー（見出しの「かな部分」の判定）。 */
const KANA = /[ぁ-ゖァ-ヶー]/;

/** エントリ1件の問題。 */
export interface EntryProblem {
  readonly surface: string;
  readonly reading: string;
  readonly kind: "dead" | "misaligned" | "conflict";
  readonly message: string;
}

/** カタカナをひらがなへ倒す（読みの照合は かなの 別で 落とさない）。 */
export function foldKana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

type Run = { readonly type: "kanji" | "kana" | "other"; readonly text: string };

/** 見出しを 漢字・かな・その他 の 連続に 割る。 */
function surfaceRuns(surface: string): Run[] {
  const runs: Run[] = [];
  for (const ch of surface) {
    const type: Run["type"] = KANJI.test(ch) ? "kanji" : KANA.test(ch) ? "kana" : "other";
    const last = runs[runs.length - 1];
    if (last && last.type === type) runs[runs.length - 1] = { type, text: last.text + ch };
    else runs.push({ type, text: ch });
  }
  return runs;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 見出しに対して「読みが 構造的に あり得る 形か」を見る正規表現。
 *  - 漢字の連続 … 読み1文字以上（何と読むかは ここでは 見ない。読みの中身は yomi 照合の 担当）
 *  - かなの連続 … 読みに **そのまま** 現れる（送りがな。無いと 画面の 読みが 欠ける）
 *  - その他（数字・記号）… 読みに 現れても 現れなくても よい（「第1回 → だいいっかい」）
 */
function readingPattern(surface: string): RegExp | null {
  const runs = surfaceRuns(surface);
  if (!runs.some((run) => run.type === "kanji")) return null;
  const body = runs
    .map((run) => {
      if (run.type === "kanji") return `${READING_CHAR}+`;
      if (run.type === "kana") return escapeRe(foldKana(run.text));
      return `${READING_CHAR}*`;
    })
    .join("");
  return new RegExp(`^${body}$`);
}

/** エントリ1件の検査（死にエントリ・送りがな整合）。問題が無ければ null。 */
export function checkFuriganaEntry(surface: string, reading: string): EntryProblem | null {
  if (!KANJI.test(surface.charAt(0))) {
    return {
      surface,
      reading,
      kind: "dead",
      message:
        `["${surface}", "${reading}"] は 先頭が 漢字でない — ルビ合成（annotateRuby）は 漢字の 位置からしか 引かないので、この 見出しは **絶対に 当たらない**。` +
        `漢字から 始まる 形に 直す（例: ["お願い","おねがい"] → ["願い","ねがい"]）か、消す`,
    };
  }
  const pattern = readingPattern(surface);
  if (pattern && !pattern.test(foldKana(reading))) {
    return {
      surface,
      reading,
      kind: "misaligned",
      message:
        `["${surface}", "${reading}"] は 見出しの かな部分が 読みに 無い — 画面では 送りがなが 欠けて 読める` +
        `（「考え→かんが」は「考(かんが)え」でなく **考え 全体に かんが** が 付き、「かんがます」と 読めた 2026-08-30 の 実事故）。` +
        `読みを かなまで 含めた 形に 直す（例: ["考え","かんがえ"]）`,
    };
  }
  return null;
}

/**
 * エントリの 集まり（1つの 索引に 入る もの）の 検査。
 * 個々の 検査に 加えて、**同じ 表記に 別の 読み**を 見つける——並び順で 勝ち負けが
 * 変わり、検査（先勝ち）と 画面（後勝ち）で 逆に なるので、置いた 時点で 誤り。
 */
export function checkFuriganaEntries(entries: readonly FuriganaEntry[]): EntryProblem[] {
  const problems: EntryProblem[] = [];
  const seen = new Map<string, string>();
  for (const [surface, reading] of entries) {
    const problem = checkFuriganaEntry(surface, reading);
    if (problem) problems.push(problem);
    const prev = seen.get(surface);
    if (prev !== undefined && prev !== reading) {
      problems.push({
        surface,
        reading,
        kind: "conflict",
        message:
          `「${surface}」に 読みが 2つ ある（"${prev}" と "${reading}"）— どちらが 勝つかは 並び順しだいで、` +
          `検査と 画面で 逆に なる。読みを 1つに するか、文脈ごと（送りがな・複合語）の 見出しに 分ける`,
      });
    }
    if (prev === undefined) seen.set(surface, reading);
  }
  return problems;
}
