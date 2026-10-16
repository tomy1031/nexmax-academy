/**
 * ログインした 人だけに 配る 静的ファイル — 2026-10-16
 *
 * ## なぜ 要るか
 * `public/` の ファイルは ふつう Worker を 通らずに 配られるので、URL を 知って いれば
 * **ログインなしで 開ける**（2026-10-16 に 本番の `/tools/hourensou/renraku_slack` が
 * ログインなしで 200 を 返すのを 確認）。ログインの チェック（`src/middleware.ts`）が
 * 見るのは、Worker に 届いた リクエスト（アプリの 画面）だけ。
 *
 * そこで ここに 書いた フォルダだけ Worker を 先に 通し（`wrangler.jsonc` の
 * `assets.run_worker_first`・入口は `worker.mjs`）、次の ように 分ける。
 *
 * - **ログインの クッキーが ある** → そのまま 配る（`env.ASSETS`）。middleware と 同じ
 *   `hasAuthCookie` で 見るので、外へ 1回も 出ない。ゲームは 1回 開くと 50個近い
 *   ファイルを 取るので、1つずつ middleware（署名の 確かめ・セッションの 更新）を 通すと
 *   重く、更新が 同時に 走って ログインが 切れる おそれも ある。
 * - **クッキーが 無い** → ログインが 要る 環境なら 最初の 画面（`/?next=<元の 道>`）へ
 *   307 で 返す（middleware と 同じ 返し方）。Supabase の 設定が 無い デモモードでは
 *   止めずに 配る。
 *
 * ## ログインが 要る 環境かは、アプリに 1回 たずねる
 * デモモードかどうかを 入口は 知れない。その 設定（`NEXT_PUBLIC_SUPABASE_*`）は
 * Next の ビルドで middleware の 中に 埋まり、入口を 束ねる wrangler には 届かない
 * （実行時の `process.env` に 入る とは 限らない）。そこで クッキーが 無い ときだけ、
 * クッキーの 無い HEAD を アプリ（OpenNext）へ 送って、middleware の 答えを 見る。
 *
 * - 送る 道は `<フォルダ>/__login-check__`。末尾が `/` でも 絵の 拡張子でも ないので、
 *   middleware より 先の 転送（末尾の `/` を 外す 308・next.config の redirects）に
 *   かからず、middleware の matcher にも 必ず 入る。本番では middleware が 最初の
 *   画面へ 307 を 返す。
 * - デモモードでは middleware が 通すので、ふつうの 答え（無い ファイルの 404）に なる。
 * - **はっきり 通されたと 分かる 答え（2xx・404）の ときだけ 止めない。** 転送・
 *   エラー・例外は ログインが 要る ものと みなす（分からない ときは 閉じる 側に 倒す）。
 * - デモモードで 配るのも 入口で 行う。OpenNext に 配らせると、フォルダの URL で
 *   OpenNext（末尾の `/` を 外す）と 配信（`/` を 付ける）が 転送を くり返して 開けない。
 *
 * ## 気を つける こと
 * - **クッキーは 名前しか 見ない**（middleware の 最初の ふるいと 同じ）。名前を 合わせた
 *   クッキーを 手で 作れば 通る。ゲームの ファイルは 公開して いる リポジトリにも 載って
 *   いるので、ここで 守るのは「URL を 知って いるだけでは 開けない」ところまで。
 *   学生の データは この 道に 無い（データは RLS が 守る）。
 * - `/_next/image?url=…` は この 道を 通らずに 絵を 返す。この フォルダに 絵を
 *   置かない（`tests/login_only_assets.test.ts` が 止める）。
 * - Cache-Control は 配信の 値を そのまま 返す。`public/_headers` は Worker を 通した
 *   応答には 効かないが、この 道の 規則は もともと 無いので、Worker を 通さなかった
 *   ころと 同じ 値（`public, max-age=0, must-revalidate`）に なる。規則を 足すなら
 *   ここで 付ける（`src/lib/media-range.ts` の MEDIA_CACHE_CONTROL と 同じ 考え方）。
 * - フォルダを 足すときは `wrangler.jsonc` の `run_worker_first` にも `/道` と `/道/*` を
 *   足す。書き忘れると Worker を 通らず、これまでどおり だれでも 開ける（テストが 止める）。
 */

// `@/` は 使わない——worker.mjs を 束ねる wrangler は tsconfig の paths を 知らない
import { hasAuthCookie } from "./auth-cookie";
import type { AssetsBinding } from "./media-range";

/** ログインした 人だけに 配る フォルダ。ほかの `/tools/*` は ログインなしで 開ける。 */
export const LOGIN_ONLY_DIRS = ["/tools/kuuki-yomi"] as const;

/** ログインが 要る 環境かを たずねる ときの 道の 名前（フォルダの 下。ファイルは 置かない）。 */
export const LOGIN_CHECK_NAME = "__login-check__";

/** アプリ本体（OpenNext）に リクエストを 渡す 関数。テストでは middleware を 直に 呼ぶ。 */
export type AskApp = (request: Request) => Promise<Response>;

/** その 道が 入る フォルダ（フォルダ そのものか、その 中）。ちがえば `null`。 */
function loginOnlyDir(pathname: string): string | null {
  return LOGIN_ONLY_DIRS.find((dir) => pathname === dir || pathname.startsWith(`${dir}/`)) ?? null;
}

/** ログインした 人だけに 配る 道か。 */
export function isLoginOnly(pathname: string): boolean {
  return loginOnlyDir(pathname) !== null;
}

/** `Cookie` の 見出しから 名前だけを 取り出す（値は 読まない）。 */
export function cookieNames(header: string | null): { name: string }[] {
  return (header ?? "")
    .split(";")
    .map((entry) => ({ name: entry.split("=")[0]?.trim() ?? "" }))
    .filter((cookie) => cookie.name);
}

/** たずねる リクエスト（クッキーなしの HEAD）。 */
export function loginCheckRequest(request: Request, dir: string): Request {
  return new Request(new URL(`${dir}/${LOGIN_CHECK_NAME}`, request.url), { method: "HEAD" });
}

/** ログインが 要る 環境か（はっきり 通された ときだけ false）。 */
async function loginRequired(request: Request, dir: string, askApp: AskApp): Promise<boolean> {
  try {
    const answer = await askApp(loginCheckRequest(request, dir));
    await answer.body?.cancel();
    const passed = (answer.status >= 200 && answer.status < 300) || answer.status === 404;
    return !passed;
  } catch {
    return true;
  }
}

/** 最初の 画面へ 返す（middleware の 返し方と 同じ `/?next=<元の 道>`）。 */
function redirectToTitle(request: Request): Response {
  const title = new URL(request.url);
  const { pathname } = title;
  title.pathname = "/";
  title.search = "";
  title.searchParams.set("next", pathname);
  return new Response(null, { status: 307, headers: { Location: title.toString() } });
}

/** 配信に 渡す。無い（404）ときは `null`（呼ぶ 側が アプリ本体へ 回す）。 */
async function serveAsset(request: Request, assets: AssetsBinding): Promise<Response | null> {
  const response = await assets.fetch(request);
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  return response;
}

/**
 * ログインした 人だけに 配る 道の 応答を 作る。
 * - クッキーが ある → 配信の 応答を そのまま 返す
 * - クッキーが 無い → ログインが 要る 環境なら 最初の 画面へ 307、デモモードなら 配る
 * - ファイルが 無い（404）・この 道で ない → `null`（呼ぶ 側が アプリ本体へ 回す）
 */
export async function serveLoginOnly(
  request: Request,
  assets: AssetsBinding,
  askApp: AskApp,
): Promise<Response | null> {
  const dir = loginOnlyDir(new URL(request.url).pathname);
  if (!dir) return null;
  if (hasAuthCookie(cookieNames(request.headers.get("Cookie")))) {
    return serveAsset(request, assets);
  }
  if (await loginRequired(request, dir, askApp)) return redirectToTitle(request);
  return serveAsset(request, assets);
}
