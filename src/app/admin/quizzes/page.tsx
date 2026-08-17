"use client";

/**
 * テストの きろく（先生向け・管理者だけ）
 *
 * もんだいの 結果は これまで **端末にしか 残らず、しかも 合計点だけ**だった。
 * だから 先生には「点が ひくかった」ことしか 見えず、**どの もんだいで 止まったか**も
 * **その子が 何と 書いたか**も 分からなかった。1問ずつ 残して ここで 読む。
 *
 * ## 上に置くのは 学生の一覧ではなく「もんだいごとの 正答率」
 * `/admin/meetings` と 同じ 考え方。ある もんだいだけ 正答率が ひくいなら、
 * 疑うのは 学生ではなく **その もんだいの 出し方**か **前の 教材の 説明**である。
 * 直す順が 一覧を 上から 読むだけで 分かるように、**ひくい順**に 並べる。
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import {
  attemptsOf,
  fetchQuizResults,
  statsByQuestion,
  type QuizResultRow,
} from "@/lib/quiz/results-db";
import { fetchAllProfiles, fetchOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";

const TYPE_LABEL: Record<string, string> = {
  choose: "4たく",
  multi: "ぜんぶ えらぶ",
  keyword: "じぶんで 書く",
  wordbank: "語群から あなうめ",
  emotion: "気もち → 言い方",
};

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function when(at: string): string {
  if (!at) return "";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminQuizzesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rows, setRows] = useState<QuizResultRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [setId, setSetId] = useState<string>("");

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
        const [results, profiles] = await Promise.all([fetchQuizResults({}), fetchAllProfiles()]);
        if (!active) return;
        if (results.state === "ready") setRows([...results.rows]);
        else if (results.state === "preparing")
          setNote(
            "きろくは じゅんびちゅうです（supabase/migrations/20260817120000_quiz_results.sql を SQL Editor で 実行すると 見られます）。",
          );
        else setNote(results.message);
        setNames(Object.fromEntries(profiles.map((p) => [p.id, p.display_name])));
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

  if (loading) return <AdminLoading />;
  if (errorMessage) return <AdminError message={errorMessage} />;

  /** どの テストの きろくが あるか（多い順）。切り替えの 選択肢に なる。 */
  const setCount = new Map<string, number>();
  for (const row of rows) setCount.set(row.quiz_set_id, (setCount.get(row.quiz_set_id) ?? 0) + 1);
  const setIds = [...setCount.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const current = setId || setIds[0] || "";
  const shown = rows.filter((r) => r.quiz_set_id === current);
  const stats = statsByQuestion(shown);
  const attempts = attemptsOf(shown);
  const nameOf = (profileId: string) => names[profileId] || profileId.slice(0, 8);

  return (
    <AdminPageFrame>
      <AdminHeader
        title="✏️ テストの きろく"
        note="学生が えらんだ・書いた こたえです。読めるのは 先生だけです。"
      />

      {note ? (
        <p
          role="status"
          className="rounded-2xl border-2 bg-white p-4 text-sm font-black"
          style={{ borderColor: "var(--color-sun)", color: "var(--color-ink)" }}
        >
          {note}
        </p>
      ) : null}

      {setIds.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {setIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSetId(id)}
              className="rounded-full border-2 px-4 py-1 text-sm font-black"
              style={{
                borderColor: id === current ? "var(--color-navy)" : "var(--color-line)",
                color: id === current ? "var(--color-navy)" : "var(--color-ink-soft)",
                background: "white",
              }}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}

      {/* 1. もんだいごとの正答率（主役） */}
      <section className="card-island mt-4 p-4 sm:p-5">
        <h2 className="text-navy text-lg font-black">どの もんだいが むずかしいか</h2>
        <p className="text-ink-soft mt-1 text-xs font-bold">
          正答率の ひくい順に 並べて います。1つだけ ひくいときは、学生ではなく その もんだいの
          出し方か、前の 教材の 説明を 見なおします。
        </p>
        {stats.length === 0 ? (
          <p className="text-ink-soft mt-3 font-bold">まだ きろくが ありません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-ink-soft text-left text-xs font-black">
                  <th className="py-1">もんだい</th>
                  <th className="py-1">かたち</th>
                  <th className="py-1">こたえた</th>
                  <th className="py-1">せいかい</th>
                  <th className="py-1">正答率</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.questionId} className="border-t" style={{ borderColor: "#e6eef6" }}>
                    <td className="text-ink py-2 font-black">
                      Q{s.questionIndex + 1}
                      <span className="text-ink-soft ml-2 font-bold">{s.questionId}</span>
                    </td>
                    <td className="text-ink-soft py-2 font-bold">
                      {TYPE_LABEL[s.questionType] ?? s.questionType}
                    </td>
                    <td className="text-ink py-2 font-bold">{s.answered}</td>
                    <td className="text-ink py-2 font-bold">{s.correct}</td>
                    <td
                      className="py-2 font-black"
                      style={{ color: s.rate < 0.5 ? "var(--color-coral)" : "var(--color-navy)" }}
                    >
                      {pct(s.rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. まちがえた人のこたえ */}
      {stats.some((s) => s.misses.length > 0) ? (
        <section className="card-island mt-4 p-4 sm:p-5">
          <h2 className="text-navy text-lg font-black">まちがえた 人の こたえ</h2>
          <p className="text-ink-soft mt-1 text-xs font-bold">
            じぶんで 書く もんだいの 書き方の ちがいや、まぎらわしい 選択肢は ここで 見つかります。
          </p>
          <ul className="mt-3 space-y-3">
            {stats
              .filter((s) => s.misses.length > 0)
              .map((s) => (
                <li key={s.questionId}>
                  <div className="text-ink text-sm font-black">
                    Q{s.questionIndex + 1}
                    <span className="text-ink-soft ml-2 font-bold">{s.questionId}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {s.misses.map((m) => (
                      <span
                        key={m.answer}
                        className="text-ink rounded-full border-2 bg-white px-3 py-1 text-xs font-bold"
                        style={{ borderColor: "var(--color-line)" }}
                      >
                        {m.answer === "" ? "（書かずに こたえを 見た）" : m.answer}
                        <span className="text-ink-soft ml-2">{m.count}</span>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {/* 3. 生徒ごとの結果 */}
      {attempts.length > 0 ? (
        <section className="card-island mt-4 p-4 sm:p-5">
          <h2 className="text-navy text-lg font-black">生徒ごとの けっか</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-ink-soft text-left text-xs font-black">
                  <th className="py-1">なまえ</th>
                  <th className="py-1">何回目</th>
                  <th className="py-1">点</th>
                  <th className="py-1">こたえた数</th>
                  <th className="py-1">いつ</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.attemptId} className="border-t" style={{ borderColor: "#e6eef6" }}>
                    <td className="py-2 font-black">
                      <Link href={`/admin/students/${a.profileId}`} className="text-sky underline">
                        {nameOf(a.profileId)}
                      </Link>
                    </td>
                    <td className="text-ink py-2 font-bold">{a.nth}</td>
                    <td className="text-navy py-2 font-black">
                      {a.earned} / {a.points}
                    </td>
                    <td className="text-ink py-2 font-bold">
                      {a.answered}
                      {a.fullSet ? "" : "（一部）"}
                    </td>
                    <td className="text-ink-soft py-2 font-bold">{when(a.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AdminPageFrame>
  );
}
