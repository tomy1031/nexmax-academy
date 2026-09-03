import Link from "next/link";
import type { Metadata } from "next";
import { listListenings } from "@/lib/content";
import { NexMax } from "@/components/nexmax";

export const metadata: Metadata = {
  title: "リスニング | Japanese IT Pathway",
};

/**
 * 公開分のDBコンテンツは **初回アクセスのとき** に合流する（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得」）。
 * スタジオで「こうかい」したリスニングは、再デプロイを待たずこの間隔で届く。
 */
/*
 * **作りおきを 作り直さない**（`force-static`）。`revalidate` を 置くと、期限ぎれの
 * 作りおきを 直すために リクエストの 中で フルSSR（実測 280〜570ms）が 走り、
 * 無料枠の CPU 10ms で 落ちる。落ちても 鮮度は 更新されないので、輪が 閉じない。
 * 理由の 全文は src/app/[stage]/[content]/page.tsx と docs/deploy.md §0.13。
 */
export const dynamic = "force-static";

/**
 * リスニング一覧（聞く教材だけ）。
 *
 * 以前は たいわ（scenario＝Live対話）も「話す（AIと 対話）」の節として
 * ここに並べていた。たいわ 専用の一覧が無く、ここから外すと ステージ経由でしか
 * 開けなくなるためだったが、いまは /talk に一覧がある。
 * 聞く教材と話す教材を同じ入口に置くと、学習者は「聞くだけ」のつもりで
 * マイクの要る画面に入ってしまうので、入口ごと分ける
 *（行き先を /listening と /talk に分けてあるのと同じ理由 — content-kinds.ts）。
 */
export default async function ListeningIndexPage() {
  const listenings = await listListenings();

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
        <NexMax variant="listen" size={92} bob />
        <div>
          <h1 className="text-ink text-2xl font-extrabold sm:text-3xl">🎧 リスニング</h1>
          <p className="text-ink-soft mt-1 font-bold">
            会議の 画面で、日本語を 聞く れんしゅうを します。
          </p>
        </div>
      </div>

      <section className="mt-6">
        {listenings.length === 0 ? (
          <p className="text-ink-soft font-bold">じゅんびちゅうです。</p>
        ) : (
          <ul className="grid gap-4">
            {listenings.map((listening) => (
              <li key={listening.id}>
                <Link
                  prefetch={false}
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

      {/*
        話す教材への行き道。一覧そのものは /talk に移したが、行き先を消すだけだと
        聞いたあとに話す練習へ進む道が この画面から 見えなくなる。
      */}
      <p className="mt-6 text-sm font-bold">
        <Link prefetch={false} href="/talk" className="text-sky-deep hover:text-navy underline">
          🎙️ AIと 話す れんしゅうは たいわ
        </Link>
      </p>
    </div>
  );
}
