import { HomeShell } from "@/components/home-shell";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** フェーズ2までの暫定マップ。既存のホームシェルをそのまま表示する。 */
export default async function MapPage() {
  let userName: string | null = null;

  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      const metaName = user.user_metadata?.name;
      userName =
        (typeof metaName === "string" && metaName.length > 0 ? metaName : null) ??
        user.email?.split("@")[0] ??
        "なかま";
    }
  }

  return <HomeShell userName={userName} authReady={isSupabaseConfigured} />;
}
