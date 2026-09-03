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
/*
 * 7日。無料枠の CPU 10ms では 作り直しの フルSSR（280〜570ms）が 落ち、
 * 鮮度が 更新されないまま 毎リクエスト 繰り返す ため（2026-09-02 に 授業中の
 * 本番で 発生）。理由の 全文は src/app/[stage]/[content]/page.tsx と
 * docs/deploy.md §0.13。有料プランに したら 300 へ 戻してよい。
 */
export const revalidate = 604800;

export default async function MapPage() {
  const stages = mapListedStages(await listStages());
  return (
    <MapShell routeAreas={toMapAreas(stages)} goalArea={GOAL_AREA} stages={toMapStages(stages)} />
  );
}
