import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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

  let response = NextResponse.next({ request });

  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isOpenToVisitors(pathname)) {
    const title = request.nextUrl.clone();
    title.pathname = "/";
    title.search = "";
    // ログインのあと、開こうとしていた場所へ戻す。
    title.searchParams.set("next", pathname);
    return NextResponse.redirect(title);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
