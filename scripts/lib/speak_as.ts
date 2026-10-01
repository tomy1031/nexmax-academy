/**
 * Live に **渡す ときだけ** 読みかえる 語（画面の 原稿・台帳の 文は そのまま）。
 *
 * 「Issue」を 英字（大文字）の まま 渡すと、平らな「いしゅう」（＝異臭）に 聞こえた
 *（2026-09-30 の 指摘「issue の 発音が 異臭の ように。アクセントが イシューの イに なるように」）。
 * 読みの 照合は 原稿の 字で する（台帳 `src/content/listening-sounds.ts` で Issue＝いしゅー）ので、
 * ここを 変えても 合否は 変わらない。
 */
const SPEAK_AS: readonly { readonly word: RegExp; readonly say: string; readonly note: string }[] =
  [
    /*
     * 2026-09-30 の 聞きくらべで「カタカナ＋アクセントの 指示」は 全滅（高橋・佐藤とも）。
     * 小文字の「issue」と「issue＋英語の 発音の 指示」だけが 佐藤の 声で OK だった。
     * いまは 小文字の issue を 渡す（指示は 足さない）。声に よって 当たり外れが あるので、
     * だめな 声は `@live-<番号>-picks` で 何本か 作って 耳で 選ぶ。
     */
    { word: /Issue/g, say: "issue", note: "" },
  ];

/** Live に 渡す 文と 指示（`SPEAK_AS` の 語が あれば 読みかえ、アクセントの 指示を 足す）。 */
export function speechInputOf(
  text: string,
  baseInstruction: string,
): { readonly text: string; readonly instruction: string } {
  const hits = SPEAK_AS.filter((entry) => new RegExp(entry.word.source).test(text));
  // 読みかえる 語が あっても 指示を 足さない 語（note が 空）は、指示を 変えない
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

/** 何本か 作って 耳で 選ぶ ときの 渡しかた（聞きくらべで OK だった 2通り）。 */
export const ISSUE_PICKS: readonly (typeof ISSUE_TRIALS)[number][] = ISSUE_TRIALS.filter(
  (trial) => trial.name === "issue" || trial.name === "issue-en",
);
/** 1つの 渡しかたで 作る 本数。 */
export const PICK_TAKES = 3;
