/**
 * マップのピンの元データ — 定番ステージとデータ化ステージを step で重ねる
 *
 * ピンはもともと src/content/stages.ts のハードコード5件だけを見ていた。
 * そのままだと content/stages/*.json にステージを足しても停留所が描かれず、
 * 学習者はマップからその教材にたどり着けない（先生から見ると「作ったのに出ない」）。
 * ここで「定番 ∪ データ」に合流させ、画面は step 昇順に並んだこの配列だけを見る。
 *
 * 同じ step が両方にあるときはデータ側を採る。スタジオで直した見出し・説明・色が
 * 画面に出ないと、先生は直し方を見失うため。
 * ただし seedId は残す。定番ステージの見出しはルビ付きの組み方が画面側にあり
 * （ルビHTMLは新しく手書きしない — AGENTS.md 規律2）、それを引き当てる鍵になる。
 */

import type { ContentRefType, Stage } from "@/content/schema";
import type { StageColor, StageDefinition, StageKind } from "@/content/stages";

export interface StagePin {
  /** React の key と開閉状態に使う。データ化されていればそのID。 */
  readonly id: string;
  readonly step: number;
  readonly title: string;
  readonly reading: string;
  readonly description: string;
  readonly color: StageColor;
  /** データ化されていれば /stage/:id。まだなら null（「じゅんびちゅう」）。 */
  readonly href: string | null;
  /** ルビ付きの見出しを持つ定番ステージのID（あれば）。無ければ null。 */
  readonly seedId: string | null;
  /** 定番ステージの種別ラベル（データが無いときに使う）。 */
  readonly seedKind: StageKind | null;
  /** データ化されていれば、そのステージに入っている教材の種別（重複なし・学習順）。 */
  readonly kinds: readonly ContentRefType[];
}

/**
 * step ごとに最初の1件だけを採る。
 * step の重複は lint:content が error で弾くので、ここは「壊れたデータでも
 * 画面が落ちない」ための保険。後勝ちにすると同じデータでも表示が揺れる。
 */
function firstByStep<T extends { step: number }>(items: readonly T[]): Map<number, T> {
  const byStep = new Map<number, T>();
  for (const item of items) {
    if (!byStep.has(item.step)) byStep.set(item.step, item);
  }
  return byStep;
}

/** ステージに入っている教材の種別を、学習順のまま重複なしで拾う。 */
function kindsOf(stage: Stage): ContentRefType[] {
  const kinds: ContentRefType[] = [];
  for (const item of stage.contents) {
    if (!kinds.includes(item.type)) kinds.push(item.type);
  }
  return kinds;
}

/**
 * step をキーに、定番ステージ（src/content/stages.ts）とデータ化ステージを重ねる。
 * 同じ step ならデータ側が勝つ（管理画面での修正が常に最新）。step 昇順で返す。
 */
export function toStagePins(
  seeds: readonly StageDefinition[],
  stages: readonly Stage[],
): StagePin[] {
  const seedByStep = firstByStep(seeds);
  const stageByStep = firstByStep(stages);

  // 片方にしか無い step も落とさない。落とすと、定番の停留所が消えたり、
  // 新しく作ったステージがマップに出なかったりする。
  const steps = [...new Set([...seedByStep.keys(), ...stageByStep.keys()])].sort((a, b) => a - b);

  return steps.map((step) => {
    const seed = seedByStep.get(step);
    const stage = stageByStep.get(step);
    const source = stage ?? seed;
    // steps は両方のキーから作るので、どちらも無い step はここに来ない。
    if (!source) throw new Error(`step ${step} のステージが見つからない`);

    return {
      id: source.id,
      step,
      title: source.title,
      reading: source.reading,
      description: source.description,
      color: source.color,
      href: stage ? `/stage/${stage.id}` : null,
      seedId: seed?.id ?? null,
      seedKind: seed?.kind ?? null,
      kinds: stage ? kindsOf(stage) : [],
    };
  });
}
