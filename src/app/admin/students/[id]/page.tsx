"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AdminHeader,
  AdminError,
  AdminLoading,
  AdminPageFrame,
  FAMILY_COLORS,
  FAMILY_LABELS,
  POLE_COLORS,
  StudentScoreChart,
  axisLabel,
} from "@/components/admin/admin-ui";
import { NekuMaxFamily, TypeEmblem } from "@/components/nekumax-types";
import {
  PERSONALITY_AXES,
  PERSONALITY_AXIS_META,
  PERSONALITY_QUESTIONS,
  getFamilyForCode,
  getPersonalityType,
  isPersonalityTypeCode,
} from "@/content/personality";
import {
  VERSION_MISMATCH_MESSAGE,
  calculateResultChange,
  hasCompletedPersonality,
} from "@/lib/personality-stats";
import {
  fetchAllProfiles,
  fetchOwnProfile,
  fetchResultsForProfile,
  type PersonalityResultRow,
  type ProfileRow,
} from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";

const ANSWER_MARK = { a: "Ⓐ", b: "Ⓑ" } as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export default function StudentPersonalityReportPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [results, setResults] = useState<PersonalityResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        router.replace("/welcome");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/welcome");
        return;
      }
      try {
        const ownProfile = await fetchOwnProfile();
        if (!active) return;
        // プロフィール未作成＝オンボーディング未完了。権限以前の問題なので /welcome へ。
        if (!ownProfile) {
          router.replace("/welcome");
          return;
        }
        if (!ownProfile.is_admin) {
          router.replace("/map");
          return;
        }
        const [allProfiles, profileResults] = await Promise.all([
          fetchAllProfiles(),
          fetchResultsForProfile(id),
        ]);
        if (!active) return;
        const target = allProfiles.find((item) => item.id === id);
        if (!target) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setProfile(target);
        setResults(profileResults);
        setLoading(false);
      } catch (error) {
        // 取得エラーは権限の問題ではない。理由を画面に出す（黙って戻さない）。
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router]);

  if (errorMessage) return <AdminError message={errorMessage} />;
  if (loading) return <AdminLoading />;

  if (notFound || !profile) {
    return (
      <AdminPageFrame>
        <AdminHeader />
        <section className="card-pop mx-auto max-w-3xl p-8 text-center">
          <h1 className="text-navy text-2xl font-black">学生が見つかりません</h1>
          <Link
            href="/admin/users"
            className="text-sky mt-5 inline-block font-bold underline underline-offset-4"
          >
            ← 一覧へ戻る
          </Link>
        </section>
      </AdminPageFrame>
    );
  }

  const examDate = results[0]?.created_at ?? profile.updated_at;

  // 未診断・壊れた行でも画面を落とさない。ここを通さないと getFamilyForCode 等が
  // render 中に throw して、1行の不整合でページ全体が白くなる。
  if (!hasCompletedPersonality(profile)) {
    return (
      <AdminPageFrame>
        <AdminHeader />
        <div className="mx-auto max-w-[96rem] space-y-6">
          <Link
            href="/admin/users"
            className="text-sky inline-block font-bold underline underline-offset-4"
          >
            ← 一覧へ戻る
          </Link>
          <section className="card-pop p-5 sm:p-7">
            <h1 className="text-navy text-3xl font-black">{profile.display_name}</h1>
            <p className="text-ink-soft mt-1 text-sm break-all">{profile.email}</p>
            <p className="bg-panel-tint text-ink-soft mt-5 rounded-2xl p-5 font-bold">
              この学生はまだ診断を終えていないか、記録の形式が現在の診断方式と合いません。
              結果が保存されると、ここに傾向と履歴が表示されます。
            </p>
          </section>
        </div>
      </AdminPageFrame>
    );
  }

  return (
    <AdminPageFrame>
      <AdminHeader />
      <div className="mx-auto max-w-[96rem] space-y-6">
        <Link
          href="/admin/users"
          className="text-sky inline-block font-bold underline underline-offset-4"
        >
          ← 一覧へ戻る
        </Link>

        <section className="card-pop flex flex-col items-center gap-5 p-5 sm:flex-row sm:p-7">
          <div className="relative shrink-0">
            <NekuMaxFamily
              family={getFamilyForCode(profile.personality_type).id}
              gender={profile.gender}
              size={128}
            />
            <span className="absolute right-0 bottom-0">
              <TypeEmblem code={profile.personality_type} size={44} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-navy text-3xl font-black">{profile.display_name}</h1>
              <span
                className="rounded-full px-3 py-1 text-sm font-bold text-white"
                style={{
                  backgroundColor: FAMILY_COLORS[getFamilyForCode(profile.personality_type).id],
                }}
              >
                {FAMILY_LABELS[getFamilyForCode(profile.personality_type).id]}・
                {profile.personality_type}
              </span>
            </div>
            <dl className="text-ink mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-soft font-bold">メール</dt>
                <dd className="break-all">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-ink-soft font-bold">性別</dt>
                <dd>{profile.gender === "male" ? "男性" : "女性"}</dd>
              </div>
              <div>
                <dt className="text-ink-soft font-bold">タイプ</dt>
                <dd>{getPersonalityType(profile.personality_type).name}</dd>
              </div>
              <div>
                <dt className="text-ink-soft font-bold">受験日時</dt>
                <dd>{formatDate(examDate)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <StudentScoreChart scores={profile.scores} />

        <section className="card-pop p-5 sm:p-7">
          <h2 className="text-navy text-xl font-black sm:text-2xl">20問の回答一覧</h2>
          <p className="text-ink-soft mt-1 text-sm font-medium">
            質問ごとに選んだ選択肢と、その選択肢が数える極です。
          </p>
          <div className="mt-5 space-y-3">
            {PERSONALITY_QUESTIONS.map((question, index) => {
              const answer = profile.answers[index];
              if (!answer) return null;
              const chosen = answer === "a" ? question.a : question.b;
              const isFirstPole = PERSONALITY_AXIS_META[question.axis].poles[0] === chosen.pole;
              return (
                <article
                  key={question.id}
                  className="border-hairline grid gap-3 rounded-2xl border-2 border-l-[6px] bg-white p-4 md:grid-cols-[1fr_8rem_12rem_5rem] md:items-center"
                  style={{
                    borderLeftColor: isFirstPole ? POLE_COLORS.first : POLE_COLORS.second,
                  }}
                >
                  <p className="text-ink text-sm font-medium">
                    <span className="text-navy mr-2 font-black">
                      Q{String(question.id).padStart(2, "0")}
                    </span>
                    {question.easy}
                  </p>
                  <span className="text-ink-soft w-fit text-xs font-bold">
                    {axisLabel(question.axis)}
                  </span>
                  <span className="text-ink flex items-center gap-2 text-sm font-bold">
                    <span aria-hidden>{ANSWER_MARK[answer]}</span>
                    <span className="min-w-0 truncate">{chosen.easy}</span>
                  </span>
                  <span
                    className="w-fit justify-self-end rounded-full px-3 py-1 text-xs font-black text-white"
                    style={{
                      backgroundColor: isFirstPole ? POLE_COLORS.first : POLE_COLORS.second,
                    }}
                  >
                    {chosen.pole}
                  </span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card-pop p-5 sm:p-7">
          <h2 className="text-navy text-xl font-black sm:text-2xl">受験履歴</h2>
          <p className="text-ink-soft mt-1 text-sm font-medium">
            新しい記録から順に表示します。2回目以降は前回との差分も確認できます。
          </p>
          {results.length === 0 ? (
            <p className="bg-panel-tint text-ink-soft mt-5 rounded-2xl p-5 font-bold">
              記録台帳にはまだ履歴がありません。最新プロフィールの回答は上に表示しています。
            </p>
          ) : (
            <ol className="mt-5 space-y-4">
              {results.map((result, index) => {
                const previous = results[index + 1];
                const change = previous ? calculateResultChange(result, previous) : null;
                if (!isPersonalityTypeCode(result.personality_type)) {
                  return (
                    <li
                      key={result.id}
                      className="border-hairline text-ink-soft rounded-2xl border-2 bg-white p-4 text-sm font-bold"
                    >
                      {formatDate(result.created_at)}：{VERSION_MISMATCH_MESSAGE}
                    </li>
                  );
                }
                return (
                  <li key={result.id} className="border-hairline rounded-2xl border-2 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-navy font-black">{formatDate(result.created_at)}</p>
                        <p className="text-ink-soft text-sm">
                          タイプ: {getPersonalityType(result.personality_type).name}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-bold text-white"
                        style={{
                          backgroundColor:
                            FAMILY_COLORS[getFamilyForCode(result.personality_type).id],
                        }}
                      >
                        {result.personality_type}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {PERSONALITY_AXES.map((axis) => (
                        <span
                          key={axis}
                          className="border-hairline rounded-xl border px-3 py-2 text-center"
                        >
                          <span className="text-ink-soft block text-xs font-bold">
                            {PERSONALITY_AXIS_META[axis].poles[0]} /{" "}
                            {PERSONALITY_AXIS_META[axis].poles[1]}
                          </span>
                          <span className="text-ink font-black tabular-nums">
                            {result.scores[axis]} / {5 - result.scores[axis]}
                            {change?.comparable && (
                              <span className="text-sky ml-1 text-xs">
                                ({signed(change.change.scoreDeltas[axis])})
                              </span>
                            )}
                          </span>
                        </span>
                      ))}
                    </div>
                    {change && !change.comparable && (
                      <p className="text-ink-soft mt-3 rounded-xl bg-[#f4f1ea] px-3 py-2 text-sm font-bold">
                        {VERSION_MISMATCH_MESSAGE}
                      </p>
                    )}
                    {change?.comparable && change.change.typeChanged && (
                      <p className="bg-sky-soft text-ink mt-3 rounded-xl px-3 py-2 text-sm font-bold">
                        タイプが {getPersonalityType(change.change.previousType).name} から{" "}
                        {getPersonalityType(change.change.currentType).name} に変わりました。
                        {change.change.familyChanged && "（組も変わりました）"}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </AdminPageFrame>
  );
}
