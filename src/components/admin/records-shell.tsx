"use client";

/**
 * 学習の きろく（先生向け・管理者だけ）
 *
 * ## 何を 解いた ものか
 * 記録は 表ごとに 別の 画面に 散って いた（ミーティング／テスト）うえ、進み具合・
 * ことばの テスト・たいわ・リスニングは **そもそも 残って いなかった**。
 * ここは その 5種類を **1つの 表の かたち**で 読む 場所である。
 *
 * ## 絞り込みは いつも 同じ 5つ
 * 所属（AUPP／CADT／講師・スタッフ）・期生・メンバー・ステージ・単元。
 * 種類を 切り替えても 絞り込みは そのまま 残す——「3期生の この子」を 選び直すのに
 * タブを 変えるたび 5回 選ぶのは、先生の 手を 止める。
 *
 * ## 表は 横に スクロールする
 * 列を 減らして 収める 道は 採らない。先生が 見たいのは **学生が 書いた 言葉**で、
 * それは たいてい いちばん 長い 列である。畳むと 見えなく なる。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { fetchAllProfiles, fetchOwnProfile, type ProfileRow } from "@/lib/profile-db";
import { AFFILIATIONS, COHORTS, formatSchool } from "@/lib/school";
import { createClient } from "@/lib/supabase/client";
import {
  fetchContentProgress,
  fetchListeningRecords,
  fetchMeetingRecords,
  fetchQuizRecords,
  fetchTalkRecords,
  fetchWordAnswerRecords,
  fetchWordTestRecords,
  NO_QUERY,
  RECORDS_LIMIT,
  type RecordsQuery,
  type RecordsResult,
} from "@/lib/records/records-db";
import {
  buildLookups,
  buildRecordsCsv,
  EMPTY_FILTER,
  filterRows,
  listeningTable,
  matchesProfile,
  progressTable,
  quizTable,
  RECORD_KINDS,
  talkTable,
  wordTable,
  type RecordFilter,
  type RecordKind,
  type RecordTable,
} from "@/lib/records/table";
import type { UnitIndex } from "@/lib/records/units";

/** 1画面に 出す 行数。**続きは ボタンで 足す**（学期ぶんを 一気に 描くと 開かない）。 */
const PAGE_SIZE = 200;

export function RecordsShell({ index }: { index: UnitIndex }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [kind, setKind] = useState<RecordKind>("progress");
  const [filter, setFilter] = useState<RecordFilter>(EMPTY_FILTER);
  /**
   * 読み終えた 表と、それが **どの タブの ものか**。
   *
   * 「読み込み中か」を 別の state に 持たない。持つと、タブを 押した 瞬間に
   * 効果の 中で 同期に setState する ことに なり、描いた あと もう一度 描き直す
   *（`react-hooks/set-state-in-effect`）。ここに タブ名を 一緒に 置けば、
   * **中身が 今の タブの ものか**を 見るだけで 読み込み中かが 決まる。
   */
  const [loaded, setLoaded] = useState<{
    kind: RecordKind;
    /** どの 絞り込みで 読んだ ものか。変わったら 読み直す。 */
    query: RecordsQuery;
    table: RecordTable;
    note: string | null;
  } | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const lookups = useMemo(() => buildLookups(profiles, index.units), [profiles, index.units]);

  /*
   * 絞り込みを **DB へ 渡す かたち**に ほどく。
   *
   * 手もとで ふるいに かけるだけに すると、上限（新しい ほうから 2000行）より 前の
   * 記録には 永久に たどり着けない——ことばの 明細は 1語 1行なので、2コマで 上限に 届く。
   * ここで `where` に して 送れば、「先週の この子」も 出る。
   *
   * ことばの 絞り込みだけは 手もとに 残す（DB の 全文検索は 置いて いない）。
   */
  const query: RecordsQuery = useMemo(() => {
    const byPerson =
      filter.profileId !== ""
        ? [filter.profileId]
        : filter.university !== "" || filter.cohort !== 0
          ? profiles
              .filter((profile) => matchesProfile(profile, { ...filter, profileId: "" }))
              .map((profile) => profile.id)
          : null;
    const byUnit =
      filter.unitId !== ""
        ? [filter.unitId]
        : filter.stageId !== ""
          ? index.units.filter((unit) => unit.stageId === filter.stageId).map((unit) => unit.id)
          : null;
    return { profileIds: byPerson, unitIds: byUnit };
  }, [filter, profiles, index.units]);

  const fresh = loaded !== null && loaded.kind === kind && loaded.query === query;
  const busy = !fresh;
  const table = fresh ? loaded.table : null;
  const note = fresh ? loaded.note : null;

  /* 先生かどうかを 確かめて、名簿を 読む。関所は RLS なので、ここは 見せ方の 話。 */
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
        const all = await fetchAllProfiles();
        if (!active) return;
        setProfiles(all);
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

  /*
   * 見て いる タブの 表だけを 読む。5種類を いちどに 読むと、学期の 終わりに
   * 先生の 画面が 開かなく なる。
   */
  useEffect(() => {
    if (loading) return;
    let active = true;
    void (async () => {
      const built = await loadTable(kind, lookups, query);
      if (!active) return;
      setLoaded({ kind, query, table: built.table, note: built.note });
    })();
    return () => {
      active = false;
    };
  }, [kind, loading, lookups, query]);

  const rows = useMemo(
    () => (table ? filterRows(table, filter, lookups) : []),
    [table, filter, lookups],
  );

  const downloadCsv = useCallback(() => {
    if (!table) return;
    const blob = new Blob([buildRecordsCsv(table.columns, rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexmax-records-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [table, rows, kind]);

  if (errorMessage) return <AdminError message={errorMessage} />;
  if (loading) return <AdminLoading />;

  /* メンバーの 一覧は 所属・期生の 絞り込みに 合わせて 減らす（40人から 探させない）。 */
  const pickable = profiles
    .filter((profile) => matchesProfile(profile, { ...filter, profileId: "" }))
    .toSorted((a, b) => a.display_name.localeCompare(b.display_name, "ja"));

  const units = index.units
    .filter((unit) => filter.stageId === "" || unit.stageId === filter.stageId)
    .toSorted((a, b) => a.order - b.order);

  return (
    <AdminPageFrame>
      <AdminHeader
        title="📊 学習の きろく"
        note="学生が 進めた ところと、書いた・話した ことです。読めるのは 先生だけです。"
        onCsv={table && rows.length > 0 ? downloadCsv : undefined}
      />

      <nav aria-label="きろくの しゅるい" className="mb-3 flex flex-wrap gap-2">
        {RECORD_KINDS.map((one) => (
          <button
            key={one.id}
            type="button"
            onClick={() => {
              setKind(one.id);
              // 出す 行数は タブごとに 数え直す（前の タブで 何度も 押した ぶんを 持ち越さない）。
              setShown(PAGE_SIZE);
            }}
            aria-current={kind === one.id ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-black transition ${
              kind === one.id ? "bg-navy text-white" : "border-hairline text-ink border-2 bg-white"
            }`}
          >
            <span aria-hidden className="mr-1">
              {one.icon}
            </span>
            {one.label}
          </button>
        ))}
      </nav>

      <section className="card-island mb-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="所属">
          <select
            value={filter.university}
            onChange={(e) =>
              // 所属を 変えたら メンバーの 選びを 外す（別の 学校の 人が 選ばれた ままに ならない）
              setFilter((prev) => ({ ...prev, university: e.target.value, profileId: "" }))
            }
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
            value={String(filter.cohort)}
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, cohort: Number(e.target.value), profileId: "" }))
            }
            className={SELECT}
          >
            <option value="0">ぜんぶ</option>
            {COHORTS.map((one) => (
              <option key={one} value={String(one)}>
                {one}期生
              </option>
            ))}
            <option value="-1">未設定</option>
          </select>
        </Field>

        <Field label="メンバー">
          <select
            value={filter.profileId}
            onChange={(e) => setFilter((prev) => ({ ...prev, profileId: e.target.value }))}
            className={SELECT}
          >
            <option value="">ぜんぶ（{pickable.length}人）</option>
            {pickable.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name || profile.email}
                {formatSchool(profile) ? `（${formatSchool(profile)}）` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="ステージ">
          <select
            value={filter.stageId}
            onChange={(e) =>
              // ステージを 変えたら 単元の 選びを 外す（別の ステージの 教材が 残らない）
              setFilter((prev) => ({ ...prev, stageId: e.target.value, unitId: "" }))
            }
            className={SELECT}
          >
            <option value="">ぜんぶ</option>
            {index.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="単元">
          <select
            value={filter.unitId}
            onChange={(e) => setFilter((prev) => ({ ...prev, unitId: e.target.value }))}
            className={SELECT}
          >
            <option value="">ぜんぶ</option>
            {units.map((unit) => (
              <option key={`${unit.type}:${unit.id}`} value={unit.id}>
                {unit.title}
                {unit.stageTitle === "" ? "（ステージに 入って いません）" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="ことばで さがす">
          <input
            type="search"
            value={filter.text}
            onChange={(e) => setFilter((prev) => ({ ...prev, text: e.target.value }))}
            placeholder="学生の こたえ・名前"
            className={SELECT}
          />
        </Field>
      </section>

      {note ? (
        <p
          role="status"
          className="mb-3 rounded-2xl border-2 bg-white p-4 text-sm font-black"
          style={{ borderColor: "var(--color-sun)", color: "var(--color-ink)" }}
        >
          {note}
        </p>
      ) : null}

      <section className="card-island p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-navy text-lg font-black">
            {RECORD_KINDS.find((one) => one.id === kind)?.label}
          </h2>
          <p className="text-ink-soft text-xs font-bold">
            {busy ? "読み込み中です。" : `${rows.length} 行`}
            {filter.profileId !== "" || filter.university !== "" || filter.cohort !== 0
              ? "（絞り込み中）"
              : ""}
          </p>
        </div>

        {busy ? (
          <p className="text-ink-soft font-bold">読み込み中です。</p>
        ) : rows.length === 0 ? (
          <p className="text-ink-soft font-bold">
            この 条件では まだ きろくが ありません。絞り込みを ゆるめて みてください。
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-sm">
                <thead>
                  <tr className="text-ink-soft border-b-2 text-left text-xs font-black">
                    {table?.columns.map((column) => (
                      <th key={column.key} className="py-2 pr-3 whitespace-nowrap">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((row, i) => (
                    <tr
                      key={`${row.profileId}:${row.unitId}:${row.at}:${i}`}
                      className="border-hairline text-ink border-b font-bold"
                    >
                      {table?.columns.map((column) => (
                        <td key={column.key} className="max-w-[24rem] py-2 pr-3 align-top">
                          {row.cells[column.key] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > shown ? (
              <button
                type="button"
                onClick={() => setShown((prev) => prev + PAGE_SIZE)}
                className="border-hairline text-navy mt-3 rounded-2xl border-2 bg-white px-5 py-2 text-sm font-black"
              >
                もっと 見る（のこり {rows.length - shown} 行）
              </button>
            ) : null}
          </>
        )}
      </section>
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

/**
 * タブ1つぶんを 読んで、表に する。
 *
 * 読めなかった ときは **空の 表と 言い分**を 返す（例外に しない）。移行SQL が
 * まだ 流れて いない だけの ことも あり、そのときに 画面ごと 落とすと
 * 先生には「壊れた」ようにしか 見えない。
 */
async function loadTable(
  kind: RecordKind,
  lookups: ReturnType<typeof buildLookups>,
  query: RecordsQuery = NO_QUERY,
): Promise<{ table: RecordTable; note: string | null }> {
  const wrap = (table: RecordTable, results: readonly RecordsResult<unknown>[]) => {
    const failed = results.find(
      (one): one is Extract<RecordsResult<unknown>, { ok: false }> => !one.ok,
    );
    const truncated = results.some((one) => one.ok && one.truncated);
    return {
      table,
      note: failed
        ? failed.message
        : truncated
          ? `新しい ほうから ${RECORDS_LIMIT} 行までを 出しています。もっと 前を 見るときは 絞り込んでください。`
          : null,
    };
  };

  if (kind === "progress") {
    const got = await fetchContentProgress(query);
    return wrap(progressTable(got.ok ? got.rows : [], lookups), [got]);
  }
  if (kind === "quiz") {
    const got = await fetchQuizRecords(query);
    return wrap(quizTable(got.ok ? got.rows : [], lookups), [got]);
  }
  if (kind === "word") {
    const [answers, results] = await Promise.all([
      fetchWordAnswerRecords(query),
      fetchWordTestRecords(query),
    ]);
    return wrap(
      wordTable(answers.ok ? answers.rows : [], results.ok ? results.rows : [], lookups),
      [answers, results],
    );
  }
  if (kind === "talk") {
    const [meetings, talks] = await Promise.all([
      fetchMeetingRecords(query),
      fetchTalkRecords(query),
    ]);
    return wrap(talkTable(meetings.ok ? meetings.rows : [], talks.ok ? talks.rows : [], lookups), [
      meetings,
      talks,
    ]);
  }
  const got = await fetchListeningRecords(query);
  return wrap(listeningTable(got.ok ? got.rows : [], lookups), [got]);
}
