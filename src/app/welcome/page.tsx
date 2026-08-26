import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WelcomeWizard } from "@/components/welcome-wizard";
import { AUTH_STATE_HEADER } from "@/lib/auth-cookie";
import { hasLearnerNames, katakanaOrEmpty, type LearnerNames } from "@/lib/name";
import { isDiagnosisComplete, type Gender } from "@/lib/profile";
import { isSchoolChosen, type LearnerSchool, type University } from "@/lib/school";
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

  /*
   * 署名を **その場で** 確かめる（外への 往復を 起こさない・2026-08-26）。
   *
   * `getUser()` は トークンを Supabase の 認証サーバへ 送って 確かめるので、
   * この 画面を 開く 人ぜんぶが 1往復 して いた。ここは **新しい 学習者が
   * 必ず 通る 画面**で、授業の 初日には 20人が 同時に 叩く。
   *
   * `getClaims()` は 公開鍵（JWKS）で WebCrypto 検証を その場で 行う。
   * 公開鍵は auth-js が 10分 ためるので、外へ 出るのは 10分に 1回 だけ。
   * ミドルウェアが すでに 同じ 検証を 済ませて いるので、鍵は だいたい 手元に ある
   *（願い #17・#213 と 同じ 考えかた。docs/deploy.md §0.10）。
   *
   * なまえの 下ごしらえに 使う `email` と `user_metadata` は **トークンの 中に
   * 入っている**ので、これで そろう。
   */
  const { data: verified } = supabase ? await supabase.auth.getClaims() : { data: null };
  const claims = verified?.claims ?? null;
  if (supabase && !claims) redirect("/");

  let saved: { names: LearnerNames; school: LearnerSchool; gender: Gender } | null = null;
  // 診断は終わっているのに、なまえや学校がそろっていない行（列を足す前に作られたもの）。
  // 20問をやり直させず、足りない項目だけ入れてもらう。
  let namesOnly = false;

  if (supabase && claims) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("family_name, given_name, nickname, university, cohort, gender, answers")
      .eq("id", claims.sub)
      .maybeSingle();

    if (profile) {
      const names: LearnerNames = {
        familyName: profile.family_name ?? "",
        givenName: profile.given_name ?? "",
        nickname: profile.nickname ?? "",
      };
      const school: LearnerSchool = {
        university: (profile.university ?? "") as University | "",
        cohort: profile.cohort ?? 0,
      };
      const diagnosed = isDiagnosisComplete(profile.answers);
      const detailsReady = hasLearnerNames(names) && isSchoolChosen(school);

      // 診断が終わっていて、なまえと学校もそろっている人だけマップへ返す。行の存在だけで
      // 判定すると、名前と性別だけ入って診断が未完了の行が /map と /welcome を往復して詰む。
      if (diagnosed && detailsReady && !retake) redirect("/map");

      namesOnly = diagnosed && !detailsReady && !retake;
      // やり直しでも なまえ・学校・性別は入れ直させない。
      saved = { names, school, gender: profile.gender };
    }
  }

  // Google に登録された名前。カタカナのときだけ欄に入れ、そうでなければ見本として見せる
  // （カンボジアの学習者の Google アカウントはほぼローマ字。2026-08-11 の指定）。
  const metadata = (claims?.user_metadata ?? {}) as Record<string, unknown>;
  const googleFullName = metadataString(metadata, "full_name") || metadataString(metadata, "name");

  return (
    <WelcomeWizard
      // 鍵ゼロのデモモード（Supabase 未設定）では関所そのものが無いので、ここは通す。
      // そうしないと「ログインずみ」にならず、機械が診断を通しで歩けない（AGENTS.md 検証の節）。
      loggedIn={supabase ? Boolean(claims) : true}
      email={claims?.email ?? null}
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
