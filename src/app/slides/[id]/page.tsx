import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { SlideDeck } from "@/components/slides/slide-deck";
import { getSlides, listSlides } from "@/lib/content";
import { canonicalContentPath } from "@/lib/stage-lookup";

/**
 * スライド（先生の資料を そのまま 見せる教材）。
 */
/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した教材は、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 300;
/**
 * git 由来の教材はビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  return (await listSlides()).map((item) => ({ id: item.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const slides = await getSlides(id);
  return {
    title: slides ? `${slides.title} | スライド` : "スライド",
    description: slides?.description,
  };
}

export default async function SlidesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slides = await getSlides(id);
  if (!slides) notFound();

  // ステージに入っている教材は、本来のURL（`/<ステージ>/<種別>`）へ送り返す。
  // どのステージにも入っていない教材だけ、ここで表示する
  //（スタジオで作りかけの教材を先生が確認できる必要がある）。
  const canonical = await canonicalContentPath("slides", id);
  if (canonical) redirect(canonical);

  return <SlideDeck slides={slides} />;
}
