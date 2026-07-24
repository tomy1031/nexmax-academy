import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/env";

/**
 * ブラウザ用 Supabase クライアント。
 * 未設定なら null を返す（ログインUIは「準備中」表示に切り替える）。
 */
export function createClient() {
  const cfg = getSupabasePublicConfig();
  if (!cfg) return null;
  return createBrowserClient(cfg.url, cfg.anonKey);
}
