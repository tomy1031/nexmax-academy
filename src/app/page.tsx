import { TitleScreen } from "@/components/title-screen";
import { isSupabaseConfigured } from "@/lib/env";
import { hasLearnerNames } from "@/lib/name";
import { isDiagnosisComplete } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * 最初の画面。**ログインしてはじめて中に入れる**（願い #13）。
 *
 * ログインの画面を別に持たず、タイトル画面のボタンをログインにする。
 * セッションを見るのでキャッシュせず、毎回いまの状態で描く。
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  /**
   * 「つづきから」を出してよいか。**DBを見て決める**。
   *
   * 以前はブラウザの localStorage だけで決めていたが、それはこの端末の記憶でしかない。
   * 別の端末・別のブラウザで開くと、進んでいる人にも「ゲームを始める」が出て、
   * 押すと診断へ送られる。診断が終わっていて なまえもそろっている人だけ、マップへ通す。
   */
  let canContinue = false;
  if (supabase && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("answers, family_name, given_name")
      .eq("id", user.id)
      .maybeSingle();
    canContinue = Boolean(
      profile &&
      isDiagnosisComplete(profile.answers) &&
      hasLearnerNames({
        familyName: profile.family_name ?? "",
        givenName: profile.given_name ?? "",
      }),
    );
  }

  // ミドルウェアが弾いた行き先。外のURLへ飛ばされないよう、自分のサイトの道だけ受ける。
  const requested = typeof params.next === "string" ? params.next : "";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/welcome";

  return (
    <TitleScreen
      authReady={isSupabaseConfigured}
      loggedIn={Boolean(user)}
      canContinue={canContinue}
      hadAuthError={params.error === "auth"}
      next={next}
    />
  );
}
