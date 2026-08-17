import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * スタジオAPIの関門（管理者だけ通す）
 *
 * ## なぜ route.ts の外に置くか（2026-08-17）
 * Next.js は route ファイルの export を検査し、`GET`/`POST` など決まった名前しか
 * 許さない。以前は `/api/studio/content/route.ts` が `requireAdmin` も export して
 * いて、Gemini の proxy route たちがそこから import していた。proxy を消したら
 * **使う人の居ない export だけが残り、ビルドが止まった**。関門は route ではなく
 * ライブラリに置く。
 */

type ServerClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type Gate =
  { ok: true; supabase: ServerClient; userId: string } | { ok: false; response: NextResponse };

export function fail(
  reason: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ ready: false, reason, ...extra }, { status });
}

/** 認可はRLSに任せきりにせず、サーバ側でも profiles.is_admin を確かめる（二重の関所）。 */
export async function requireAdmin(): Promise<Gate> {
  const supabase = await createClient();
  // Supabase 未設定のローカル開発。スタジオは「じゅんびちゅう」に落ちる
  if (!supabase) return { ok: false, response: fail("notConfigured", 503) };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, response: fail("unauthorized", 401) };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) {
    return { ok: false, response: fail("forbidden", 403) };
  }

  return { ok: true, supabase, userId: user.id };
}
