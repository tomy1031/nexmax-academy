import Link from "next/link";
import type { Metadata } from "next";
import { listMeetings, listScenarios } from "@/lib/content";
import { NekuMax } from "@/components/nekumax";

export const metadata: Metadata = {
  title: "ミーティング | Japanese IT Pathway",
};

/**
 * ミーティング一覧。
 * 「聞く」教材（meeting）と「話す」教材（scenario / Live対話）を同じ入口に並べる。
 */
export default function MeetingIndexPage() {
  const meetings = listMeetings();
  const scenarios = listScenarios();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        <Link href="/" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← まなびマップ
        </Link>
      </header>

      <div className="card-island flex items-center gap-4 p-5 sm:p-6">
        <NekuMax variant="listen" size={92} bob />
        <div>
          <h1 className="text-ink text-2xl font-extrabold sm:text-3xl">🎧 ミーティング</h1>
          <p className="text-ink-soft mt-1 font-bold">
            会議の 画面で 日本語を 聞いて、話す れんしゅうを します。
          </p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-ink mb-2 text-lg font-extrabold">きく</h2>
        {meetings.length === 0 ? (
          <p className="text-ink-soft font-bold">じゅんびちゅうです。</p>
        ) : (
          <ul className="grid gap-4">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <Link
                  href={`/meeting/${meeting.id}`}
                  className="card-island block p-5 transition hover:scale-[1.01]"
                >
                  <p className="text-sky text-xs font-extrabold">
                    {meeting.participants.length + 1}人 ／ {meeting.script.length}行
                    {meeting.audioUrl ? " ／ 音声あり" : ""}
                  </p>
                  <p className="text-ink mt-1 text-lg font-extrabold">{meeting.title}</p>
                  <p className="text-ink-soft mt-1 text-sm font-bold">{meeting.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-ink mb-2 text-lg font-extrabold">話す（AIと 対話）</h2>
        {scenarios.length === 0 ? (
          <p className="text-ink-soft font-bold">じゅんびちゅうです。</p>
        ) : (
          <ul className="grid gap-4">
            {scenarios.map((scenario) => (
              <li key={scenario.id}>
                <Link
                  href={`/meeting/live/${scenario.id}`}
                  className="card-island block p-5 transition hover:scale-[1.01]"
                >
                  <p className="text-sky text-xs font-extrabold">{scenario.subtitle}</p>
                  <p className="text-ink mt-1 text-lg font-extrabold">
                    {scenario.emoji} {scenario.title}
                  </p>
                  <p className="text-ink-soft mt-1 text-sm font-bold">{scenario.client.desc}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
