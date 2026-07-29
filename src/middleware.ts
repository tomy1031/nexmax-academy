import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/env";

/**
 * リクエストごとに Supabase セッションを更新する。
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

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
