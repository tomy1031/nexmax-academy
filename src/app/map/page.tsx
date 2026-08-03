import { MapShell } from "@/components/map-shell";
import { listStages, listWordStages } from "@/lib/content";

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した教材は、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;

export default async function MapPage() {
  // 単語ステージはビルド時に読み、レッスンカードの進捗と行き先に使う。
  const wordStages = listWordStages().map((stage) => ({ id: stage.id, title: stage.title }));
  // データ化された公開ステージ。step が一致するピンから詳細ページへ行けるようにする。
  const stages = (await listStages())
    .filter((stage) => stage.status === "published")
    .map((stage) => ({ id: stage.id, step: stage.step }));
  return <MapShell wordStages={wordStages} stages={stages} />;
}
