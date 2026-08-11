import { TitleScreen } from "@/components/title-screen";
import { isSupabaseConfigured } from "@/lib/env";
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

  // ミドルウェアが弾いた行き先。外のURLへ飛ばされないよう、自分のサイトの道だけ受ける。
  const requested = typeof params.next === "string" ? params.next : "";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/welcome";

  return (
    <TitleScreen
      authReady={isSupabaseConfigured}
      loggedIn={Boolean(user)}
      hadAuthError={params.error === "auth"}
      next={next}
    />
  );
}
