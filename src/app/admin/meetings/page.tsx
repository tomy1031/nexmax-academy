"use client";

/**
 * ミーティングの きろく（先生向け・管理者だけ）
 *
 * 会話の練習は**その場で消える**ので、先生には「できたのか」が一度も見えなかった。
 * 判定をAIに通すようにしたので、1往復ずつ残してここで読む。
 *
 * ## 上に置くのは 学生の一覧ではなく「質問ごとの つまずき」
 * 先生がまず知りたいのは誰ができなかったかではなく、**どの質問で止まるか**。
 * ある質問だけ「もう いちど」が多いなら、原因は学生ではなく その質問のヒントである。
 * 直す順が一覧を上から読むだけで分かるように、もう いちど の多い順に並べる。
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { fetchMeetingLogs, statsByQuestion, type MeetingLogRow } from "@/lib/meeting/logs-db";
import { fetchAllProfiles, fetchOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";

const GRADE_LABEL: Record<string, { text: string; color: string }> = {
  veryGood: { text: "すばらしい", color: "#3aa458" },
  good: { text: "つたわった", color: "#0f7fd4" },
  miss: { text: "もう いちど", color: "#f0a500" },
};

export default function AdminMeetingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rows, setRows] = useState<MeetingLogRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

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
        const [logs, profiles] = await Promise.all([fetchMeetingLogs(), fetchAllProfiles()]);
        if (!active) return;
        if (logs.ok) setRows(logs.rows);
        else setNote(logs.message);
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

  const stats = statsByQuestion(rows);

  return (
    <AdminPageFrame>
      <AdminHeader
        title="💬 ミーティングの きろく"
        note="学生が 話した ことと、AIの 見かたです。読めるのは 先生だけです。"
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

      <section className="card-island mt-4 p-4 sm:p-5">
        <h2 className="text-navy text-lg font-black">しつもんごとの つまずき</h2>
        <p className="text-ink-soft mt-1 text-xs font-bold">
          「もう いちど」が 多い しつもんから 並べています。1つだけ 高いときは、学生ではなく その
          しつもんの ヒントを 見なおします。
        </p>
        {stats.length === 0 ? (
          <p className="text-ink-soft mt-3 font-bold">まだ きろくが ありません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-ink-soft text-left text-xs font-black">
                  <th className="py-1">しつもん</th>
                  <th className="py-1">はなした 回数</th>
                  <th className="py-1">すばらしい</th>
                  <th className="py-1">つたわった</th>
                  <th className="py-1">もう いちど</th>
                  <th className="py-1">言い直し</th>
                  <th className="py-1">AIなし</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat) => (
                  <tr key={stat.questionId} className="border-hairline border-t-2">
                    <td className="text-navy py-1 font-black">{stat.questionId}</td>
                    <td className="text-ink py-1 font-bold">{stat.turns}</td>
                    <td className="text-ink py-1 font-bold">{stat.veryGood}</td>
                    <td className="text-ink py-1 font-bold">{stat.good}</td>
                    <td className="py-1 font-black" style={{ color: "#c98700" }}>
                      {stat.miss}
                    </td>
                    <td className="text-ink py-1 font-bold">{stat.retried}</td>
                    <td className="text-ink-faint py-1 font-bold">{stat.fallback}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card-island mt-4 p-4 sm:p-5">
        <h2 className="text-navy text-lg font-black">1つずつの やりとり（新しい順）</h2>
        {rows.length === 0 ? (
          <p className="text-ink-soft mt-3 font-bold">まだ ありません。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="border-hairline space-y-2 rounded-2xl border-2 bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {row.grade ? (
                    <span
                      className="rounded-full px-3 py-0.5 text-xs font-black text-white"
                      style={{ background: GRADE_LABEL[row.grade]?.color ?? "#888" }}
                    >
                      {GRADE_LABEL[row.grade]?.text ?? row.grade}
                    </span>
                  ) : (
                    <span className="bg-panel-tint text-ink-soft rounded-full px-3 py-0.5 text-xs font-black">
                      AIなし（{row.fallback}）
                    </span>
                  )}
                  <span className="text-navy text-sm font-black">
                    {names[row.profile_id] ?? "（不明）"}
                  </span>
                  <span className="text-ink-faint text-xs font-bold">
                    {row.meeting_id} / {row.question_id} / {row.attempt}回目 /{" "}
                    {row.mode === "voice" ? "声" : "文字"}
                  </span>
                  <span className="text-ink-faint ml-auto text-xs font-bold">
                    {new Date(row.created_at).toLocaleString("ja-JP")}
                  </span>
                </div>

                <p className="bg-panel-tint text-ink rounded-xl px-3 py-2 text-sm font-bold break-words">
                  {row.utterance}
                </p>

                {row.judge ? (
                  <div className="space-y-1 text-sm">
                    <p className="text-ink font-bold break-words">
                      <span className="text-sky mr-2 text-xs font-extrabold">あいて</span>
                      {row.judge.reply}
                    </p>
                    <p className="text-leaf font-bold break-words">🌸 {row.judge.praise}</p>
                    {row.judge.fix ? (
                      <p className="text-ink-soft font-bold break-words">💡 {row.judge.fix}</p>
                    ) : null}
                    {row.judge.exampleAnswer ? (
                      <p className="text-ink-soft font-bold break-words">
                        れい: {row.judge.exampleAnswer}
                      </p>
                    ) : null}
                    {/*
                      軸（ことば・かみ合い・かたち・語釈）は **持って いる 行にだけ** 出す。
                      松井社長との 会話は 三段の 評価では なく「気づき」で 進むので、
                      この 4つを 持たない（`MeetingTurnJudge`）。前は 無条件に 読んで いて、
                      `glossary.length` で 先生の 画面が 落ちる 形に なって いた。
                    */}
                    {row.judge.language ? (
                      <p className="text-ink-faint text-xs font-bold">
                        ことば: {row.judge.language} / かみ合い: {row.judge.relevance} / かたち:{" "}
                        {row.judge.form}
                        {(row.judge.glossary?.length ?? 0) > 0
                          ? ` / 語釈: ${(row.judge.glossary ?? []).map((g) => g.term).join("、")}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPageFrame>
  );
}
