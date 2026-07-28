import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArcadeGame } from "@/components/arcade/arcade-game";
import { getWordStage, listWordStages } from "@/lib/content";

/** 実行時にファイルを読まないよう、全ステージを静的に切り出す。 */
export function generateStaticParams() {
  return listWordStages().map((stage) => ({ stage: stage.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stage: string }>;
}): Promise<Metadata> {
  const { stage: id } = await params;
  const stage = getWordStage(id);
  return { title: stage ? `${stage.title} | ことばアーケード` : "ことばアーケード" };
}

export default async function ArcadeStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: id } = await params;
  const stage = getWordStage(id);
  if (!stage) notFound();

  return <ArcadeGame stage={stage} />;
}
