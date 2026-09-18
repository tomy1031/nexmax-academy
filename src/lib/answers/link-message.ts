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
 * 中のページが「**いま だれが 開いて いて、DB に 前の こたえが あるか**」を 聞く 合図。
 * こたえを 集める ページは 開くたびに 来る。返事（`STATE_MESSAGE`）が 来るまで
 * ページは 端末の 控えを 見せも 送りも しない。
 */
export const HELLO_MESSAGE = "nexmax:link-hello";

/*
 * ここから 下の 2つは **アプリ → 中のページ**（返事）。
 *
 * 中のページは 返事が 来るまで「先生に とどいた」と 思わない。以前は 送った 瞬間に
 * 届いた ことに して いたので、受け手が いない とき（別の タブ・保存の 仕組みが
 * 入る 前に 出した 人）の こたえが **二度と 送られず** DB に 1件も 残らなかった
 *（2026-09-18 に 調査の こたえが 0件と 分かった）。
 */

/** DB に 入った（先生に とどいた）。`key` は 中のページが 付けた 1回の id を そのまま 返す。 */
export const SAVED_MESSAGE = "nexmax:link-answers-saved";

/**
 * `HELLO_MESSAGE` への 返事: **ログイン中の 人**（`owner`・デモモードでは null）と、
 * その 人が DB に 残した **最後の こたえ**（`answers`・`attemptId`）。
 *
 * 持ち主を 渡すのは、ページの 控え（localStorage）が ログアウトでは 消えないから。
 * 教室の PC で 前の 人の 控えを 次の 人の 名前で 送らない ように、ページが 比べて 捨てる。
 */
export const STATE_MESSAGE = "nexmax:link-state";

/**
 * 1回の 記録の id の 形（uuid）。DB の `attempt_id` 列は uuid なので、
 * 形の 崩れた ものを 通すと Postgres が 22P02 で 弾き、その 1回が 丸ごと 消える。
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 持ち主の id の 長さの 上限（外から 来る ものなので 際限なく 受けない）。 */
const MAX_OWNER = 100;

export type LinkMessage =
  | { readonly kind: "done" }
  | { readonly kind: "owns-done" }
  | {
      readonly kind: "answers";
      readonly answers: unknown;
      /** ページが 付けた 1回の id（uuid）。送り直しても 同じ。 */
      readonly key?: string;
      /** ページの 控えの 持ち主。ログイン中の 人と ちがえば 残さない。 */
      readonly owner?: string;
    }
  | { readonly kind: "hello" };

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
    const { answers, key, owner } = data as { answers?: unknown; key?: unknown; owner?: unknown };
    // 形の 合わない 札・持ち主は 付けない（残すか どうかは 受け手が 決める）
    return {
      kind: "answers",
      answers,
      ...(typeof key === "string" && UUID.test(key) ? { key } : {}),
      ...(typeof owner === "string" && owner !== "" && owner.length <= MAX_OWNER ? { owner } : {}),
    };
  }
  if (type === HELLO_MESSAGE) return { kind: "hello" };
  return null;
}
