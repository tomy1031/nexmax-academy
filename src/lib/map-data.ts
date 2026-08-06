/**
 * マップの中身 — 公開されているステージを、そのまま地図の停留所にする
 *
 * マップは「1ステージ＝1エリア＝背景画像1枚」（src/content/areas.ts）。
 *
 * 以前はここで「コードに書いた既定のステージ ∪ スタジオで作ったステージ」を重ねていた。
 * やめた理由は1つ。**既定があると、地図に出ているものと先生が作ったものがずれる**。
 * 先生が1つも作っていなくても5つの停留所が地図にあり、押しても中身が無い。
 * いまは公開ステージだけを `order` の順に並べる——地図に出ているものは全部、
 * 先生が作って公開したものになる。
 *
 * 純関数だけ。node:fs も React も持たないので、ページからも scripts からも呼べる。
 */

import type { MapArea } from "@/content/areas";
import type { ContentRefType, Stage } from "@/content/schema";

/**
 * マップに出すステージ1つ分（カードとピンの中身）。
 *
 * `kinds` は中に入っている教材の種別。以前は `kind`/`kindLabel` を
 * コードに書いた「動画/読解」「ペアワーク」で決めていたが、それは中身と一致しない
 * ラベルだった（まんが＋リスニング＋もんだいのステージが「ペアワーク」と出ていた）。
 * 中身から導けば、ずれようがない。
 */
export interface MapStage {
  id: string;
  /**
   * 地図の上から数えた番号（STEP 01…）。`order` そのものではない。
   * `order` は並び替えの結果でしかなく飛び番になりうるので、そのまま出すと
   * 「STEP 01 の次が STEP 30」になる。
   */
  number: number;
  title: string;
  reading: string;
  description: string;
  color: Stage["color"];
  kinds: readonly ContentRefType[];
}

/** マップの並び順（order の昇順・同点はIDで安定させる）。 */
export function sortStages(stages: readonly Stage[]): Stage[] {
  return [...stages].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function toMapStages(stages: readonly Stage[]): MapStage[] {
  return sortStages(stages).map((stage, index) => ({
    id: stage.id,
    number: index + 1,
    title: stage.title,
    reading: stage.reading,
    description: stage.description,
    color: stage.color,
    // 同じ種別が2つあっても、しるしは1つでいい（「まんが・まんが・もんだい」は読みにくい）
    kinds: [...new Set(stage.contents.map((content) => content.type))],
  }));
}

/**
 * マップのエリア（土地）。ステージ1つにつき1つ。
 *
 * 絵が無くても空色の帯として出す——絵の用意が遅れただけでステージが地図から消えると、
 * 学習者は昨日あった教材を探しまわることになる。
 */
export function toMapAreas(stages: readonly Stage[]): MapArea[] {
  return sortStages(stages).map((stage) => ({
    id: `area-${stage.id}`,
    name: stage.area?.name ?? stage.title,
    reading: stage.area?.reading ?? stage.reading,
    image: stage.area?.image ?? "",
    stageId: stage.id,
    note: stage.area?.note ?? stage.description,
  }));
}
