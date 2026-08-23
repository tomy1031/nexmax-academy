/**
 * ことばの辞典 — サイトに 出る ITの ことばと しごとの ことば。
 *
 * **語の 中身は ここに 書かない。** 正は 教材データ（`content/vocab/*.json`）で、
 * `npm run gen:content` が `../glossary.generated.js` に 写す。
 * 単語テスト（ことばアーケード）と 同じ 語を 使う ためで、ここに 書き写すと
 * 辞典と テストで 意味が ちがう ものに なる。
 */

export const DICTIONARY = {
  id: "dictionary",
  nav: "ことばの辞典",
  title: {
    n4: "ことばの 辞典",
    n3: "IT・ビジネス日本語 辞典",
    en: "Word list",
  },
  blocks: [
    {
      kind: "paragraph",
      text: {
        n4: "この サイトに 出て くる ことばを あつめました。分からない ことばが あったら、ここで さがして ください。",
        n3: "このサイトに登場することばをまとめました。分からないことばがあれば、ここで探してください。",
        en: "Words used on this site. If something is unclear, look it up here.",
      },
    },
    { kind: "glossary" },
  ],
};
