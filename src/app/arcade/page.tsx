import Link from "next/link";
import type { Metadata } from "next";
import { listWordStages } from "@/lib/content";
import { NekuMax } from "@/components/nekumax";

export const metadata: Metadata = {
  title: "ことばアーケード | Japanese IT Pathway",
};

/** ステージ一覧。ステージを1つ足すだけで並ぶ（エンジン＋データ分離）。 */
export default function ArcadeIndexPage() {
  const stages = listWordStages();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <header className="mb-5">
        <Link href="/" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← まなびマップ
        </Link>
      </header>

      <div className="card-pop flex items-center gap-4 p-5 sm:p-6">
        <NekuMax variant="book" size={92} bob />
        <div>
          <h1 className="text-ink text-2xl font-extrabold sm:text-3xl">🕹️ ことばアーケード</h1>
          <p className="text-ink-soft mt-1 font-bold">
            むかってくる ことばの よみを 入力して、英語の 意味を えらぼう。
          </p>
        </div>
      </div>

      {stages.length === 0 ? (
        <p className="text-ink-soft mt-6 font-bold">ステージは じゅんびちゅうです。</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {stages.map((stage) => (
            <li key={stage.id}>
              <Link
                href={`/arcade/${stage.id}`}
                className="card-pop block h-full p-5 transition hover:scale-[1.02]"
              >
                <p className="text-sky text-xs font-extrabold">
                  ことば {stage.words.length}こ ／ 合格 {stage.passRate}%
                </p>
                <p className="text-ink mt-1 text-lg font-extrabold">
                  {stage.title}
                  {stage.password && <span className="ml-2 text-sm">🔒</span>}
                </p>
                <p className="text-ink-soft mt-1 text-sm font-bold">{stage.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
