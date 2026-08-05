import { MapShell } from "@/components/map-shell";
import { GOAL_AREA, ROUTE_AREAS } from "@/content/areas";
import { STAGES } from "@/content/stages";
import { listStages } from "@/lib/content";
import { toMapAreas, toMapStages } from "@/lib/map-data";

/**
 * マップの中身は「既定（コード）∪ スタジオで公開したステージ」。
 * スタジオで「こうかい」したステージは、再デプロイを待たずこの間隔でマップに増える
 * （設計07 §11.1「gitコンテンツは静的生成のまま。DBコンテンツはISR/短いキャッシュ」）。
 */
export const revalidate = 60;

export default async function MapPage() {
  const stages = (await listStages()).filter((stage) => stage.status === "published");
  const mapStages = toMapStages(STAGES, stages);
  const routeAreas = toMapAreas(ROUTE_AREAS, mapStages, stages);
  return <MapShell routeAreas={routeAreas} goalArea={GOAL_AREA} stages={mapStages} />;
}
