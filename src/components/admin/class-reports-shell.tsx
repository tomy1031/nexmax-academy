"use client";

/**
 * 授業ごとの分析（先生向け・管理者だけ — 要望 #599）
 *
 * 前は 学習の きろくの いちばん 上に あった。2026-10-26 に 別の ページへ 移した
 *（「管理画面の学習のきろく授業ごとの分析は別ページにまとめてください」）。
 *
 * ## 組は 学習の きろくと 共有する
 * 所属・期生は 学習の きろくの 絞り込みと 同じ 保存を 読み書きする。先生が 同時に
 * 教える 組は 1つなので、どちらの ページで 選んでも もう 片方で 選び直さなくて よい
 *（2026-10-11「遷移のたびに絞り込み条件データが消えて不自由」）。
 *
 * ## 生徒の 名前
 * 押すと 学習の きろくで その 生徒を えらんだ 形で 開く（`/admin/records?profile=`）。
 * 前は 同じ 画面の 下に「工程ごとの 行った こと」が 出て いた。
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { ClassReportPanel } from "@/components/admin/class-report-panel";
import { fetchOwnProfile } from "@/lib/profile-db";
import { classDateLabel, groupLabel, toClassReportView } from "@/lib/records/class-report";
import { fetchClassReports, type ClassReportRow } from "@/lib/records/records-db";
import { browserStorage, readSavedFilter, writeSavedGroup } from "@/lib/records/saved-filter";
import { AFFILIATIONS, COHORTS, isCohort, isUniversity } from "@/lib/school";
import { createClient } from "@/lib/supabase/client";

interface Group {
  readonly university: string;
  readonly cohort: number;
}

export function ClassReportsShell() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>({ university: "", cohort: 0 });
  const [chosenId, setChosenId] = useState<string | null>(null);

  /* 先生かどうかを 確かめて、学習の きろくで 選んで いた 組で 開く。関所は RLS。 */
  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        router.replace("/welcome");
        return;
      }
      try {
        const own = await fetchOwnProfile();
        if (!active) return;
        if (!own) {
          router.replace("/welcome");
          return;
        }
        if (!own.is_admin) {
          router.replace("/map");
          return;
        }
        const saved = readSavedFilter(browserStorage());
        const university = saved?.university;
        const cohort = saved?.cohort;
        // 「未設定」（-1）の 組の 分析は 無いので、ここでは「ぜんぶ」で 開く
        setGroup({
          university: isUniversity(university) ? university : "",
          cohort: isCohort(cohort) ? cohort : 0,
        });
        setLoading(false);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  /* 選んだ 組の 分析を 新しい 順に 読む（選んで いなければ 全部の 組）。 */
  const reportKey = `${group.university}|${group.cohort}`;
  const [reportData, setReportData] = useState<{
    key: string;
    rows: ClassReportRow[];
    note: string | null;
  } | null>(null);
  useEffect(() => {
    if (loading) return;
    let active = true;
    const [university = "", cohort = "0"] = reportKey.split("|");
    void (async () => {
      const got = await fetchClassReports({ university, cohort: Number(cohort) });
      if (!active) return;
      setReportData(
        got.ok
          ? { key: reportKey, rows: got.rows, note: null }
          : { key: reportKey, rows: [], note: got.message },
      );
    })();
    return () => {
      active = false;
    };
  }, [loading, reportKey]);
  const reportFresh = reportData !== null && reportData.key === reportKey;
  const reports = useMemo(
    () => (reportFresh ? reportData.rows.map(toClassReportView) : []),
    [reportFresh, reportData],
  );
  const report = reports.find((one) => one.id === chosenId) ?? reports[0] ?? null;

  const changeGroup = (patch: Partial<Group>) => {
    const next = { ...group, ...patch };
    setGroup(next);
    // 組を 変えたら その 組の 最新の 分析から 見せる
    setChosenId(null);
    writeSavedGroup(browserStorage(), next);
  };

  if (errorMessage) return <AdminError message={errorMessage} />;
  if (loading) return <AdminLoading />;

  return (
    <AdminPageFrame>
      <AdminHeader
        title="📝 授業ごとの分析"
        note="火・水・金の授業のあと（21:30ごろ）に、Claude が生徒の回答を読んで書きます。AIの疑いは決めつけではなく、先生が本人に口頭で確かめる候補です。"
      />

      <section className="card-island mb-3 p-4">
        <h2 className="text-navy text-lg font-black">どの授業の分析を見ますか</h2>
        <p className="text-ink-soft mt-1 mb-3 text-xs font-bold">
          所属・期生は学習の記録と同じです。どちらで選んでも、もう片方も同じ組で開きます。
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="所属">
            <select
              value={group.university}
              onChange={(e) => changeGroup({ university: e.target.value })}
              className={SELECT}
            >
              <option value="">ぜんぶ</option>
              {AFFILIATIONS.map((one) => (
                <option key={one} value={one}>
                  {one}
                </option>
              ))}
            </select>
          </Field>

          <Field label="期生">
            <select
              value={String(group.cohort)}
              onChange={(e) => changeGroup({ cohort: Number(e.target.value) })}
              className={SELECT}
            >
              <option value="0">ぜんぶ</option>
              {COHORTS.map((one) => (
                <option key={one} value={String(one)}>
                  {one}期生
                </option>
              ))}
            </select>
          </Field>

          <Field label="授業の日">
            <select
              value={report?.id ?? ""}
              onChange={(e) => setChosenId(e.target.value)}
              disabled={reports.length === 0}
              className={SELECT}
            >
              {reports.length === 0 ? <option value="">（まだありません）</option> : null}
              {reports.map((one) => (
                <option key={one.id} value={one.id}>
                  {classDateLabel(one.classDate)} {groupLabel(one)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <ClassReportPanel
        report={report}
        busy={!reportFresh}
        note={reportFresh ? reportData.note : null}
      />
    </AdminPageFrame>
  );
}

const SELECT =
  "border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-3 py-2 text-sm font-bold";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-ink-soft text-xs font-black">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
