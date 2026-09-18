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

/**
 * 中のページが「**前に 出した こたえが あれば ください**」と 頼む 合図。
 * ページの 端末に 何も 残って いない（別の 端末・別の URL で 開いた）ときだけ 来る。
 */
export const RESTORE_REQUEST_MESSAGE = "nexmax:link-restore-request";

/*
 * ここから 下の 2つは **アプリ → 中のページ**（返事）。
 *
 * 中のページは 返事が 来るまで「先生に とどいた」と 思わない。以前は 送った 瞬間に
 * 届いた ことに して いたので、受け手が いない とき（別の タブ・保存の 仕組みが
 * 入る 前に 出した 人）の こたえが **二度と 送られず** DB に 1件も 残らなかった
 *（2026-09-18 に 調査の こたえが 0件と 分かった）。
 */

/** DB に 入った（先生に とどいた）。`key` は 中のページが 付けた 札を そのまま 返す。 */
export const SAVED_MESSAGE = "nexmax:link-answers-saved";

/** 前に 出した こたえ（DB から 読んだ もの）。 */
export const RESTORE_MESSAGE = "nexmax:link-restore";

/** 返事に 付けて 返す 札の 長さの 上限（外から 来る ものなので 際限なく 受けない）。 */
const MAX_KEY = 100;

export type LinkMessage =
  | { readonly kind: "done" }
  | { readonly kind: "owns-done" }
  | { readonly kind: "answers"; readonly answers: unknown; readonly key?: string }
  | { readonly kind: "restore-request" };

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
  // ここから 下は **鍵と 記録**なので id を 必須に する
  if (id !== linkId) return null;
  if (type === OWNS_DONE_MESSAGE) return { kind: "owns-done" };
  if (type === ANSWERS_MESSAGE) {
    const { answers, key } = data as { answers?: unknown; key?: unknown };
    // 札の 無い 古い ページも 受ける（記録は 残す。返事を 返さない だけ）
    if (typeof key !== "string" || key === "" || key.length > MAX_KEY) {
      return { kind: "answers", answers };
    }
    return { kind: "answers", answers, key };
  }
  if (type === RESTORE_REQUEST_MESSAGE) return { kind: "restore-request" };
  return null;
}
