/**
 * タイトル画面が URL から受け取るもの（2026-08-26）。
 *
 * タイトル画面は **全員が いちばん 最初に 開く 画面**で、授業では 20人が
 * 一斉に 叩く。ここが リクエストごとの サーバ描画（dynamic）だと、冷えた
 * Worker は そのたび Next のサーバ本体を 読み込む——無料枠の CPU 上限
 *（1リクエスト 10ms）を 超えて Error 1102 に なる（docs/deploy.md §0.10）。
 *
 * そこで タイトル画面を **作りおきで 返せる 静的ページ**に した。引きかえに
 * 「どこへ 戻すか（`next`）」「ログインに 失敗したか（`error=auth`）」は
 * サーバでは 読めなく なるので、ブラウザで 読む。**その 読み取りだけ**を
 * ここに 置いて、部品の 中に 埋めない（検査できる ように するため）。
 */

/** ログインの あとに 開く 既定の 行き先。 */
export const DEFAULT_NEXT = "/welcome";

/**
 * 行き先として 受け取ってよい 文字列だけを 通す。
 *
 * ミドルウェアが 弾いた 行き先が `?next=` で 戻って くるが、URL は 誰でも
 * 書き替えられる。**自分のサイトの 道だけ**を 受ける（`//evil.example` の
 * ような プロトコル相対の URL は 外へ 出てしまうので 弾く）。
 * サーバで 行っていた 判定と 同じ 規則。
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : DEFAULT_NEXT;
}

/** タイトル画面が URL から 決めること。 */
export interface TitleParams {
  /** ログインの あとに 開く 場所。 */
  readonly next: string;
  /** ログインの 戻りが 失敗したか（`/?error=auth`）。 */
  readonly hadAuthError: boolean;
}

/** `window.location.search` を 読み解く（`?` 付きでも 無しでも よい）。 */
export function readTitleParams(search: string): TitleParams {
  const params = new URLSearchParams(search);
  return {
    next: safeNext(params.get("next")),
    hadAuthError: params.get("error") === "auth",
  };
}
