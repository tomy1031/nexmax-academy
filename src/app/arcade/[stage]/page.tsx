import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArcadeGame } from "@/components/arcade/arcade-game";
import { getWordStage, listWordStages } from "@/lib/content";

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した単語ステージは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;
/**
 * git 由来の単語ステージはビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  return (await listWordStages()).map((stage) => ({ stage: stage.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stage: string }>;
}): Promise<Metadata> {
  const { stage: id } = await params;
  const stage = await getWordStage(id);
  return { title: stage ? `${stage.title} | ことばアーケード` : "ことばアーケード" };
}

export default async function ArcadeStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: id } = await params;
  if (!(await getWordStage(id))) notFound();

  return <ArcadeGame stages={await listWordStages()} initialStageId={id} />;
}
