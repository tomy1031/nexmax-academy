import Link from "next/link";
import type { Metadata } from "next";
import { listQuizSets } from "@/lib/content";
import { NekuMax } from "@/components/nekumax";

export const metadata: Metadata = {
  title: "もんだい | Japanese IT Pathway",
};

export default function QuizIndexPage() {
  const sets = listQuizSets();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        <Link href="/" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← まなびマップ
        </Link>
      </header>

      <div className="card-island flex items-center gap-4 p-5 sm:p-6">
        <NekuMax variant="hello" size={92} bob />
        <div>
          <h1 className="text-ink text-2xl font-extrabold sm:text-3xl">✏️ もんだい</h1>
          <p className="text-ink-soft mt-1 font-bold">まなんだ ことを、もんだいで たしかめよう。</p>
        </div>
      </div>

      {sets.length === 0 ? (
        <p className="text-ink-soft mt-6 font-bold">もんだいは じゅんびちゅうです。</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {sets.map((set) => (
            <li key={set.id}>
              <Link
                href={`/quiz/${set.id}`}
                className="card-island block p-5 transition hover:scale-[1.01]"
              >
                <p className="text-sky text-xs font-extrabold">
                  もんだい {set.questions.length}こ ／ 合格 {set.passRate}%
                </p>
                <p className="text-ink mt-1 text-lg font-extrabold">{set.title}</p>
                <p className="text-ink-soft mt-1 text-sm font-bold">{set.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
