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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const response =
    user || isOpenToVisitors(pathname) ? passThrough(Boolean(user)) : redirectToTitle();
  for (const { name, value, options } of refreshed) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
