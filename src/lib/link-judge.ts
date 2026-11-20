/**
 * ツール教材（link）の 判定 — **Live の 判定の つなぎ**で 返事を もらう ための 決まり
 *
 * ## なぜ 要るか（2026-11-18）
 * 相談の 練習問題（`public/tools/hourensou/soudan_renshu.html`）は 静的な 1枚で、
 * 相談の 判定に Gemini を 使う。学習者の 画面で `generateContent` を 使う ことは **禁止**
 *（注意事項「Gemini は Live だけ」2026-08-20・08-27）なので、判定は アプリの
 * 判定の つなぎ（`src/components/meeting/judge-api.ts` の Live）に 頼む。ツールは
 * 頼みの 文（場面・基準・学生の ことば）を 作って 親の 画面へ 渡し、親が ここの 道具で
 * Live に 聞いて、返事（道具の 引数）を そのまま 返す。
 *
 * 合否は ツールの 側（`soudan_renshu.logic.js` の `settle`）が 決める——ここは 形だけ 見る。
 */

/** 道具の 名前。 */
export const LINK_JUDGE_TOOL_NAME = "report_consult";

/** 判定係への 決まり（つなぎの あいだ ずっと 変わらない もの）。 */
export const LINK_JUDGE_SYSTEM = [
  "あなたは 日本語の 授業の 判定係です。",
  "学生（日本語 N4・IT専攻）が、職場で 上司に 相談する 練習を します。",
  "頼みが とどいたら、かならず 1回だけ 道具 report_consult を 呼びます。",
  "声では 返事を しません（道具を 呼ぶだけ）。学生に 話しかけません。",
  "意味が 伝われば よいです。助詞や 活用の まちがい・発音・敬語の レベル・語順・言いよどみは 見ません。",
].join("\n");

const BOOL = (description: string) => ({ type: "BOOLEAN", description });

export const LINK_JUDGE_TOOL = {
  functionDeclarations: [
    {
      name: LINK_JUDGE_TOOL_NAME,
      description:
        "学生の 相談を 見て、5つの 要素の あるなし・加点・自分の ことばか・選んだ 方法・失敗の 印を 返す。頼みの たびに かならず 1回だけ 呼ぶ。",
      parameters: {
        type: "OBJECT",
        properties: {
          jokyo: BOOL("状況（いま して いる 仕事）が 入って いるか。"),
          mondai: BOOL("問題が 入って いるか。"),
          kakunin: BOOL("確認した こと・わかった ことが 入って いるか。"),
          kangae: BOOL("自分の 考え（と 理由）が 入って いるか。"),
          soudan: BOOL("相談したい こと（確認・許可・判断の お願い）が 入って いるか。"),
          own_words: BOOL(
            "ヒントの 型を うめた だけでは なく、自分で 考えた 内容を 足して いるか。",
          ),
          bonus: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "当てはまる 加点の id（頼みに 書いて ある もの だけ）。無ければ 空。",
          },
          choice: {
            type: "STRING",
            description: "学生が いいと 言った 方法の id。無ければ none。",
          },
          decided_alone: BOOL("許可を 聞かずに 自分で 決めた と 言い切って いるか。"),
          off_topic: BOOL("いまの 相談と 関係 ない 話だけか。"),
          unclear: BOOL("短すぎる・意味が とれない（相談に なって いない）か。"),
          heard_ruby: {
            type: "STRING",
            description:
              "学生の ことばを そのまま 写し、漢字の 部分だけに {漢字|よみ} の 形で ひらがなの 読みを 付けた 文（例: {一覧|いちらん}{画面|がめん}・ログイン{機能|きのう}・Web{画面|がめん}）。カタカナ・ひらがな・英字・数字には 読みを 付けない。",
          },
        },
        required: [
          "jokyo",
          "mondai",
          "kakunin",
          "kangae",
          "soudan",
          "own_words",
          "bonus",
          "choice",
          "decided_alone",
          "off_topic",
          "unclear",
          "heard_ruby",
        ],
      },
    },
  ],
};

/** 頼みの 文の 上限（ツールから 来る ものなので 長さを 切る）。 */
export const LINK_JUDGE_PROMPT_MAX = 12_000;

/** 頼みを 受けて よい 形か（文字で、空で なく、長すぎない）。 */
export function readLinkJudgePrompt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const prompt = value.trim();
  if (!prompt || prompt.length > LINK_JUDGE_PROMPT_MAX) return null;
  return prompt;
}

/** 道具の 引数を 返して よい 形か（オブジェクトで ある ことだけ。中身は ツールが 確かめる）。 */
export function readLinkJudgeArgs(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
