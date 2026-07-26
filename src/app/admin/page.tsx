"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminHeader,
  AdminLoading,
  AdminPageFrame,
  AxisAverageChart,
  EMPTY_MESSAGE,
  QuestionDistributionChart,
  StatTile,
  TYPE_COLORS,
  TYPE_LABELS,
  TypeDistributionChart,
} from "@/components/admin/admin-ui";
import { PERSONALITY_QUESTIONS } from "@/content/personality";
import { buildPersonalityCsv } from "@/lib/personality-csv";
import {
  PERSONALITY_AXES,
  calculateAxisAverages,
  calculateDashboardKpis,
  calculateGenderTypeMatrix,
  calculateQuestionStats,
  calculateTypeDistribution,
  createBalancedTeams,
  selectCompletedProfiles,
} from "@/lib/personality-stats";
import {
  fetchAllProfiles,
  fetchAllResults,
  fetchOwnProfile,
  type PersonalityResultRow,
  type ProfileRow,
} from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [results, setResults] = useState<PersonalityResultRow[]>([]);
  const [teamSize, setTeamSize] = useState(4);
  const [loading, setLoading] = useState(true);

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
        if (!ownProfile?.is_admin) {
          router.replace("/map");
          return;
        }
        const [allProfiles, allResults] = await Promise.all([
          fetchAllProfiles(),
          fetchAllResults(),
        ]);
        if (!active) return;
        setProfiles(allProfiles);
        setResults(allResults);
        setLoading(false);
      } catch {
        router.replace("/map");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const respondents = useMemo(() => selectCompletedProfiles(profiles), [profiles]);
  const kpis = useMemo(() => calculateDashboardKpis(profiles, results), [profiles, results]);
  const typeDistribution = useMemo(() => calculateTypeDistribution(respondents), [respondents]);
  const axisAverages = useMemo(() => calculateAxisAverages(respondents), [respondents]);
  const questionStats = useMemo(() => calculateQuestionStats(respondents), [respondents]);
  const genderTypeMatrix = useMemo(() => calculateGenderTypeMatrix(respondents), [respondents]);
  const teamPlan = useMemo(
    () => createBalancedTeams(respondents, teamSize),
    [respondents, teamSize],
  );

  const downloadCsv = useCallback(() => {
    const blob = new Blob([buildPersonalityCsv(profiles, results)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexmax-personality-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [profiles, results]);

  if (loading) return <AdminLoading />;

  return (
    <AdminPageFrame>
      <AdminHeader onCsv={downloadCsv} />
      <div className="mx-auto max-w-[96rem] space-y-6">
        <section>
          <h1 className="text-navy text-3xl font-black sm:text-4xl">性格診断ダッシュボード</h1>
          <p className="text-ink-soft mt-2 font-medium">
            学生一人ひとりの傾向と、クラス全体のバランスを確認できます。
          </p>
        </section>

        <section aria-label="主要指標" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile value={kpis.answered} label="回答ずみ" />
          <StatTile value={kpis.unanswered} label="未回答" />
          <StatTile value={kpis.registered} label="登録ユーザー数" />
          <StatTile value={kpis.recentAnswers} label="直近7日の回答" />
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <TypeDistributionChart data={typeDistribution} />
          <AxisAverageChart data={axisAverages} />
        </div>

        <QuestionDistributionChart data={questionStats} questions={PERSONALITY_QUESTIONS} />

        <section className="card-pop p-5 sm:p-7">
          <h2 className="text-navy text-xl font-black sm:text-2xl">性別 × タイプ</h2>
          <p className="text-ink-soft mt-1 text-sm font-medium">
            性別ごとの判定タイプ人数を表で確認します。
          </p>
          {respondents.length === 0 ? (
            <p className="bg-panel-tint text-ink-soft mt-5 rounded-2xl p-5 font-bold">
              {EMPTY_MESSAGE}
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-hairline text-ink-soft border-b text-left">
                    <th className="px-3 py-3">タイプ</th>
                    <th className="px-3 py-3 text-right">男性</th>
                    <th className="px-3 py-3 text-right">女性</th>
                    <th className="px-3 py-3 text-right">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {PERSONALITY_AXES.map((type) => {
                    return (
                      <tr key={type} className="border-hairline border-b">
                        <th className="px-3 py-3 text-left">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="h-3 w-3 rounded-[3px]"
                              style={{ backgroundColor: TYPE_COLORS[type] }}
                            />
                            {TYPE_LABELS[type]}
                          </span>
                        </th>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {genderTypeMatrix[type].male}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {genderTypeMatrix[type].female}
                        </td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums">
                          {genderTypeMatrix[type].total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card-pop p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-navy text-xl font-black sm:text-2xl">チーム編成の参考</h2>
              <p className="text-ink-soft mt-1 text-sm font-medium">
                タイプがなるべく散るように、回答ずみの学生を割り当てます。
              </p>
            </div>
            <label className="text-ink flex items-center gap-3 text-sm font-bold">
              1チームの人数
              <select
                value={teamSize}
                onChange={(event) => setTeamSize(Number(event.target.value))}
                className="border-hairline rounded-xl border-2 bg-white px-3 py-2"
              >
                {[2, 3, 4, 5, 6].map((size) => (
                  <option key={size} value={size}>
                    {size}人
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!teamPlan.canBuild ? (
            <p className="bg-panel-tint text-ink-soft mt-5 rounded-2xl p-5 font-bold">
              {teamPlan.reason}
            </p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {teamPlan.teams.map((team) => (
                <article
                  key={team.number}
                  className="border-hairline rounded-2xl border-2 bg-white p-4"
                >
                  <h3 className="text-navy text-lg font-black">チーム {team.number}</h3>
                  <ul className="mt-3 space-y-2">
                    {team.members.map((member) => (
                      <li
                        key={member.id}
                        className="bg-panel-tint flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2"
                      >
                        <Link
                          href={`/admin/students/${member.id}`}
                          className="text-ink font-bold underline decoration-transparent underline-offset-2 hover:decoration-current"
                        >
                          {member.display_name}
                        </Link>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                          style={{ backgroundColor: TYPE_COLORS[member.personality_type] }}
                        >
                          {TYPE_LABELS[member.personality_type]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-ink-soft mt-4 grid grid-cols-4 gap-1 text-center text-xs font-bold">
                    {PERSONALITY_AXES.map((axis) => (
                      <span key={axis} className="border-hairline rounded-lg border px-1 py-1">
                        {axis.slice(0, 1).toUpperCase()} {team.scoreTotals[axis]}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="text-ink-soft mt-5 text-sm font-bold">
            これは参考です。最終的な組み合わせは先生が決めてください。
          </p>
        </section>

        <section id="csv" className="card-pop p-5 sm:p-7">
          <h2 className="text-navy text-xl font-black sm:text-2xl">データ出力</h2>
          <p className="text-ink-soft mt-1 text-sm font-medium">
            最新プロフィールと20問の回答を、Excelで開けるCSVとして保存します。
          </p>
          <button
            type="button"
            onClick={downloadCsv}
            className="btn-game mt-5 px-6 py-3 [--btn-face:#004f8d] [--btn-shadow:#003c6b]"
          >
            CSVをダウンロード
          </button>
        </section>
      </div>
    </AdminPageFrame>
  );
}
