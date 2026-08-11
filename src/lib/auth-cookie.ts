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
