/**
 * ログインしているかを「クッキーがあるか」だけで見分ける（願い #17）。
 *
 * なぜ要るか: `auth.getUser()` は毎回 Supabase まで往復する。ログイン必須にしたことで
 * **全リクエストがこの往復を通る**ようになり、30人が同時に開くと Worker が資源上限に達した
 * （実測: ログイン状態のタイトル画面に60並列 → 60件すべて 503 / Cloudflare Error 1102）。
 *
 * クッキーが**無い**なら未ログインは確実なので、往復ゼロで判定してよい。
 * クッキーが**ある**ときだけ本物の確認をする。期限切れのクッキーで一瞬通っても、
 * データはRLSが守るので実害はない（画面が出たあと本確認で弾かれるだけ）。
 */

/** Supabase SSR が置くセッションクッキーの名前（`sb-<ref>-auth-token`・分割時は `.0` などが付く）。 */
const SUPABASE_AUTH_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;

export function hasAuthCookie(cookies: readonly { name: string }[]): boolean {
  return cookies.some((cookie) => SUPABASE_AUTH_COOKIE.test(cookie.name));
}

/** ブラウザ側の同じ判定。ログインしていない人に余計な仕事をさせないために使う。 */
export function hasAuthCookieInBrowser(): boolean {
  if (typeof document === "undefined") return false;
  const names = document.cookie
    .split(";")
    .map((entry) => ({ name: entry.trim().split("=")[0] ?? "" }))
    .filter((cookie) => cookie.name);
  return hasAuthCookie(names);
}

/**
 * ミドルウェアが解決した認証結果を、ページへ渡すためのヘッダ。
 *
 * これが無いと、1画面につき `getUser()` を2回（ミドルウェアとページで）呼ぶことになる。
 * ミドルウェアは全リクエストで必ずこの値を**上書き**するので、外から詐称しても効かない。
 */
export const AUTH_STATE_HEADER = "x-nexmax-auth";

/**
 * 「つづきから」を出してよい（診断ずみ＋なまえあり）と分かっている印。
 *
 * これがあるとタイトル画面はDB照会を省ける。無いときだけ1回だけ照会する。
 * 端末ごとの印なので、別の端末では初回に1回照会が走る（それで正しく決まる）。
 */
export const READY_COOKIE = "nexmax.ready";

/** ブラウザ側で印を付ける／消す。マップが読めた時点で付け、診断リセットで消す。 */
export function markReady(ready: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = ready
    ? `${READY_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    : `${READY_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * 「いまログインしてきた」印（2026-08-25）。
 *
 * ログインの戻り道（`/auth/callback`）が立て、ブラウザ側の登録
 * （`src/lib/register-on-login.ts`）が1回だけ走ったら消す。
 * サーバは端末の localStorage を見られないので、**ネクマックスの20問のような
 * 端末にしか無い情報を登録できるのはブラウザ側だけ**である。その合図に使う。
 *
 * httpOnly にしない（JavaScript から読めないと合図にならない）。
 * 中身は「1」だけで、これ自体は何の権限も表さない。
 */
export const REGISTER_COOKIE = "nexmax.register";

/**
 * 印があれば**消して** true を返す。
 * 先に消すので、登録の途中で読み込み直されても二重には走らない。
 */
export function takeRegisterFlag(): boolean {
  if (typeof document === "undefined") return false;
  const found = document.cookie
    .split(";")
    .some((entry) => entry.trim().startsWith(`${REGISTER_COOKIE}=1`));
  if (found) document.cookie = `${REGISTER_COOKIE}=; path=/; max-age=0; samesite=lax`;
  return found;
}
