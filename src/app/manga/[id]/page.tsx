import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MangaReader } from "@/components/manga/manga-reader";
import { getManga, listMangas } from "@/lib/content";

/**
 * 漫画ページ（設計07 §4）。
 */
/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した教材は、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;
/**
 * git 由来の教材はビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  return (await listMangas()).map((item) => ({ id: item.id }));
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
