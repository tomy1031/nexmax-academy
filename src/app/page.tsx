import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { HomeShell } from "@/components/home-shell";

/** TOP（サーバ側）: ログイン状態だけ取得して、描画はクライアントシェルに渡す。 */
export default async function Home() {
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
