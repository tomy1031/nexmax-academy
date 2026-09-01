import Link from "next/link";
import type { Metadata } from "next";
import { listScenarios } from "@/lib/content";
import { NexMax } from "@/components/nexmax";

export const metadata: Metadata = {
  title: "たいわ | Japanese IT Pathway",
};

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」したシナリオは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 300;

/**
 * たいわ（AIと 話す）の一覧。
 *
 * もとは /listening の中に「話す（AIと 対話）」の節として間借りしていた。
 * たいわ は Zoom風の枠こそリスニングと同じだが、マイクで話して要件を聞き出す
 * 教材で、聞く教材とは学習者のすることが違う。同じ入口に並べておくと、
 * 学習者は「聞くだけ」のつもりでマイクの要る画面に入ってしまう
 *（行き先を /talk に分けてある理由と同じ — content-kinds.ts / live-mode.tsx）。
 *
 * ステージからも開けるが、この一覧が無いと たいわ は ステージ経由でしか
 * 開けない。話す練習だけをもう一度やりたい学習者が入口を見つけられるように、
 * 単語（/wordtest）と同じく教材そのものの一覧を持たせる。
 */
export default async function TalkIndexPage() {
  const scenarios = await listScenarios();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        {/* 行き先は **まなびマップ**（札の字のとおり）。ここは `/` を指していて、
            押した学習者は ログイン直後の タイトル画面まで 放り出されていた。 */}
        <Link
          prefetch={false}
          href="/map"
          className="text-ink-soft hover:text-navy text-sm font-extrabold"
        >
          ← まなびマップ
        </Link>
      </header>

      <div className="card-island flex items-center gap-4 p-5 sm:p-6">
        <NexMax variant="hello" size={92} bob />
        <div>
          <h1 className="text-ink text-2xl font-extrabold sm:text-3xl">🎙️ たいわ</h1>
          <p className="text-ink-soft mt-1 font-bold">
            会議の 画面で、AIの あいてと 日本語で 話します。聞きたい ことを 自分の ことばで
            聞いてみましょう。
          </p>
        </div>
      </div>

      <section className="mt-6">
        {scenarios.length === 0 ? (
          <p className="text-ink-soft font-bold">じゅんびちゅうです。</p>
        ) : (
          <ul className="grid gap-4">
            {scenarios.map((scenario) => (
              <li key={scenario.id}>
                <Link
                  prefetch={false}
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

      {/*
        聞く教材への戻り道。話す前に もう一度 聞きたい学習者が、マップまで
        戻らずに 行き来できるようにする（/listening 側にも同じ形の行がある）。
      */}
      <p className="mt-6 text-sm font-bold">
        <Link
          prefetch={false}
          href="/listening"
          className="text-sky-deep hover:text-navy underline"
        >
          🎧 聞く れんしゅうは リスニング
        </Link>
      </p>
    </div>
  );
}
