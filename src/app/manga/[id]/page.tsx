import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MangaReader } from "@/components/manga/manga-reader";
import { getManga, listMangas } from "@/lib/content";

/**
 * 漫画ページ（設計07 §4）。
 * 読み込みは静的生成の段階で終わらせ、実行時のファイルアクセスを作らない
 *（ローダーは後工程で Supabase 合流のため async — src/lib/content.ts）。
 */

export async function generateStaticParams() {
  return (await listMangas()).map((manga) => ({ id: manga.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const manga = await getManga(id);
  return { title: manga ? `${manga.title} | まんが` : "まんが" };
}

export default async function MangaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manga = await getManga(id);
  if (!manga) notFound();

  return <MangaReader manga={manga} />;
}
