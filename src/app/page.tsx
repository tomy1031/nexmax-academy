import { cookies, headers } from "next/headers";
import { TitleScreen } from "@/components/title-screen";
import { AUTH_STATE_HEADER, READY_COOKIE } from "@/lib/auth-cookie";
import { isSupabaseConfigured } from "@/lib/env";
import { hasLearnerNames } from "@/lib/name";
import { isDiagnosisComplete } from "@/lib/profile";
import { isSchoolChosen } from "@/lib/school";
import { createClient } from "@/lib/supabase/server";

/**
 * 最初の画面。**ログインしてはじめて中に入れる**（願い #13）。
 *
 * ログインの画面を別に持たず、タイトル画面のボタンをログインにする。
 *
 * ここは**全員が必ず通る画面**なので、外部への往復を極力しない（願い #17）。
 *  - ログインずみかは、ミドルウェアが確認した結果をヘッダで受け取る（getUser を二度打たない）
 *  - 「つづきから」を出すかは、印のクッキーがあればそれで決める。無いときだけ1回だけ照会する
 *    （照会結果の印はマップ側で付ける。別の端末でも初回の1回で正しく決まる）
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  const loggedIn = headerList.get(AUTH_STATE_HEADER) === "1";

  let canContinue = loggedIn && cookieStore.get(READY_COOKIE)?.value === "1";

  // 印が無いログイン者だけ、1回だけ調べる（新しい端末で開いた初回など）。
  if (loggedIn && !canContinue) {
    const supabase = await createClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (supabase && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("answers, family_name, given_name, university, cohort")
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
  }

  // ミドルウェアが弾いた行き先。外のURLへ飛ばされないよう、自分のサイトの道だけ受ける。
  const requested = typeof params.next === "string" ? params.next : "";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/welcome";

  return (
    <TitleScreen
      authReady={isSupabaseConfigured}
      loggedIn={loggedIn}
      canContinue={canContinue}
      hadAuthError={params.error === "auth"}
      next={next}
    />
  );
}
