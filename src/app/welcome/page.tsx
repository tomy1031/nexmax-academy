import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WelcomeWizard } from "@/components/welcome-wizard";
import { AUTH_STATE_HEADER } from "@/lib/auth-cookie";
import { hasLearnerNames, katakanaOrEmpty, type LearnerNames } from "@/lib/name";
import { isDiagnosisComplete, type Gender } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * 診断をやり直すときに付けるクエリ。タイトル画面の
 * 「せいかくしんだんを もういちど」から渡る。
 * これが付いていない限り、診断済みの人はマップへ送り返す（毎回20問に戻らせない）。
 */
const RETAKE_PARAM = "retake";

/** `user_metadata` は型が付いていない。文字列のときだけ受け取る。 */
function metadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const retake = (await searchParams)[RETAKE_PARAM] === "1";
  const supabase = await createClient();

  // ログインしてはじめて始められる（願い #13）。未ログインはタイトル画面＝ログインへ返す。
  // ミドルウェアが確認ずみの結果を先に見て、未ログインなら Supabase へ問い合わせない（願い #17）。
  const authState = (await headers()).get(AUTH_STATE_HEADER);
  if (supabase && authState === "0") redirect("/");

  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (supabase && !user) redirect("/");

  let saved: { names: LearnerNames; gender: Gender } | null = null;
  // 診断は終わっているのに、なまえが「苗字・名前」に分かれていない行。
  // 20問をやり直させず、なまえだけ入れ直してもらう。
  let namesOnly = false;

  if (supabase && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("family_name, given_name, nickname, gender, answers")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      const names: LearnerNames = {
        familyName: profile.family_name ?? "",
        givenName: profile.given_name ?? "",
        nickname: profile.nickname ?? "",
      };
      const diagnosed = isDiagnosisComplete(profile.answers);

      // 診断が終わっていて、なまえもそろっている人だけマップへ返す。行の存在だけで判定すると、
      // 名前と性別だけ入って診断が未完了の行が /map と /welcome を往復して詰む。
      if (diagnosed && hasLearnerNames(names) && !retake) redirect("/map");

      namesOnly = diagnosed && !hasLearnerNames(names) && !retake;
      // やり直しでも なまえと性別は入れ直させない。
      saved = { names, gender: profile.gender };
    }
  }

  // Google に登録された名前。カタカナのときだけ欄に入れ、そうでなければ見本として見せる
  // （カンボジアの学習者の Google アカウントはほぼローマ字。2026-08-11 の指定）。
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const googleFullName = metadataString(metadata, "full_name") || metadataString(metadata, "name");

  return (
    <WelcomeWizard
      loggedIn={Boolean(user)}
      email={user?.email ?? null}
      saved={saved}
      retake={retake}
      namesOnly={namesOnly}
      googleNames={{
        familyName: katakanaOrEmpty(metadataString(metadata, "family_name")),
        givenName: katakanaOrEmpty(metadataString(metadata, "given_name")),
        fullName: googleFullName,
      }}
    />
  );
}
