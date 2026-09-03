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
 * （設計07 §11.1「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得」）。
 */
/*
 * **作りおきを 作り直さない**（`force-static`）。`revalidate` を 置くと、期限ぎれの
 * 作りおきを 直すために リクエストの 中で フルSSR（実測 280〜570ms）が 走り、
 * 無料枠の CPU 10ms で 落ちる。落ちても 鮮度は 更新されないので、輪が 閉じない。
 * 理由の 全文は src/app/[stage]/[content]/page.tsx と docs/deploy.md §0.13。
 */
export const dynamic = "force-static";

export default async function MapPage() {
  const stages = mapListedStages(await listStages());
  return (
    <MapShell routeAreas={toMapAreas(stages)} goalArea={GOAL_AREA} stages={toMapStages(stages)} />
  );
}
