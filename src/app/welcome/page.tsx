import { redirect } from "next/navigation";
import { WelcomeWizard } from "@/components/welcome-wizard";
import { isSupabaseConfigured } from "@/lib/env";
import { isDiagnosisComplete, type Gender } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * 診断をやり直すときに付けるクエリ。タイトル画面の
 * 「せいかくしんだんを もういちど」から渡る。
 * これが付いていない限り、診断済みの人はマップへ送り返す（毎回20問に戻らせない）。
 */
const RETAKE_PARAM = "retake";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const retake = (await searchParams)[RETAKE_PARAM] === "1";
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  let saved: { displayName: string; gender: Gender } | null = null;

  if (supabase && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, gender, answers")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      // 診断が終わっている人だけマップへ返す。行の存在だけで判定すると、
      // 名前と性別だけ入って診断が未完了の行が /map と /welcome を往復して詰む。
      if (isDiagnosisComplete(profile.answers) && !retake) redirect("/map");

      // やり直しでも名前と性別は入れ直させない。
      saved = { displayName: profile.display_name, gender: profile.gender };
    }
  }

  return (
    <WelcomeWizard
      authReady={isSupabaseConfigured}
      loggedIn={Boolean(user)}
      email={user?.email ?? null}
      saved={saved}
      retake={retake}
    />
  );
}
