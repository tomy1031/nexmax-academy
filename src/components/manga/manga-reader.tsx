"use client";

import Link from "next/link";
import type { Manga } from "@/content/schema";
import { MangaSlides } from "./manga-slides";

/**
 * まんがの入口。中身は横スライドの読み手（manga-slides.tsx）。
 *
 * 以前は縦に全コマ並べていたが、それだと絵を流し見して セリフを読まないまま
 * 下まで行けてしまう。1コマずつ出して、次へ進むのに1回タップを要求する。
 *
 * ここに残しているのは、ステージの枠の外で開いたときの見出しだけ
 *（枠の中では戻り先も「つぎへ」も枠が持つ）。
 */
export function MangaReader({
  manga,
  /** ステージの枠（ContentFrame）の中に置くとき。自前の外枠と戻りリンクを出さない。 */
  embedded = false,
}: {
  manga: Manga;
  embedded?: boolean;
}) {
  if (embedded) return <MangaSlides manga={manga} embedded />;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/map" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← まなびマップ
        </Link>
        <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
          📖 {manga.format === "story" ? "まんが" : "4コマ まんが"}
        </span>
      </header>
      <MangaSlides manga={manga} embedded />
    </div>
  );
}
