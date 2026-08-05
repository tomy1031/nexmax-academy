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

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: "組",
    kanji: "組",
    reading: "ぐみ",
    meaning: "おなじ タイプの なかまの グループ",
    englishTerm: "group",
    englishMeaning: "the four families of types in this app",
  },
  {
    term: "仲間",
    kanji: "仲間",
    reading: "なかま",
    meaning: "いっしょに べんきょうや しごとを する 友だち",
    englishTerm: "teammate",
    englishMeaning: "someone you study or work together with",
  },
  {
    term: "手順",
    kanji: "手順",
    reading: "てじゅん",
    meaning: "しごとの じゅんばん",
    englishTerm: "steps",
    englishMeaning: "the order you do a job in",
  },
  {
    term: "運用",
    kanji: "運用",
    reading: "うんよう",
    meaning: "つくった システムを まいにち うごかしつづける しごと",
    englishTerm: "operations",
    englishMeaning: "keeping a finished system running every day",
  },
  {
    term: "対応",
    kanji: "対応",
    reading: "たいおう",
    meaning: "もんだいが 出た とき、それを なおす しごと",
    englishTerm: "handling",
    englishMeaning: "dealing with a problem when one comes up",
  },
  {
    term: "仕組み",
    kanji: "仕組み",
    reading: "しくみ",
    meaning: "どう うごいて いるか。なかの つくり",
    englishTerm: "mechanism",
    englishMeaning: "how something works inside",
  },
  {
    term: "設計",
    kanji: "設計",
    reading: "せっけい",
    meaning: "つくる 前に、どう つくるかを きめる こと",
    englishTerm: "design",
    englishMeaning: "deciding how to build it before you build it",
  },
  {
    term: "技術",
    kanji: "技術",
    reading: "ぎじゅつ",
    meaning: "つくる ための ほうほう",
    englishTerm: "technology",
    englishMeaning: "the methods and skills used to build things",
  },
  {
    term: "提案",
    kanji: "提案",
    reading: "ていあん",
    meaning: "「こう しませんか」と 言う こと",
    englishTerm: "proposal",
    englishMeaning: "saying 「let's do it this way」",
  },
  {
    term: "目標",
    kanji: "目標",
    reading: "もくひょう",
    meaning: "「ここまで やる」と きめた こと",
    englishTerm: "goal",
    englishMeaning: "what you are trying to reach",
  },
  {
    term: "締め切り",
    kanji: "締め切り",
    reading: "しめきり",
    meaning: "「この 日までに おわらせる」と きめた 日",
    englishTerm: "deadline",
    englishMeaning: "the day the work has to be finished by",
  },
  {
    term: "段取り",
    kanji: "段取り",
    reading: "だんどり",
    meaning: "はじめる 前に、しごとの じゅんばんを きめて おく こと",
    englishTerm: "planning ahead",
    englishMeaning: "setting up the order of work before starting",
  },
  {
    term: "仕上げ",
    kanji: "仕上げ",
    reading: "しあげ",
    meaning: "さいごに きれいに して、おわらせる こと",
    englishTerm: "finishing touches",
    englishMeaning: "the last pass that makes it clean",
  },
  {
    term: "結果",
    kanji: "結果",
    reading: "けっか",
    meaning: "やった あとに、どう なるか",
    englishTerm: "outcome",
    englishMeaning: "how it turns out in the end",
  },
  {
    term: "ものづくり",
    kanji: null,
    reading: "ものづくり",
    meaning: "アプリや せいひんを 作る しごと",
    englishTerm: "making things",
    englishMeaning: "building apps and products",
  },
  {
    term: "おもいやり",
    kanji: "思いやり",
    reading: "おもいやり",
    meaning: "あいての きもちを かんがえる こと",
    englishTerm: "considerateness",
    englishMeaning: "thinking about how the other person feels",
  },
  {
    term: "おせわ",
    kanji: "お世話",
    reading: "おせわ",
    meaning: "人を てつだう こと・気を つかう こと",
    englishTerm: "looking after people",
    englishMeaning: "helping them and paying attention to them",
  },
  {
    term: "おうえん",
    kanji: "応援",
    reading: "おうえん",
    meaning: "「がんばって」と 言って、元気に する こと",
    englishTerm: "cheering on",
    englishMeaning: "saying 「you can do it」",
  },
  {
    term: "わくわく",
    kanji: null,
    reading: "わくわく",
    meaning: "たのしみで、はやく やりたいと 思う きもち",
    englishTerm: "excited",
    englishMeaning: "the feeling of looking forward to something",
  },
  {
    term: "トラブル",
    kanji: null,
    reading: "トラブル",
    meaning: "システムが うまく うごかない こと",
    englishTerm: "trouble",
    englishMeaning: "when a system stops working properly",
  },
  {
    term: "スマホ",
    kanji: null,
    reading: "スマホ",
    meaning: "スマートフォン",
    englishTerm: "smartphone",
    englishMeaning: "a phone you can use like a small computer",
  },
  {
    term: "よそう",
    kanji: "予想",
    reading: "よそう",
    meaning: "これから どう なるかを、先に かんがえる こと",
    englishTerm: "predicting",
    englishMeaning: "thinking ahead about what will happen",
  },
  {
    term: "もりあげ",
    kanji: null,
    reading: "もりあげ",
    meaning: "みんなを 楽しく、元気に する こと",
    englishTerm: "lifting the mood",
    englishMeaning: "making everyone lively and cheerful",
  },
  {
    term: "性格",
    kanji: "性格",
    reading: "せいかく",
    meaning: "その 人の、いつもの かんがえかたや やりかた",
    englishTerm: "personality",
    englishMeaning: "the way a person usually thinks and acts",
  },
  {
    term: "診断",
    kanji: "診断",
    reading: "しんだん",
    meaning: "しつもんに 答えて、じぶんの ことを しらべる こと",
    englishTerm: "check-up",
    englishMeaning: "answering questions to find out about yourself",
  },
  {
    term: "意見",
    kanji: "意見",
    reading: "いけん",
    meaning: "「そう 思う」と じぶんが かんがえた こと",
    englishTerm: "opinion",
    englishMeaning: "what you think about something",
  },
  {
    term: "一生懸命",
    kanji: "一生懸命",
    reading: "いっしょうけんめい",
    meaning: "力を ぜんぶ 出して やる こと",
    englishTerm: "with all your effort",
    englishMeaning: "putting all your energy into what you do",
  },
  {
    term: "安心",
    kanji: "安心",
    reading: "あんしん",
    meaning: "しんぱいが なくなって、きもちが 楽に なる こと",
    englishTerm: "relief",
    englishMeaning: "the calm you feel when you stop worrying",
  },
  {
    term: "途中",
    kanji: "途中",
    reading: "とちゅう",
    meaning: "はじめてから おわるまでの あいだ",
    englishTerm: "partway",
    englishMeaning: "after starting but before finishing",
  },
  {
    term: "試す",
    kanji: "試す",
    reading: "ためす",
    meaning: "できるか どうか、いちど やって みる こと",
    englishTerm: "to try",
    englishMeaning: "doing it once to see what happens",
  },
  {
    term: "例",
    kanji: "例",
    reading: "れい",
    meaning: "「たとえば こういう こと」と 見せる もの",
    englishTerm: "example",
    englishMeaning: "something shown to explain what you mean",
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
