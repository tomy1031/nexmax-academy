/**
 * マップの中身 — 既定のエリア／ステージに、スタジオで作ったステージを重ねる
 *
 * マップは「1ステージ＝1エリア＝背景画像1枚」（src/content/areas.ts）。その並びは
 * これまで `MAP_AREAS` と `STAGES` にコードとして書かれていて、増やすにも減らすにも
 * リポジトリを触るしかなかった。先生はそこに手が届かない。
 *
 * ここで「既定（コード）∪ スタジオで作ったステージ」を step で重ねる。これで
 * スタジオからステージを1つ足せばマップの停留所も1つ増え、下書きに戻せば消える。
 *
 * 重ね方の規則は step だけ。step は 1 から始まり、マップの上から数えた位置と一致する。
 * 同じ step が既定とスタジオの両方にあればスタジオ側が勝つ（先生が直したものが最新）。
 *
 * 純関数だけ。node:fs も React も持たないので、ページからも scripts からも呼べる。
 */

import type { MapArea } from "@/content/areas";
import type { Stage } from "@/content/schema";
import type { StageDefinition } from "@/content/stages";

/** 既定のエリアが尽きたあと、絵がまだ無いステージに使う下地。 */
const PLACEHOLDER_IMAGE = "";

/** step ごとに最初の1件だけを採る。step の重複は lint:content が error で弾く。 */
function firstByStep<T extends { step: number }>(items: readonly T[]): Map<number, T> {
  const byStep = new Map<number, T>();
  for (const item of items) {
    if (!byStep.has(item.step)) byStep.set(item.step, item);
  }
  return byStep;
}

/** マップに出す step の一覧（既定 ∪ スタジオ、昇順）。 */
function mergedSteps(seedStages: readonly StageDefinition[], stages: readonly Stage[]): number[] {
  const steps = new Set<number>();
  for (const seed of seedStages) steps.add(seed.step);
  for (const stage of stages) steps.add(stage.step);
  return [...steps].sort((a, b) => a - b);
}

/**
 * マップに並べるステージ（カード表示とピンの中身）。
 * スタジオ側が勝つので、直した見出し・説明・色がそのままマップに出る。
 */
export function toMapStages(
  seedStages: readonly StageDefinition[],
  stages: readonly Stage[],
): StageDefinition[] {
  const seedByStep = firstByStep(seedStages);
  const stageByStep = firstByStep(stages);

  return mergedSteps(seedStages, stages).map((step) => {
    const seed = seedByStep.get(step);
    const stage = stageByStep.get(step);
    if (!stage) return seed!;
    return {
      // 既定のステージがある step では、進捗キーが変わらないよう既定のIDを使う。
      // ここを差し替えると、いま学んでいる学習者の「クリア済み」が消える。
      id: seed?.id ?? stage.id,
      step,
      title: stage.title,
      reading: stage.reading,
      description: stage.description,
      kind: seed?.kind ?? "video-reading",
      kindLabel: seed?.kindLabel ?? "教材",
      color: stage.color,
    };
  });
}

/**
 * マップのエリア（土地）。ステージ1つにつき1つ。
 *
 * ステージが `area` を持っていればそれを使い、無ければ既定のエリアを使う。
 * どちらも無い（既定より先の step を新しく作った）ときは、名前だけのエリアにする。
 * 絵が無くても空色の帯として出す——絵の用意が遅れただけでステージが消えると、
 * 学習者は昨日あった教材を探しまわることになる。
 */
export function toMapAreas(
  seedAreas: readonly MapArea[],
  mapStages: readonly StageDefinition[],
  stages: readonly Stage[],
): MapArea[] {
  const stageByStep = firstByStep(stages);
  const seedByStageId = new Map(seedAreas.map((area) => [area.stageId, area]));

  return mapStages.map((mapStage, index) => {
    const seed = seedByStageId.get(mapStage.id) ?? seedAreas[index];
    const area = stageByStep.get(mapStage.step)?.area;
    if (!area) {
      return seed
        ? { ...seed, stageId: mapStage.id }
        : {
            id: `stage-${mapStage.step}`,
            name: mapStage.title,
            reading: mapStage.reading,
            image: PLACEHOLDER_IMAGE,
            imageSubject: "（未設定）",
            stageId: mapStage.id,
            note: mapStage.description,
          };
    }
    return {
      id: seed?.id ?? `stage-${mapStage.step}`,
      name: area.name,
      reading: area.reading,
      image: area.image,
      imageSubject: seed?.imageSubject ?? "（スタジオで設定）",
      stageId: mapStage.id,
      note: area.note,
    };
  });
}
