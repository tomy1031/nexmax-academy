/**
 * ツール教材（link）が 先生の 画面へ 送る こたえの 台帳
 *
 * ## なぜ 要るか
 * `public/tools/**` の ツールは **静的な 1枚**で、アプリの データ（zodスキーマ）を
 * 持たない。だから 学習の きろく（`/admin/records`）が 行を 描く ときに、
 * 「その こたえは 何を 聞かれた ものか」を どこからも 引けない——記録の 列に
 * `kaikyuu` のような id が 並び、先生は ツールを 開かないと 意味が 分からない。
 *
 * ここに **問いの 文だけ**を 置いて、`src/lib/records/units.ts` が
 * もんだい・ミーティングと 同じ 引き出し（`<教材id>:<問いid>`）に 混ぜる。
 *
 * ## ツール側の 文言と ずれたら テストが 止める
 * 文は 2か所に ある（ここと ツールの `*.data.js`）。片方だけ 直すと、先生の 画面だけが
 * 古い 問いを 出す——`tests/houkoku_search_tool.test.ts` が 突き合わせる。
 * 減らすには ツールを アプリの データに 寄せる しか なく、それは 静的な 1枚で ある
 * 意味（軽さ・先生が HTML を 直せる こと）を 失う ので、いまは 台帳＋検査で 保つ。
 */

/** `<link の id>` → `<こたえの id>` → 問いの 文。 */
export const LINK_ANSWER_PROMPTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  houkoku_search: {
    /** ↑↓で ならべ替えた 階級（1つの 行に まとめて 残す）。 */
    kaikyuu_order: "日本の 会社の 階級を、えらい 順に ならべて ください。",
    kaikyuu: "カンボジアの 会社の 階級は どうですか。",
    houkoku: "「報告」への 考え方は、日本と ちがいますか。",
    joushi: "「上司」との 関係は、日本と ちがいますか。",
  },
};

/** その 教材の こたえの 並び（先生の 画面の Q1・Q2… の 順に なる）。 */
export function linkAnswerOrder(linkId: string): readonly string[] {
  return Object.keys(LINK_ANSWER_PROMPTS[linkId] ?? {});
}
