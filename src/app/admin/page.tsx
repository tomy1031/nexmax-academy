"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminError,
  AdminHeader,
  AdminLoading,
  AdminPageFrame,
  AxisAverageChart,
  EMPTY_MESSAGE,
  QuestionDistributionChart,
  StatTile,
  FAMILY_COLORS,
  FAMILY_LABELS,
  TypeDistributionChart,
} from "@/components/admin/admin-ui";
import {
  PERSONALITY_AXIS_META,
  PERSONALITY_FAMILIES,
  PERSONALITY_QUESTIONS,
  getFamilyForCode,
  getPersonalityType,
} from "@/content/personality";
import { buildPersonalityCsv } from "@/lib/personality-csv";
import {
  TEAM_ROLE_GAP_LABELS,
  buildTeamSuggestions,
  calculateAxisAverages,
  calculateDashboardKpis,
  calculateGenderFamilyMatrix,
  calculateQuestionStats,
  calculateTypeDistribution,
  createBalancedTeams,
  selectCompletedProfiles,
} from "@/lib/personality-stats";
import {
  PERSONALITY_VERSION,
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
  /**
   * 教師の手入れ替え結果（07 §6.4）。どの編成に対する編集かを key で持つ。
   * 人数やメンバーが変わった編集は自動的に無効になるので、effect で消して回らなくてよい。
   */
  const [manualEdit, setManualEdit] = useState<{ key: string; groups: string[][] } | null>(null);
  /** 入れ替えの1人目。もう1人を選ぶと交換する。 */
  const [swapPick, setSwapPick] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        const [allProfiles, allResults] = await Promise.all([
          fetchAllProfiles(),
          fetchAllResults(),
        ]);
        if (!active) return;
        setProfiles(allProfiles);
        setResults(allResults);
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
  }, [router]);

  const respondents = useMemo(
    () => selectCompletedProfiles(profiles, PERSONALITY_VERSION),
    [profiles],
  );
  const kpis = useMemo(() => calculateDashboardKpis(profiles, results), [profiles, results]);
  const typeDistribution = useMemo(() => calculateTypeDistribution(respondents), [respondents]);
  const axisAverages = useMemo(() => calculateAxisAverages(respondents), [respondents]);
  const questionStats = useMemo(() => calculateQuestionStats(respondents), [respondents]);
  const genderFamilyMatrix = useMemo(() => calculateGenderFamilyMatrix(respondents), [respondents]);
  const teamPlan = useMemo(
    () => createBalancedTeams(respondents, teamSize),
    [respondents, teamSize],
  );

  const teamKey = useMemo(
    () => `${teamSize}:${respondents.map((profile) => profile.id).join(",")}`,
    [teamSize, respondents],
  );
  const manualGroups = manualEdit?.key === teamKey ? manualEdit.groups : null;

  // 手で入れ替えたら、その割当から表示データを組み立て直す（ペナルティ・警告・内訳が再計算される）。
  const teams = useMemo(() => {
    if (!manualGroups) return teamPlan.teams;
    const byId = new Map(respondents.map((profile) => [profile.id, profile]));
    const groups = manualGroups.map((ids) =>
      ids.map((id) => byId.get(id)).filter((profile) => profile !== undefined),
    );
    return buildTeamSuggestions(
      groups,
      respondents,
      teamPlan.teams.map((team) => team.capacity),
    );
  }, [manualGroups, teamPlan, respondents]);

  const swapMembers = useCallback(
    (memberId: string) => {
      if (swapPick === null) {
        setSwapPick(memberId);
        return;
      }
      if (swapPick === memberId) {
        setSwapPick(null);
        return;
      }
      const current = (manualGroups ?? teams.map((team) => team.members.map((m) => m.id))).map(
        (ids) => [...ids],
      );
      const find = (id: string) => {
        for (let team = 0; team < current.length; team += 1) {
          const index = current[team]!.indexOf(id);
          if (index >= 0) return { team, index };
        }
        return null;
      };
      const left = find(swapPick);
      const right = find(memberId);
      if (left && right) {
        const temporary = current[left.team]![left.index]!;
        current[left.team]![left.index] = current[right.team]![right.index]!;
        current[right.team]![right.index] = temporary;
        setManualEdit({ key: teamKey, groups: current });
      }
      setSwapPick(null);
    },
    [swapPick, manualGroups, teams, teamKey],
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

  if (errorMessage) return <AdminError message={errorMessage} />;
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
          <h2 className="text-navy text-xl font-black sm:text-2xl">性別 × 組</h2>
          <p className="text-ink-soft mt-1 text-sm font-medium">
            性別ごとの人数です。16タイプでクロス集計すると1人だけのセルが並び、名簿と突き合わせて個人が
            特定できてしまうため、4つの組にまとめています。
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
                    <th className="px-3 py-3">組</th>
                    <th className="px-3 py-3 text-right">男性</th>
                    <th className="px-3 py-3 text-right">女性</th>
                    <th className="px-3 py-3 text-right">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {PERSONALITY_FAMILIES.map((family) => (
                    <tr key={family.id} className="border-hairline border-b">
                      <th className="px-3 py-3 text-left">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-3 w-3 rounded-[3px]"
                            style={{ backgroundColor: FAMILY_COLORS[family.id] }}
                          />
                          {FAMILY_LABELS[family.id]}
                        </span>
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {genderFamilyMatrix[family.id].male}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {genderFamilyMatrix[family.id].female}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">
                        {genderFamilyMatrix[family.id].total}
                      </td>
                    </tr>
                  ))}
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
              {teams.map((team) => (
                <article
                  key={team.number}
                  className="border-hairline rounded-2xl border-2 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-navy text-lg font-black">チーム {team.number}</h3>
                    {team.missingRoles.map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-[#fdf0e4] px-2 py-0.5 text-xs font-bold text-[#a5541c]"
                      >
                        足りない役割: {TEAM_ROLE_GAP_LABELS[role]}
                      </span>
                    ))}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {team.members.map((member) => (
                      <li
                        key={member.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ${
                          swapPick === member.id ? "bg-sky-soft" : "bg-panel-tint"
                        }`}
                      >
                        <Link
                          href={`/admin/students/${member.id}`}
                          className="text-ink font-bold underline decoration-transparent underline-offset-2 hover:decoration-current"
                        >
                          {member.display_name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => swapMembers(member.id)}
                          className="text-ink-soft hover:text-navy rounded-lg border px-2 py-0.5 text-xs font-bold"
                        >
                          {swapPick === member.id ? "キャンセル" : "入れ替え"}
                        </button>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                          style={{
                            backgroundColor:
                              FAMILY_COLORS[getFamilyForCode(member.personality_type).id],
                          }}
                          title={getPersonalityType(member.personality_type).name}
                        >
                          {member.personality_type}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {/* 家族の内訳バー（07 §6.4）。どの組に偏っているかを一目で見せる。 */}
                  <div
                    className="mt-4 flex h-3 overflow-hidden rounded-full"
                    role="img"
                    aria-label={PERSONALITY_FAMILIES.map(
                      (family) => `${FAMILY_LABELS[family.id]}${team.familyCounts[family.id]}人`,
                    ).join("、")}
                  >
                    {PERSONALITY_FAMILIES.map((family) =>
                      team.familyCounts[family.id] > 0 ? (
                        <span
                          key={family.id}
                          style={{
                            width: `${(team.familyCounts[family.id] / team.members.length) * 100}%`,
                            backgroundColor: FAMILY_COLORS[family.id],
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="text-ink-soft mt-3 grid grid-cols-4 gap-1 text-center text-xs font-bold">
                    {team.axisAverages.map((item) => {
                      const [first, second] = PERSONALITY_AXIS_META[item.axis].poles;
                      return (
                        <span
                          key={item.axis}
                          className="border-hairline rounded-lg border px-1 py-1"
                          title={`${first} ${item.firstPoleCount}人 / ${second} ${item.secondPoleCount}人`}
                        >
                          {first}
                          {item.firstPoleCount}/{second}
                          {item.secondPoleCount}
                        </span>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
          {teamPlan.notice && (
            <p className="mt-5 rounded-2xl bg-[#fdf0e4] p-4 text-sm font-bold text-[#a5541c]">
              {teamPlan.notice}
            </p>
          )}
          <p className="text-ink-soft mt-5 text-sm font-bold">
            これは参考です。最終的な組み合わせは先生が決めてください。「入れ替え」を2人ぶん押すと
            交換でき、足りない役割と組の内訳はその場で計算し直します。
            {manualGroups && (
              <button
                type="button"
                onClick={() => setManualEdit(null)}
                className="text-sky ml-2 underline underline-offset-4"
              >
                自動編成に戻す
              </button>
            )}
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
