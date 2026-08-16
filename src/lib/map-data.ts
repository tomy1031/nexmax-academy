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
import { stageContentPath } from "@/lib/stage-routes";

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
  /**
   * 中の教材（学習順）。「さいしょから」「つづきから」の行き先と、
   * どこまで進んだかの判定に使う。IDは進捗キーでもある。
   */
  contents: readonly MapStageContent[];
  /**
   * ひもづく単語ステージ。マップの「単語を 勉強」は、どの課の単語かが決まっていないと
   * 学習者を一覧に放り出すことになるので、**そのステージのもの**へ直行させる。
   */
  wordStageIds: readonly string[];
}

export interface MapStageContent {
  id: string;
  type: ContentRefType;
  href: string;
}

/** マップの並び順（order の昇順・同点はIDで安定させる）。 */
export function sortStages(stages: readonly Stage[]): Stage[] {
  return [...stages].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * 地図に停留所として出るステージか。
 *
 * 2つの問いの積である——**完成しているか**（status）と **地図に出すか**（listed）。
 * 「はじめに」のような案内は完成していても地図には出さない。URLは生きているので、
 * 先生がリンクを配れば開ける（`listed` の由来は schema.ts のコメント）。
 */
export function isOnMap(stage: Stage): boolean {
  return stage.status === "published" && stage.listed;
}

/** 地図に出るステージだけを、地図の並び順で。 */
export function mapListedStages(stages: readonly Stage[]): Stage[] {
  return sortStages(stages.filter(isOnMap));
}

/**
 * 地図の上から数えた STEP 番号。**地図に出ないステージは null**。
 *
 * 数え方をここ1か所に閉じるのは、ステージのトップと教材の枠で別々に数えていたのを
 * そろえるため。以前はどちらも「見つからなければ 1」に倒していたので、地図に無い
 * ステージが本物の STEP 01 と同じ札を出していた。番号が無いことは、番号 1 ではない。
 */
export function stageStepNumber(stages: readonly Stage[], stageId: string): number | null {
  const index = mapListedStages(stages).findIndex((stage) => stage.id === stageId);
  return index < 0 ? null : index + 1;
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
    contents: stage.contents.flatMap((content, position) => {
      const href = stageContentPath(stage.id, stage.contents, position);
      return href ? [{ id: content.ref, type: content.type, href }] : [];
    }),
    wordStageIds: stage.wordStageIds,
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
