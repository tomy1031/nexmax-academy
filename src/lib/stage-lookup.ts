/**
 * 教材 → それが入っているステージのURL
 *
 * 学習者に見せるURLは1つに決める（`/asakai/listening`）。古い `/listening/<id>` は
 * 消さずに、ここで引いた本来のURLへ送り返す——リンクを配ったあとで消すと、
 * 学習者の手元のブックマークだけが 404 になる。
 *
 * どのステージにも入っていない教材は null。その場合は古いURLのまま表示する
 *（スタジオで作りかけの教材を先生が確認できる必要がある）。
 */

import type { ContentRefType } from "@/content/schema";
import { listStages } from "@/lib/content";
import { sortStages } from "@/lib/map-data";
import { stageContentPath } from "@/lib/stage-routes";

export async function canonicalContentPath(
  type: ContentRefType,
  id: string,
): Promise<string | null> {
  // 同じ教材が2つのステージに入っていることはありうる。地図の順で先に出るほうを本来のURLにする。
  for (const stage of sortStages(await listStages())) {
    const index = stage.contents.findIndex(
      (content) => content.ref === id && content.type === type,
    );
    if (index >= 0) return stageContentPath(stage.id, stage.contents, index);
  }
  return null;
}
