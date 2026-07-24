import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/env";

/**
 * サーバ用 Supabase クライアント（Cookie 連携）。
 * 未設定なら null を返す。
 */
export async function createClient() {
  const cfg = getSupabasePublicConfig();
  if (!cfg) return null;

  const cookieStore = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component から呼ばれた場合は書き込めない。ミドルウェアがセッションを更新するため無視してよい。
        }
      },
    },
  });
}
