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
 * - 進み具合（`progress`）は **数だけの しおり**しか 受けない（`parseProgressPosition`）
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
 * 中のページが **進み具合**（数だけの しおり）を 渡して くる 合図（2026-11-17・相談の 練習問題）。
 *
 * 親は それを 学習の 記録（`recordContentProgress`）に 写す ——あとは ほかの 教材と 同じ
 * 道（`src/lib/records/sync.ts`）で Supabase の `content_progress` に 入る。
 * tomy さんの 指定「埋め込みとして作る。ただし状況はSupabase保存できるように」。
 */
export const PROGRESS_MESSAGE = "nexmax:link-progress";

/** 中のページが「記録から 戻して」と 頼む 合図。親は 本人の 行を 読んで 返す。 */
export const PROGRESS_REQUEST_MESSAGE = "nexmax:link-progress-request";

/** 親が 中のページへ 返す 合図（`owner`・`status`・`position`）。 */
export const PROGRESS_RESTORE_MESSAGE = "nexmax:link-progress-restore";

/**
 * しおりの 鍵の 形と 数の 上限。
 *
 * しおりは そのまま DB の 1行（`content_progress.position`）に 入り、先生の 画面が 読む。
 * 外から 来る ものなので、**短い 英小文字の 鍵と ふつうの 数だけ**を 受ける。
 */
const POSITION_KEY = /^[a-z][a-z0-9_]{0,15}$/;
const POSITION_MAX_KEYS = 40;
const POSITION_MAX_VALUE = 1_000_000;

/** 届いた しおりを 確かめる。形が ちがえば `null`（**ひとつでも 崩れて いたら まるごと 捨てる**）。 */
export function parseProgressPosition(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > POSITION_MAX_KEYS) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of entries) {
    if (!POSITION_KEY.test(key)) return null;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    if (Math.abs(raw) > POSITION_MAX_VALUE) return null;
    out[key] = raw;
  }
  return out;
}

export type LinkMessage =
  | { readonly kind: "done" }
  | { readonly kind: "owns-done" }
  | {
      readonly kind: "progress";
      readonly status: "started" | "completed";
      readonly position: Record<string, number>;
    }
  | { readonly kind: "progress-request" }
  | {
      readonly kind: "answers";
      readonly answers: unknown;
      /** 1回の 挑戦の 鍵（ツールが 決める。無ければ 保存の ときに 作る）。形は 保存側で 確かめる */
      readonly attemptId?: unknown;
      /** まるごとの 挑戦か（`false` = まちがえた 問いだけの やり直し）。形は 保存側で 確かめる */
      readonly fullSet?: unknown;
    };

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
  if (type === PROGRESS_REQUEST_MESSAGE) return { kind: "progress-request" };
  if (type === PROGRESS_MESSAGE) {
    const { status, position } = data as { status?: unknown; position?: unknown };
    const parsed = parseProgressPosition(position);
    if (!parsed) return null;
    return {
      kind: "progress",
      status: status === "completed" ? "completed" : "started",
      position: parsed,
    };
  }
  if (type === ANSWERS_MESSAGE) {
    const { answers, attemptId, fullSet } = data as {
      answers?: unknown;
      attemptId?: unknown;
      fullSet?: unknown;
    };
    return { kind: "answers", answers, attemptId, fullSet };
  }
  return null;
}
