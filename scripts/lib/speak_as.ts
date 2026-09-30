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
