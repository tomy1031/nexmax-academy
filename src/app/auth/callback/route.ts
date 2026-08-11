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

/**
 * 戻り先はこのサイトの中だけに限る。
 * `next` はURLから来るので、外のサイトを指されたらそのまま使わない。
 */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/welcome";
  return value;
}

/** Google OAuth のコールバック。code をセッションに交換して戻す。 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(redirectTarget(request, next));
    }
  }

  // 失敗したら最初の画面（タイトル＝ログイン）へ。そこで もう一度 ためせる。
  return NextResponse.redirect(redirectTarget(request, "/?error=auth"));
}
