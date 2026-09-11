/**
 * ツール教材（link）から 親へ 届く 合図の 読み取り
 *
 * ## なぜ 部品に 分けたか
 * 受け口は `src/components/link/link-view.tsx` の `window.addEventListener("message")`
 * の 中に あり、**そこは テストから 通しにくい**（画面と 効果の 中）。
 * ところが ここは いま **関門の 鍵**（`owns-done`）と **学習者の こたえ**（`answers`）を
 * 運ぶ 道で、取りちがえの 害が いちばん 大きい。判断だけを 純粋な 関数に 出して 固定する。
 *
 * ## 何を 信じないか
 * - 差出人（`event.origin`）は **呼ぶ側**が 先に 見る（ここには 渡って こない）
 * - 種別が 知らない ものは 捨てる
 * - **id は 必須**。どの 教材の 合図か 分からない ものは 受けない
 *   （`link-done` だけは 例外。id を 付けない 古い ページが 残って いる
 *    ——`public/tools/romaji/app.js`）
 */

/** 中のページが「おわった」を 伝えて くる 合図。 */
export const DONE_MESSAGE = "nexmax:link-done";

/** 中のページが「**おわりの しるしは こちらで 出す**」と 名乗る 合図。 */
export const OWNS_DONE_MESSAGE = "nexmax:link-owns-done";

/** 中のページが **学習者の 書いた もの**を 渡して くる 合図。 */
export const ANSWERS_MESSAGE = "nexmax:link-answers";

export type LinkMessage =
  | { readonly kind: "done" }
  | { readonly kind: "owns-done" }
  | { readonly kind: "answers"; readonly answers: unknown };

/**
 * この 教材あての 合図か。ちがえば `null`。
 *
 * @param data   `event.data`（何が 来るか 分からない）
 * @param linkId いま 開いて いる 教材の id
 */
export function readLinkMessage(data: unknown, linkId: string): LinkMessage | null {
  if (!data || typeof data !== "object") return null;
  const { type, id } = data as { type?: unknown; id?: unknown };
  if (typeof type !== "string") return null;

  if (type === DONE_MESSAGE) {
    // id が あれば 合って いる ことを 確かめる。無い ものは これまでどおり 通す
    if (typeof id === "string" && id !== linkId) return null;
    return { kind: "done" };
  }
  // 下の 2つは **鍵と 記録**なので id を 必須に する
  if (id !== linkId) return null;
  if (type === OWNS_DONE_MESSAGE) return { kind: "owns-done" };
  if (type === ANSWERS_MESSAGE) {
    return { kind: "answers", answers: (data as { answers?: unknown }).answers };
  }
  return null;
}
