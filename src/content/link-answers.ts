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
  /**
   * Renraku Master（public/tools/hourensou/renraku_slack.html）の 選ぶ 練習。
   * id は `m<ミッションの id>-q<何問目>`、文は「ミッション名 — 問い」（ページの 文を ルビを 外して 写した もの。
   * ずれたら `tests/renraku_slack_tool.test.ts` が 止める）。
   */
  renraku_slack: {
    "m1-q1": "Doc Update — 1. 誰にメンションしますか？",
    "m1-q2": "Doc Update — 2. 何をしたか伝えます (件名と事実)",
    "m1-q3": "Doc Update — 3. ファイルの場所を共有します",
    "m2-q1": "Client MTG Change — 1. メンションをして、何がどうなったか伝えます",
    "m2-q2": "Client MTG Change — 2. 【変更点】と、お願いを伝えます",
    "m3-q1": "Common Logic Update — 1. メンションと、分かりやすい件名（タイトル）を選びます",
    "m3-q2": "Common Logic Update — 2. メンバーにやってほしいアクションを伝えます",
    "m4-q1": "DB Reset Notice — 1. メンションをして、作業内容と時間を伝えます",
    "m4-q2": "DB Reset Notice — 2. チームへの影響を伝えます",
    "m5-q1": "Task Request — 1. 誰にメンションしますか？",
    "m5-q2": "Task Request — 2. 何をして ほしいか書きます",
    "m5-q3": "Task Request — 3. いつまでかを書きます",
    "m6-q1": "Bug Notice — 1. 何が起きたか伝えます",
    "m6-q2": "Bug Notice — 2. くわしい状況を書きます",
    "m6-q3": "Bug Notice — 3. 昨日のことを書きます",
    "m7-q1": "Late Arrival Notice — 1. 誰にメンションしますか？",
    "m7-q2": "Late Arrival Notice — 2. 何がどうなるか、結論を書きます",
    "m7-q3": "Late Arrival Notice — 3. 遅れる理由と、朝礼のことを書きます",
  },
  /**
   * 相談の 練習問題（public/tools/hourensou/soudan_renshu.html・2026-11-17）。
   * `l1`〜`l5` は マイクの 相談（何回目に 何と 言ったか・合否・星・加点を 1行に まとめる）。
   * `ws_*` は レベル5の 調べ表（比較表 9行×3つの API と、自分の 考え 4つ）。
   * 文は データ（`soudan_renshu.data.js`）の 見出しから ルビを 外した もの
   *（ずれたら `tests/soudan_renshu_tool.test.ts` が 止める）。
   */
  soudan_renshu: {
    l1: "レベル1 写真が ありません — マイクで 相談（何回目に 何と 言ったか）",
    l2: "レベル2 ログインが できません — マイクで 相談（何回目に 何と 言ったか）",
    l3: "レベル3 お客様から 画像が 届きません — マイクで 相談（何回目に 何と 言ったか）",
    l4: "レベル4 どちらの 仕事を 先に しますか — マイクで 相談（何回目に 何と 言ったか）",
    l5: "レベル5 OCRアプリの 技術選定 — マイクで 相談（何回目に 何と 言ったか）",
    ws_model_claude: "レベル5 比較表 — 使用する モデル名（Claude API）",
    ws_model_gpt: "レベル5 比較表 — 使用する モデル名（GPT API）",
    ws_model_gemini: "レベル5 比較表 — 使用する モデル名（Gemini API）",
    ws_file_claude: "レベル5 比較表 — PDF・画像への 対応（Claude API）",
    ws_file_gpt: "レベル5 比較表 — PDF・画像への 対応（GPT API）",
    ws_file_gemini: "レベル5 比較表 — PDF・画像への 対応（Gemini API）",
    ws_read_claude: "レベル5 比較表 — 日本語・手書き文字の 読み取り（Claude API）",
    ws_read_gpt: "レベル5 比較表 — 日本語・手書き文字の 読み取り（GPT API）",
    ws_read_gemini: "レベル5 比較表 — 日本語・手書き文字の 読み取り（Gemini API）",
    ws_json_claude: "レベル5 比較表 — JSON出力（Claude API）",
    ws_json_gpt: "レベル5 比較表 — JSON出力（GPT API）",
    ws_json_gemini: "レベル5 比較表 — JSON出力（Gemini API）",
    ws_price_claude: "レベル5 比較表 — 月 6,000件の 推定料金（Claude API）",
    ws_price_gpt: "レベル5 比較表 — 月 6,000件の 推定料金（GPT API）",
    ws_price_gemini: "レベル5 比較表 — 月 6,000件の 推定料金（Gemini API）",
    ws_speed_claude: "レベル5 比較表 — 処理速度（Claude API）",
    ws_speed_gpt: "レベル5 比較表 — 処理速度（GPT API）",
    ws_speed_gemini: "レベル5 比較表 — 処理速度（Gemini API）",
    ws_security_claude: "レベル5 比較表 — セキュリティ（Claude API）",
    ws_security_gpt: "レベル5 比較表 — セキュリティ（GPT API）",
    ws_security_gemini: "レベル5 比較表 — セキュリティ（Gemini API）",
    ws_merit_claude: "レベル5 比較表 — メリット（Claude API）",
    ws_merit_gpt: "レベル5 比較表 — メリット（GPT API）",
    ws_merit_gemini: "レベル5 比較表 — メリット（Gemini API）",
    ws_demerit_claude: "レベル5 比較表 — デメリット（Claude API）",
    ws_demerit_gpt: "レベル5 比較表 — デメリット（GPT API）",
    ws_demerit_gemini: "レベル5 比較表 — デメリット（Gemini API）",
    ws_best: "レベル5 自分の 考え — 自分が 一番 いいと 思う API",
    ws_why: "レベル5 自分の 考え — その APIを 選んだ 理由",
    ws_unknown: "レベル5 自分の 考え — まだ わからない ことや、テストが 必要な こと",
    ws_decide: "レベル5 自分の 考え — 上司に 何を 決めて もらいたいか",
  },
};

/** その 教材の こたえの 並び（先生の 画面の Q1・Q2… の 順に なる）。 */
export function linkAnswerOrder(linkId: string): readonly string[] {
  return Object.keys(LINK_ANSWER_PROMPTS[linkId] ?? {});
}
