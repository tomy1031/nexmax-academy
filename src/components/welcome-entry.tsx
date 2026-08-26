"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WelcomeWizard } from "@/components/welcome-wizard";
import { hasLearnerNames, katakanaOrEmpty, type LearnerNames } from "@/lib/name";
import { isDiagnosisComplete, type Gender } from "@/lib/profile";
import { fetchOwnProfile } from "@/lib/profile-db";
import { isSchoolChosen, type LearnerSchool, type University } from "@/lib/school";
import { createClient } from "@/lib/supabase/client";
import { readOwnClaims } from "@/lib/supabase/claims";

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

/** 20問の 画面に 渡す ぶん。決まるまでは null。 */
interface Entry {
  readonly loggedIn: boolean;
  readonly email: string | null;
  readonly saved: { names: LearnerNames; school: LearnerSchool; gender: Gender | null } | null;
  readonly retake: boolean;
  readonly namesOnly: boolean;
  readonly googleNames: { familyName: string; givenName: string; fullName: string };
}

const NO_GOOGLE_NAMES = { familyName: "", givenName: "", fullName: "" };

/**
 * はじめの案内（20問）の 入口。**サーバでは 何も 決めない**（2026-08-26）。
 *
 * ## なぜ ブラウザへ 移したか
 *
 * この 画面は 直前まで `dynamic` だった——ヘッダとクッキーと DB を 読んで
 * いたため。`dynamic` な ページは **リクエストのたび Worker が Next の
 * サーバ本体を 読み込んで 描く**ので、冷えた Worker では それだけで
 * 無料枠の CPU（1リクエスト 10ms）を 超える（docs/deploy.md §0.10）。
 *
 * そして ここは **新しい 学習者が かならず 通る 画面**で、授業の 初日には
 * 20人が ほぼ 同時に 叩く。タイトル画面（#219）に つづいて、学習者の 道から
 * 最後の `dynamic` を 外す。
 *
 * ## 決めかたは 前と 同じ
 *
 * 見る ものも、送り返す 条件も サーバに いた ころと 変えて いない:
 *
 *  - ログインして いなければ タイトル画面（＝ログイン）へ
 *  - 診断が 終わって いて なまえも 学校も そろって いれば マップへ
 *    （`retake=1` が 付いて いる ときだけ 20問へ 通す）
 *  - なまえだけ 足りない 行は、20問を やり直させず 欄だけ 出す
 *
 * ## 20問の 画面（`WelcomeWizard`）には 触って いない
 *
 * 受け取る ものが 同じ なので、1408行の 本体は そのまま。ここは
 * **サーバが して いた 下ごしらえを 引き受ける だけ**の 薄い 皮である。
 */
export function WelcomeEntry() {
  const router = useRouter();
  const [entry, setEntry] = useState<Entry | null>(null);
  /** 送り返す ことに 決まったか。決まったら 20問を 出さずに 待つ。 */
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const retake = new URLSearchParams(window.location.search).get(RETAKE_PARAM) === "1";
      const supabase = createClient();

      // 鍵ゼロのデモモード（Supabase 未設定）では関所そのものが無いので、ここは通す。
      // そうしないと「ログインずみ」にならず、機械が診断を通しで歩けない（AGENTS.md 検証の節）。
      if (!supabase) {
        if (alive) {
          setEntry({
            loggedIn: true,
            email: null,
            saved: null,
            retake,
            namesOnly: false,
            googleNames: NO_GOOGLE_NAMES,
          });
        }
        return;
      }

      const claims = await readOwnClaims(supabase);
      // ログインしてはじめて始められる（願い #13）。未ログインはタイトル画面＝ログインへ返す。
      // ふつうは ミドルウェアが 手前で 返すので、ここは 念のための 受け皿。
      if (!claims) {
        if (alive) {
          setLeaving(true);
          router.replace("/");
        }
        return;
      }

      const profile = await fetchOwnProfile();

      let saved: Entry["saved"] = null;
      // 診断は終わっているのに、なまえや学校がそろっていない行（列を足す前に作られたもの）。
      // 20問をやり直させず、足りない項目だけ入れてもらう。
      let namesOnly = false;

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
        if (diagnosed && detailsReady && !retake) {
          if (alive) {
            setLeaving(true);
            router.replace("/map");
          }
          return;
        }

        namesOnly = diagnosed && !detailsReady && !retake;
        // やり直しでも なまえ・学校・性別は入れ直させない。
        saved = { names, school, gender: profile.gender };
      }

      // Google に登録された名前。カタカナのときだけ欄に入れ、そうでなければ見本として見せる
      // （カンボジアの学習者の Google アカウントはほぼローマ字。2026-08-11 の指定）。
      const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
      const googleFullName =
        metadataString(metadata, "full_name") || metadataString(metadata, "name");

      if (!alive) return;
      setEntry({
        loggedIn: true,
        email: typeof claims.email === "string" ? claims.email : null,
        saved,
        retake,
        namesOnly,
        googleNames: {
          familyName: katakanaOrEmpty(metadataString(metadata, "family_name")),
          givenName: katakanaOrEmpty(metadataString(metadata, "given_name")),
          fullName: googleFullName,
        },
      });
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  if (leaving || !entry) {
    return (
      <main className="from-bg-sky to-bg-warm grid min-h-dvh place-items-center bg-linear-to-b p-6">
        <p className="text-navy inline-block rounded-full bg-white px-6 py-3 font-extrabold shadow-lg">
          じゅんび しています。
        </p>
      </main>
    );
  }

  return (
    <WelcomeWizard
      loggedIn={entry.loggedIn}
      email={entry.email}
      saved={entry.saved}
      retake={entry.retake}
      namesOnly={entry.namesOnly}
      googleNames={entry.googleNames}
    />
  );
}
