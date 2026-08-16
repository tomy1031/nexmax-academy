import { MapShell } from "@/components/map-shell";
import { GOAL_AREA } from "@/content/areas";
import { listStages } from "@/lib/content";
import { mapListedStages, toMapAreas, toMapStages } from "@/lib/map-data";

/**
 * マップに出るのは「公開されていて、地図に出す指定のステージ」だけ。コードに書いた
 * 既定の停留所は持たない（持つと、地図にあるのに中身が無い停留所ができる）。
 * 「はじめに」のような案内は `listed: false` で地図から外れ、URLだけで開く。
 *
 * スタジオで「こうかい」したステージは、再デプロイを待たずこの間隔でマップに増える
 * （設計07 §11.1「gitコンテンツは静的生成のまま。DBコンテンツはISR/短いキャッシュ」）。
 */
export const revalidate = 60;

export default async function MapPage() {
  const stages = mapListedStages(await listStages());
  return (
    <MapShell routeAreas={toMapAreas(stages)} goalArea={GOAL_AREA} stages={toMapStages(stages)} />
  );
}
