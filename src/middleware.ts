import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_STATE_HEADER, hasAuthCookie } from "@/lib/auth-cookie";
import { getSupabasePublicConfig } from "@/lib/env";

/**
 * ログインしていない人を、最初の画面（タイトル＝ログイン）へ返す。
 *
 * タイトル画面そのものと、OAuth の戻り道は通す。API は通す——
 * ここで返すと HTML が返り、呼び出し側は「JSONが壊れた」としか分からなくなる。
 * 認証は各 API 自身の仕事にする。
 */
function isOpenToVisitors(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/auth/") || pathname.startsWith("/api/");
}

/**
 * リクエストごとに Supabase セッションを更新し、未ログインを最初の画面へ返す（願い #13）。
 * 未設定なら何もしない（デモモードでもアプリは動く）。
 *
 * あわせて OAuth の `?code=` を取りこぼさない。Supabase の Redirect URLs に
 * 未登録の宛先を渡すと Site URL（＝ルート）へ `?code=` 付きで戻されるため、
 * どのページに落ちてもコールバックへ回送する。
 *
 * **外部への往復は最小にする**（願い #17）。ログイン必須にした直後、1画面につき
 * Supabase へ3往復していて、30人が同時に開くと Worker が資源上限に達した
 * （実測: 60並列で全件 503 / Cloudflare Error 1102）。
 *
 * 2026-08-26 に **残り1往復も 無くした**。クッキーが あるときの 確認を
 * `getUser()`（毎回 認証サーバへ 送る）から `getClaims()`（公開鍵で その場で
 * 署名検証）へ 変えた。定常状態では 外へ 出ない。下の 呼び出し箇所を 参照。
 */
export async function middleware(request: NextRequest) {
  const cfg = getSupabasePublicConfig();
  if (!cfg) return NextResponse.next({ request });

  const { pathname, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  if (code && pathname !== "/auth/callback") {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    callback.search = "";
    callback.searchParams.set("code", code);
    callback.searchParams.set("next", searchParams.get("next") ?? "/welcome");
    return NextResponse.redirect(callback);
  }

  /** ログインの行き先へ返す（元の行き先を持たせる）。 */
  function redirectToTitle() {
    const title = request.nextUrl.clone();
    title.pathname = "/";
    title.search = "";
    title.searchParams.set("next", pathname);
    return NextResponse.redirect(title);
  }

  /** 認証結果をページへ渡す。全リクエストで必ず上書きするので、詐称した値は残らない。 */
  function passThrough(loggedIn: boolean) {
    const headers = new Headers(request.headers);
    headers.set(AUTH_STATE_HEADER, loggedIn ? "1" : "0");
    return NextResponse.next({ request: { headers } });
  }

  // クッキーが無ければ未ログインは確実。ここで決めれば外部通信は1回も要らない。
  if (!hasAuthCookie(request.cookies.getAll())) {
    return isOpenToVisitors(pathname) ? passThrough(false) : redirectToTitle();
  }

  // API と OAuth の戻り道は、ログイン済みでも Supabase へ往復しない（願い #17）。
  // 認証は各 API 自身の仕事で、AUTH_STATE_HEADER の読み手も `/` と /welcome だけ。
  // 未検証のまま「ログイン済み」を渡さないよう、ヘッダは "0" で上書きする。
  if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) {
    return passThrough(false);
  }

  // 更新されたセッションクッキー。どの応答にも必ず載せ直す（載せ忘れると毎回ログインし直しになる）。
  let refreshed: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        refreshed = cookiesToSet;
      },
    },
  });

  /*
   * 署名を **その場で** 確かめる（外への往復を起こさない）。
   *
   * `getUser()` は トークンを Supabase の 認証サーバへ 送って 確かめるので、
   * ログイン済みの人が ページを 開くたびに 1往復 していた。授業で 20人が 一斉に
   * 使うと、この 往復が Worker の CPU 上限（無料枠 10ms）を 押し上げる
   *（2026-08-25 の 上限超過。docs/deploy.md §0.7）。
   *
   * `getClaims()` は プロジェクトが **非対称鍵（ES256）** で 署名して いるとき、
   * 公開鍵（JWKS）で WebCrypto 検証を その場で 行う。公開鍵は auth-js の
   * `GLOBAL_JWKS` に **クライアントを またいで** 10分 ためられるので、
   * 外へ 出るのは 10分に 1回 だけに なる。
   *
   * **安全さは 落ちない**——署名を 確かめて いるので、クッキーを 作り替えた
   * 偽の セッションは 通らない（`getSession()` を そのまま 信じるのとは 違う）。
   * ただし 署名が 生きて いる 間（アクセストークンの 期限・既定1時間）は、
   * 別の 端末で ログアウトしても この 判定は 通る。学習用の 画面なので
   * その 猶予は 受け入れる。**データそのものは RLS が 守る**。
   *
   * 期限が 近い ときは 中で 更新が 走り、新しい クッキーは これまでどおり
   * `setAll` に 届く（下で 応答に 載せ直す）。
   */
  const { data: verified } = await supabase.auth.getClaims();
  const loggedIn = Boolean(verified?.claims.sub);

  const response =
    loggedIn || isOpenToVisitors(pathname) ? passThrough(loggedIn) : redirectToTitle();
  for (const { name, value, options } of refreshed) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
