/**
 * 語彙メモ — 学習者向け文言に出る職場語の読みと意味。
 * 仕様: docs/design/07_性格タイプ設計_MBTI16.md §2.5
 *
 * 01ガイド R6-1 は実務語彙の平易語化を違反としている（「要件定義」→「決めること」は不可）。
 * 一方でN4学習中の学生には、むずかしい語は読めても意味が出ない。
 *
 * **ひらがなに開いても解決しない。** 「うんよう」と書いても、意味を知らなければ
 * 意味ゼロの4拍にしかならない。むしろ漢字が消えるぶん手がかりが減る。
 * そこで方針は次の3層:
 *   1. 本文は **漢字＋ふりがな** で書く（N4を超える漢字でもよい。読みは合成で出す）
 *   2. 語には点線の下線。タップで **やさしい日本語の意味** を出す
 *   3. 同じポップオーバーに **英語** を添える。日本語の説明で届かなかったときの受け皿
 *
 * 英語は本文には出さない。学習者に英語を読ませたいのではなく、
 * 詰まったときに1タップで抜けられる非常口として置く（§2.5）。
 *
 * **ポップオーバーの並びは 日本語 → 英語 → 日本語の意味 → 英語の意味 の4段。**
 * まだN4を勉強中の学習者は、やさしい日本語の説明でも読み切れないことがある。
 * 対訳の1語（`englishTerm`）を**説明より先**に置くと、そこで足りた人は
 * 説明を読まずに設問へ戻れる。説明が要る人だけが下の2段を読めばよい。
 * 同じ理由で「ことばメモ」のチップにも `日本語 / english` を並べて出す。
 *
 * 表示規則: 該当語に薄い点線の下線 → ホバー（またはタップ）でポップオーバー。
 * **1文に2語以上は下線を引かない**（同じ文で2回タップさせない。該当したら文を分ける）。
 */

import { GENERATED_GLOSSARY } from "./glossary.generated";

export interface GlossaryEntry {
  /** 学習者向け文言に現れる表記。漢字があるなら漢字で書く（ふりがなは reading から合成する）。 */
  readonly term: string;
  /** 漢字表記（かなだけの語は null）。 */
  readonly kanji: string | null;
  /** ふりがな。term に漢字が含まれるときは、これで本文にルビを振る。 */
  readonly reading: string;
  /** 学習者に出す意味の1文（やさしい日本語）。 */
  readonly meaning: string;
  /**
   * 対訳の1語。**説明ではなく見出し**なので短く保つ（チップにも並べて出す）。
   * まだN4を勉強中の学習者が、説明を読まずにここで足りるようにするための段。
   */
  readonly englishTerm: string;
  /** 意味の英語。日本語の説明でも英語1語でも届かなかったときの最後の受け皿。 */
  readonly englishMeaning: string;
}

/**
 * 語彙メモの 中身は **ことばの 正**（`content/vocab/*.json`）から 焼いた もの。
 *
 * 語彙は かつて 5か所に あり、同じ ことばの 説明が 別々に 育っていた（2026-08-20 に
 * 1か所へ まとめた）。ここに 直に 並べると **6つめの 置き場**に 戻ってしまうので、
 * データは 持たず 生成物を 通す。語を 直す ときは 正の JSON を 直す。
 */
export const GLOSSARY: readonly GlossaryEntry[] = GENERATED_GLOSSARY;

const BY_TERM = new Map(GLOSSARY.map((entry) => [entry.term, entry]));

export function getGlossaryEntry(term: string): GlossaryEntry | null {
  return BY_TERM.get(term) ?? null;
}

/**
 * 文中で最初に見つかった語彙メモ対象を1件だけ返す。
 * 1文に2語以上の下線を引かないという規則（§2.5）を、呼び出し側で守りやすくするためのヘルパー。
 * 同じ位置から始まる語が複数あるときは長い語を優先する（「仕組み」を「組」に取られないように）。
 */
export function findGlossaryTerm(sentence: string): GlossaryEntry | null {
  let found: GlossaryEntry | null = null;
  let foundAt = Number.POSITIVE_INFINITY;

  for (const entry of GLOSSARY) {
    const index = sentence.indexOf(entry.term);
    if (index === -1) continue;
    if (index < foundAt || (index === foundAt && entry.term.length > (found?.term.length ?? 0))) {
      found = entry;
      foundAt = index;
    }
  }
  return found;
}

/**
 * 文中に出るすべての語彙メモ対象を、出現順に重複なしで返す。
 *
 * `findGlossaryTerm`（1件だけ）は本文に下線を引く用。こちらは**設問カードの下に
 * 「ことばメモ」を並べる用**（07 §2.5）。Ⓐ/Ⓑ の選択肢は `<button>` の中にあり
 * ボタンを入れ子にできないので、選択肢の語はここでしか支えられない。
 *
 * 同じ位置では長い語を優先し（「仕組み」を「組」に取られない）、
 * 一致した分だけ読み進めるので語が重ならない。
 */
export function findAllGlossaryTerms(...sentences: readonly string[]): GlossaryEntry[] {
  const found: GlossaryEntry[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    let cursor = 0;
    while (cursor < sentence.length) {
      let hit: GlossaryEntry | null = null;
      for (const entry of GLOSSARY) {
        if (!sentence.startsWith(entry.term, cursor)) continue;
        if (!hit || entry.term.length > hit.term.length) hit = entry;
      }
      if (hit) {
        if (!seen.has(hit.term)) {
          seen.add(hit.term);
          found.push(hit);
        }
        cursor += hit.term.length;
      } else {
        cursor += 1;
      }
    }
  }
  return found;
}
