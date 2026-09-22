import { MapShell } from "@/components/map-shell";
import { GOAL_AREA } from "@/content/areas";
import type { Content, Stage } from "@/content/schema";
import { assetUrl } from "@/lib/asset-url";
import {
  listArticles,
  listListenings,
  listMangas,
  listMeetings,
  listQuizSets,
  listScenarios,
  listSkits,
  listStages,
} from "@/lib/content";
import { mapListedStages, toMapAreas, toMapStages } from "@/lib/map-data";
import { stageCardImage } from "@/lib/stage-card-image";

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

/**
 * カードに 出す 絵（ステージID → 絵の URL）。
 *
 * 絵を 選ぶ 決まりは `src/lib/stage-card-image.ts`。ここでは **教材を 引いて 渡す**
 * だけを する。1種別 1回の 読み込みで 済ませる（`list*` は `cache()` ずみ）ので、
 * ステージが 増えても 往復は 増えない。
 *
 * このページは 作りおき（`force-static`）なので、この 読み込みは **ビルドの ときに
 * 1度きり**。学習者の リクエストの 中では 走らない。
 */
async function cardImages(stages: readonly Stage[]): Promise<Map<string, string>> {
  const [mangas, articles, skits, listenings, quizSets, meetings, scenarios] = await Promise.all([
    listMangas(),
    listArticles(),
    listSkits(),
    listListenings(),
    listQuizSets(),
    listMeetings(),
    listScenarios(),
  ]);
  const byRef = new Map<string, Content>();
  for (const item of [
    ...mangas,
    ...articles,
    ...skits,
    ...listenings,
    ...quizSets,
    ...meetings,
    ...scenarios,
  ] as Content[]) {
    byRef.set(`${item.kind}:${item.id}`, item);
  }

  const images = new Map<string, string>();
  for (const stage of stages) {
    const src = stageCardImage(stage, (ref) => byRef.get(`${ref.type}:${ref.ref}`));
    // 絵の 差しかえが 学習者に 届くよう 版番号を 付ける（src/lib/asset-url.ts）
    if (src) images.set(stage.id, assetUrl(src) ?? src);
  }
  return images;
}

export default async function MapPage() {
  const stages = mapListedStages(await listStages());
  return (
    <MapShell
      routeAreas={toMapAreas(stages)}
      goalArea={GOAL_AREA}
      stages={toMapStages(stages, await cardImages(stages))}
    />
  );
}
