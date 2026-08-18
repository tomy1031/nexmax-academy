import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LearnerSettings } from "@/components/learner-settings";
import { AUTH_STATE_HEADER } from "@/lib/auth-cookie";
import type { LearnerNames } from "@/lib/name";
import { isDiagnosisComplete, type Gender } from "@/lib/profile";
import type { LearnerSchool, University } from "@/lib/school";
import { createClient } from "@/lib/supabase/server";

/**
 * せっていの画面（マップの サイドメニュー →「せってい」）
 *
 * URLは **マップの下**に置く（`/settings` にしない）。URLの1段目は ステージIDの
 * 場所で、新しく 1段目を 足すと `RESERVED_STAGE_IDS` にも 足さないと その名前の
 * ステージへ 永久に たどり着けなくなる（AGENTS.md「URLの決まり」）。
 * `map` は すでに 予約ずみなので、その下なら 何も 壊さない。
 *
 * 中身は はじめの せってい（`/welcome`）と同じ カードだが、**20問の 診断は しない**。
 */

export const metadata: Metadata = { title: "せってい" };

export default async function MapSettingsPage() {
  const supabase = await createClient();

  // ログインしてはじめて開ける（願い #13）。ミドルウェアが確認ずみの結果を先に見て、
  // 未ログインなら Supabase へ問い合わせない（願い #17）。
  const authState = (await headers()).get(AUTH_STATE_HEADER);
  if (supabase && authState === "0") redirect("/");

  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (supabase && !user) redirect("/");

  let saved: { names: LearnerNames; school: LearnerSchool; gender: Gender | null } | null = null;
  let diagnosed = false;

  if (supabase && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("family_name, given_name, nickname, university, cohort, gender, answers")
      .eq("id", user.id)
      .maybeSingle();

    // まだ 一度も 設定していない人は、はじめの せってい（チュートリアル）へ送る。
    // ここは「直す」ための画面なので、作る道は 1本に しておく。
    if (!profile) redirect("/welcome");

    saved = {
      names: {
        familyName: profile.family_name ?? "",
        givenName: profile.given_name ?? "",
        nickname: profile.nickname ?? "",
      },
      school: {
        university: (profile.university ?? "") as University | "",
        cohort: profile.cohort ?? 0,
      },
      gender: profile.gender ?? null,
    };
    diagnosed = isDiagnosisComplete(profile.answers);
  }

  return (
    <LearnerSettings
      loggedIn={Boolean(user)}
      email={user?.email ?? null}
      saved={saved}
      diagnosed={diagnosed}
    />
  );
}
