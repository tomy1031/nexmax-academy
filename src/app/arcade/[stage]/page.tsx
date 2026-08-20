import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArcadeGame } from "@/components/arcade/arcade-game";
import { getStage, getWordStage, listStages, listWordStages } from "@/lib/content";
import { mergeWordStages } from "@/lib/wordstage-merge";

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
  const words = (await listWordStages()).map((stage) => stage.id);
  /*
   * ことばの グループを 2つ以上 持つ ステージは、まとめた ぶんの 行き先
   *（`/arcade/<ステージID>`）も 先に 作る。ステージの 画面の カードが ここへ 来る。
   */
  const merged = (await listStages())
    .filter((stage) => stage.wordStageIds.length > 1 && !words.includes(stage.id))
    .map((stage) => stage.id);
  return [...words, ...merged].map((id) => ({ stage: id }));
}

/**
 * URLの1段目が **単語ステージ**なら それを、**ステージ**なら その ステージの
 * ことばを まとめた ものを 返す。単語ステージを 先に 見るので、名前が ぶつかっても
 * これまでの `/arcade/<単語ステージID>` は 変わらない。
 */
async function resolveArcadeStage(id: string) {
  const own = await getWordStage(id);
  if (own) return own;
  const stage = await getStage(id);
  if (!stage) return null;
  const loaded = await Promise.all(stage.wordStageIds.map((ref) => getWordStage(ref)));
  return mergeWordStages(
    stage.id,
    loaded.filter((item): item is NonNullable<typeof item> => item !== null),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stage: string }>;
}): Promise<Metadata> {
  const { stage: id } = await params;
  const stage = await resolveArcadeStage(id);
  return { title: stage ? `${stage.title} | ことばアーケード` : "ことばアーケード" };
}

export default async function ArcadeStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: id } = await params;
  const stage = await resolveArcadeStage(id);
  if (!stage) notFound();

  /*
   * まとめた ぶんは 保存された 単語ステージでは 無いので、一覧にも 混ぜて 渡す
   *（渡さないと ことばアーケードが 「そんな グループは 無い」と 見なす）。
   */
  const stages = await listWordStages();
  const all = stages.some((item) => item.id === stage.id) ? stages : [stage, ...stages];

  return <ArcadeGame stages={all} initialStageId={stage.id} />;
}
