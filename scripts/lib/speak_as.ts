/**
 * Live に **渡す ときだけ** 読みかえる 語（画面の 原稿・台帳の 文は そのまま）。
 *
 * 「Issue」を 英字の まま 渡すと、平らな「いしゅう」（＝異臭）に 聞こえた
 *（2026-09-30 の 指摘「issue の 発音が 異臭の ように。アクセントが イシューの イに なるように」）。
 * カタカナに して、アクセントの 位置も 言い渡す。読みの 照合は 原稿の 字で する
 *（台帳 `src/content/listening-sounds.ts` で Issue＝いしゅー）ので、ここを 変えても 合否は 変わらない。
 */
const SPEAK_AS: readonly { readonly word: RegExp; readonly say: string; readonly note: string }[] =
  [
    {
      word: /Issue/g,
      say: "イシュー",
      note:
        "「イシュー」は英語の issue のことです。最初の「イ」を高く、「イ↘シュー」と頭にアクセントを置いて読んでください。" +
        "「異臭（いしゅう）」のように平らに読まないでください。" +
        // 2026-09-30: アクセントだけ 言い渡すと「いしょう」に 聞こえる 回が 続いた（佐藤の 声で 8回中 6回）
        "「シュー」は「しゅう」の音です。「しょう」にしないでください。",
    },
  ];

/** Live に 渡す 文と 指示（`SPEAK_AS` の 語が あれば 読みかえ、アクセントの 指示を 足す）。 */
export function speechInputOf(
  text: string,
  baseInstruction: string,
): { readonly text: string; readonly instruction: string } {
  const hits = SPEAK_AS.filter((entry) => new RegExp(entry.word.source).test(text));
  return {
    text: hits.reduce((out, entry) => out.replace(entry.word, entry.say), text),
    instruction: baseInstruction + hits.map((entry) => entry.note).join(""),
  };
}

/**
 * 「Issue」の 渡しかたの 聞きくらべ（`<教材ID>@live-<番号>-trials`）。
 *
 * 2026-09-30、カタカナ＋アクセントの 指示でも「音声は 全滅」（まだ 異臭の ように 聞こえる）。
 * ユーザーの 問い「issue で インプットしても だめですか？」に 答える ため、同じ 文を
 * 渡しかたを 変えて 1本ずつ 作り、耳で 選んで もらう。
 */
export const ISSUE_TRIALS: readonly {
  readonly name: string;
  readonly say: string;
  readonly note: string;
}[] = [
  { name: "issue", say: "issue", note: "" },
  {
    name: "issue-en",
    say: "issue",
    note: "「issue」は英語の単語です。日本語風に平らに読まず、英語の issue（ISH-oo）の発音で、最初の音を強く読んでください。",
  },
  { name: "katakana", say: "イシュー", note: "" },
  { name: "sokuon", say: "イッシュー", note: "" },
];

/** 聞きくらべの 1本ぶんの 渡す 文と 指示。 */
export function trialInputOf(
  text: string,
  baseInstruction: string,
  trial: (typeof ISSUE_TRIALS)[number],
): { readonly text: string; readonly instruction: string } {
  return { text: text.replace(/Issue/g, trial.say), instruction: baseInstruction + trial.note };
}
