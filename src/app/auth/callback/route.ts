import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 本番（Vercel）ではロードバランサ越しに request.url のホストが内部URLに
 * なりうるため、x-forwarded-host があればそちらを行き先に使う。
 */
function redirectTarget(request: Request, path: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}${path}`;
  }
  return `${new URL(request.url).origin}${path}`;
}

/** Google OAuth のコールバック。code をセッションに交換して戻す。 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/welcome";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(redirectTarget(request, next));
    }
  }

  return NextResponse.redirect(redirectTarget(request, "/login?error=auth&next=/welcome"));
}
