import { NextResponse } from "next/server";
import { REGISTER_COOKIE } from "@/lib/auth-cookie";
import { PERSONALITY_VERSION } from "@/lib/profile-db";
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

/**
 * ログインした人を `profiles` に登録する（2026-08-25 の指定）。
 *
 * これまで行ができるのは20問を保存できたときだけで、ログインしただけの人は
 * `auth.users` にしか居なかった（＝先生の名簿に出ない。8/21 に17人中4人が消えた原因）。
 * DBのトリガー（supabase/migrations/20260824090000）と同じことを、アプリ側からもやる——
 * トリガーは **SQL を手で流して初めて効き**、しかも いちばん最初のログインでしか動かない。
 *
 * なまえの3欄は空のままにする。Google の名前はローマ字で、カタカナしか通さない
 * `profiles_names_katakana` に弾かれるため。なまえやネクマックスなど**端末に残っている
 * ぶん**は、この後ブラウザ側が送る（`src/lib/register-on-login.ts`）。
 *
 * 失敗してもログインは通す。登録できないより、ログインできないほうが害が大きい。
 */
async function registerProfile(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  user: { id: string; email?: string } | null,
): Promise<void> {
  if (!user) return;
  try {
    await supabase.from("profiles").upsert(
      { id: user.id, email: user.email ?? "", personality_version: PERSONALITY_VERSION },
      // 行があるなら何もしない。**ここで既存の行を触らない**のが肝心で、
      // 触ると診断ずみの人の列を空で塗りつぶしかねない。
      { onConflict: "id", ignoreDuplicates: true },
    );
  } catch {
    /* 登録の失敗でログインを止めない */
  }
}

/** Google OAuth のコールバック。code をセッションに交換して戻す。 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        await registerProfile(supabase, data.user);
        const response = NextResponse.redirect(redirectTarget(request, next));
        // ブラウザ側へ「いまログインしてきた」と伝える。端末にしか無い情報
        // （ネクマックスの20問・なまえ・がっこう）は、これを合図に送られる。
        response.cookies.set(REGISTER_COOKIE, "1", {
          path: "/",
          maxAge: 300,
          sameSite: "lax",
          httpOnly: false,
        });
        return response;
      }
    }
  }

  // 失敗したら最初の画面（タイトル＝ログイン）へ。そこで もう一度 ためせる。
  return NextResponse.redirect(redirectTarget(request, "/?error=auth"));
}
