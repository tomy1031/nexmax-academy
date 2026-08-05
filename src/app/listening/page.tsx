import Link from "next/link";
import type { Metadata } from "next";
import { listListenings, listScenarios } from "@/lib/content";
import { NexMax } from "@/components/nexmax";

export const metadata: Metadata = {
  title: "リスニング | Japanese IT Pathway",
};

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」したリスニングは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;

/**
 * リスニング一覧。
 *
 * 「きく」教材（listening）と「はなす」教材（scenario＝たいわ / Live対話）を
 * 同じ入口に並べる。教材としては別物（行き先も /listening と /talk で分けてある）
 * だが、たいわ 専用の一覧はまだ無い。ここから外すと、たいわ は ステージ経由でしか
 * 開けなくなる——だから見出しで「きく」「はなす」を はっきり 分けて 並べる。
 */
export default async function ListeningIndexPage() {
  const [listenings, scenarios] = await Promise.all([listListenings(), listScenarios()]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        <Link href="/" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← まなびマップ
        </Link>
      </header>

      <div className="card-island flex items-center gap-4 p-5 sm:p-6">
        <NexMax variant="listen" size={92} bob />
        <div>
          <h1 className="text-ink text-2xl font-extrabold sm:text-3xl">🎧 リスニング</h1>
          <p className="text-ink-soft mt-1 font-bold">
            会議の 画面で 日本語を 聞いて、話す れんしゅうを します。
          </p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-ink mb-2 text-lg font-extrabold">きく</h2>
        {listenings.length === 0 ? (
          <p className="text-ink-soft font-bold">じゅんびちゅうです。</p>
        ) : (
          <ul className="grid gap-4">
            {listenings.map((listening) => (
              <li key={listening.id}>
                <Link
                  href={`/listening/${listening.id}`}
                  className="card-island block p-5 transition hover:scale-[1.01]"
                >
                  <p className="text-sky text-xs font-extrabold">
                    {listening.participants.length + 1}人 ／ {listening.script.length}行
                    {listening.audioUrl ? " ／ 音声あり" : ""}
                  </p>
                  <p className="text-ink mt-1 text-lg font-extrabold">{listening.title}</p>
                  <p className="text-ink-soft mt-1 text-sm font-bold">{listening.description}</p>
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
                  href={`/talk/${scenario.id}`}
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
