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
 *   3. 同じポップオーバーに **英語の意味** を添える。日本語の説明で届かなかったときの最後の受け皿
 *
 * 英語は本文には出さない。学習者に英語を読ませたいのではなく、
 * 詰まったときに1タップで抜けられる非常口として置く（§2.5）。
 *
 * 表示規則: 該当語に薄い点線の下線 → タップで 読み＋意味＋英語 のポップオーバー。
 * **1文に2語以上は下線を引かない**（同じ文で2回タップさせない。該当したら文を分ける）。
 */

export interface GlossaryEntry {
  /** 学習者向け文言に現れる表記。漢字があるなら漢字で書く（ふりがなは reading から合成する）。 */
  readonly term: string;
  /** 漢字表記（かなだけの語は null）。 */
  readonly kanji: string | null;
  /** ふりがな。term に漢字が含まれるときは、これで本文にルビを振る。 */
  readonly reading: string;
  /** 学習者に出す意味の1文（やさしい日本語）。 */
  readonly meaning: string;
  /** 意味の英語。日本語の説明で届かなかったときの受け皿。本文には出さない。 */
  readonly english: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: "組",
    kanji: "組",
    reading: "ぐみ",
    meaning: "おなじ タイプの なかまの グループ",
    english: "group — the four families of types in this app",
  },
  {
    term: "仲間",
    kanji: "仲間",
    reading: "なかま",
    meaning: "いっしょに べんきょうや しごとを する 友だち",
    english: "teammate — someone you study or work together with",
  },
  {
    term: "手順",
    kanji: "手順",
    reading: "てじゅん",
    meaning: "しごとの じゅんばん",
    english: "the steps — the order you do a job in",
  },
  {
    term: "運用",
    kanji: "運用",
    reading: "うんよう",
    meaning: "つくった システムを まいにち うごかしつづける しごと",
    english: "operations — keeping a finished system running every day",
  },
  {
    term: "対応",
    kanji: "対応",
    reading: "たいおう",
    meaning: "もんだいが 出た とき、それを なおす しごと",
    english: "handling it — dealing with a problem when one comes up",
  },
  {
    term: "仕組み",
    kanji: "仕組み",
    reading: "しくみ",
    meaning: "どう うごいて いるか。なかの つくり",
    english: "how it works — the mechanism inside",
  },
  {
    term: "設計",
    kanji: "設計",
    reading: "せっけい",
    meaning: "つくる 前に、どう つくるかを きめる こと",
    english: "design — deciding how to build it before you build it",
  },
  {
    term: "技術",
    kanji: "技術",
    reading: "ぎじゅつ",
    meaning: "つくる ための ほうほう",
    english: "technology — the methods and skills used to build things",
  },
  {
    term: "提案",
    kanji: "提案",
    reading: "ていあん",
    meaning: "「こう しませんか」と 言う こと",
    english: "a proposal — saying 「let's do it this way」",
  },
  {
    term: "目標",
    kanji: "目標",
    reading: "もくひょう",
    meaning: "めざす こと",
    english: "a goal — what you are aiming for",
  },
  {
    term: "締め切り",
    kanji: "締め切り",
    reading: "しめきり",
    meaning: "「この 日までに おわらせる」と きめた 日",
    english: "a deadline — the day the work has to be finished by",
  },
  {
    term: "段取り",
    kanji: "段取り",
    reading: "だんどり",
    meaning: "はじめる 前に、しごとの じゅんばんを きめて おく こと",
    english: "planning ahead — setting up the order of work before starting",
  },
  {
    term: "仕上げ",
    kanji: "仕上げ",
    reading: "しあげ",
    meaning: "さいごに きれいに して、おわらせる こと",
    english: "the finishing touches — the last pass that makes it clean",
  },
  {
    term: "結果",
    kanji: "結果",
    reading: "けっか",
    meaning: "やった あとに、どう なるか",
    english: "the outcome — how it turns out in the end",
  },
  {
    term: "ものづくり",
    kanji: null,
    reading: "ものづくり",
    meaning: "アプリや せいひんを 作る しごと",
    english: "making things — building apps and products",
  },
  {
    term: "おもいやり",
    kanji: "思いやり",
    reading: "おもいやり",
    meaning: "あいての きもちを かんがえる こと",
    english: "considerateness — thinking about how the other person feels",
  },
  {
    term: "おせわ",
    kanji: "お世話",
    reading: "おせわ",
    meaning: "人を てつだう こと・気を つかう こと",
    english: "looking after people — helping them and paying attention to them",
  },
  {
    term: "おうえん",
    kanji: "応援",
    reading: "おうえん",
    meaning: "「がんばって」と 言って、元気に する こと",
    english: "cheering someone on — saying 「you can do it」",
  },
  {
    term: "わくわく",
    kanji: null,
    reading: "わくわく",
    meaning: "たのしみで、むねが どきどき する きもち",
    english: "excited — the feeling of looking forward to something",
  },
  {
    term: "トラブル",
    kanji: null,
    reading: "トラブル",
    meaning: "システムが うまく うごかない こと",
    english: "trouble — when a system stops working properly",
  },
  {
    term: "スマホ",
    kanji: null,
    reading: "スマホ",
    meaning: "スマートフォン",
    english: "a smartphone",
  },
  {
    term: "よそう",
    kanji: "予想",
    reading: "よそう",
    meaning: "これから どう なるかを、先に かんがえる こと",
    english: "predicting — thinking ahead about what will happen",
  },
  {
    term: "もりあげ",
    kanji: null,
    reading: "もりあげ",
    meaning: "みんなを 楽しく、元気に する こと",
    english: "lifting the mood — making everyone lively and cheerful",
  },
] as const;

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
