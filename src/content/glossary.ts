/**
 * 語彙メモ — 学習者向け文言に出る職場語の読みと意味。
 * 仕様: docs/design/07_性格タイプ設計_MBTI16.md §2.5
 *
 * 01ガイド R6-1 は実務語彙の平易語化を違反としている（「要件定義」→「決めること」は不可）。
 * 一方でN4学習中の学生には、ひらがな4拍の漢語（うんよう・たいおう）は意味ゼロの未知語になる。
 * 「残す」と「読める」を両立させるための機構がこれ。
 *
 * 表示規則: 該当語に薄い点線の下線 → タップで 読み＋意味 のポップオーバー。
 * **1文に2語以上は下線を引かない**（同じ文で2回タップさせない。該当したら文を分ける）。
 */

export interface GlossaryEntry {
  /** 学習者向け文言に現れる表記。 */
  readonly term: string;
  /** 漢字表記（かなだけの語は null）。 */
  readonly kanji: string | null;
  readonly reading: string;
  /** 学習者に出す意味の1文。 */
  readonly meaning: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: "組",
    kanji: "組",
    reading: "ぐみ",
    meaning: "おなじ タイプの なかまの グループ",
  },
  {
    term: "なかま",
    kanji: "仲間",
    reading: "なかま",
    meaning: "いっしょに べんきょう・しごとを する 友だち",
  },
  {
    term: "てじゅん",
    kanji: "手順",
    reading: "てじゅん",
    meaning: "しごとの じゅんばん",
  },
  {
    term: "うんよう",
    kanji: "運用",
    reading: "うんよう",
    meaning: "つくった システムを まいにち うごかしつづける しごと",
  },
  {
    term: "たいおう",
    kanji: "対応",
    reading: "たいおう",
    meaning: "もんだいが 出た とき、それを なおす しごと",
  },
  {
    term: "しくみ",
    kanji: "仕組み",
    reading: "しくみ",
    meaning: "どう うごいて いるか。なかの つくり",
  },
  {
    term: "せっけい",
    kanji: "設計",
    reading: "せっけい",
    meaning: "つくる 前に、どう つくるかを きめる こと",
  },
  {
    term: "ぎじゅつ",
    kanji: "技術",
    reading: "ぎじゅつ",
    meaning: "つくる ための ほうほう",
  },
  {
    term: "ていあん",
    kanji: "提案",
    reading: "ていあん",
    meaning: "「こう しませんか」と 言う こと",
  },
  {
    term: "もくひょう",
    kanji: "目標",
    reading: "もくひょう",
    meaning: "めざす こと",
  },
  {
    term: "しめきり",
    kanji: "締め切り",
    reading: "しめきり",
    meaning: "「この 日までに おわらせる」と きめた 日",
  },
  {
    term: "だんどり",
    kanji: "段取り",
    reading: "だんどり",
    meaning: "しごとの じゅんばんを きめる こと",
  },
  {
    term: "しあげ",
    kanji: "仕上げ",
    reading: "しあげ",
    meaning: "さいごに きれいに して、おわらせる こと",
  },
  {
    term: "ものづくり",
    kanji: null,
    reading: "ものづくり",
    meaning: "アプリや せいひんを 作る しごと",
  },
  {
    term: "おもいやり",
    kanji: "思いやり",
    reading: "おもいやり",
    meaning: "あいての きもちを かんがえる こと",
  },
  {
    term: "おせわ",
    kanji: "お世話",
    reading: "おせわ",
    meaning: "人を てつだう こと・気を つかう こと",
  },
  {
    term: "おうえん",
    kanji: "応援",
    reading: "おうえん",
    meaning: "「がんばって」と 言って、元気に する こと",
  },
  {
    term: "わくわく",
    kanji: null,
    reading: "わくわく",
    meaning: "たのしみで、むねが どきどき する きもち",
  },
  {
    term: "トラブル",
    kanji: null,
    reading: "トラブル",
    meaning: "システムが うまく うごかない こと",
  },
  {
    term: "スマホ",
    kanji: null,
    reading: "スマホ",
    meaning: "スマートフォン",
  },
  {
    term: "よそう",
    kanji: "予想",
    reading: "よそう",
    meaning: "これから どう なるかを、先に かんがえる こと",
  },
  {
    term: "もりあげ",
    kanji: null,
    reading: "もりあげ",
    meaning: "みんなを 楽しく、元気に する こと",
  },
  {
    term: "けっか",
    kanji: "結果",
    reading: "けっか",
    meaning: "しらべて わかった こと",
  },
] as const;

const BY_TERM = new Map(GLOSSARY.map((entry) => [entry.term, entry]));

export function getGlossaryEntry(term: string): GlossaryEntry | null {
  return BY_TERM.get(term) ?? null;
}

/**
 * 文中で最初に見つかった語彙メモ対象を1件だけ返す。
 * 1文に2語以上の下線を引かないという規則（§2.5）を、呼び出し側で守りやすくするためのヘルパー。
 * 長い語を優先して、部分一致による取りこぼしを防ぐ。
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
