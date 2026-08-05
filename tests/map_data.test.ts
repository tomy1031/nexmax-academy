import { describe, expect, it } from "vitest";
import { ROUTE_AREAS } from "../src/content/areas";
import { STAGES } from "../src/content/stages";
import { contentSchema, type Stage } from "../src/content/schema";
import { toMapAreas, toMapStages } from "../src/lib/map-data";

/**
 * マップの中身の合流（既定 ∪ スタジオ）。
 *
 * ここが崩れると、先生がスタジオでステージを足しても地図に出ない（または
 * 既定のステージが消える）。どちらも学習者から見ると教材が行方不明になる。
 */

function stage(over: Record<string, unknown> = {}): Stage {
  const parsed = contentSchema.safeParse({
    kind: "stage",
    id: "studio-stage",
    step: 3,
    title: "スタジオの ステージ",
    reading: "すたじおの すてーじ",
    description: "スタジオで つくった ステージ。",
    color: "sky",
    status: "published",
    contents: [{ ref: "sample_horenso", type: "quizset" }],
    wordStageIds: [],
    ...over,
  });
  if (!parsed.success) throw new Error(`fixture が壊れている: ${parsed.error.message}`);
  return parsed.data as Stage;
}

const AREA = {
  name: "しごとの しま",
  reading: "しごとの しま",
  image: "/img/scenes/area_office_island.webp",
  note: "あたらしい しごとの しま。",
};

describe("toMapStages", () => {
  it("スタジオを何も作らなければ、既定のステージがそのまま出る", () => {
    expect(toMapStages(STAGES, [])).toEqual([...STAGES]);
  });

  it("同じ step ならスタジオ側の見出し・説明・色が勝つ", () => {
    const seed = STAGES[2]!;
    const [merged] = toMapStages(STAGES, [
      stage({ step: seed.step, title: "あたらしい 名前" }),
    ]).filter((s) => s.step === seed.step);
    expect(merged?.title).toBe("あたらしい 名前");
    expect(merged?.color).toBe("sky");
  });

  it("既定がある step では ID を変えない（進捗の記録が切れるため）", () => {
    const seed = STAGES[0]!;
    const merged = toMapStages(STAGES, [stage({ step: seed.step, id: "studio-new" })]);
    expect(merged[0]?.id).toBe(seed.id);
  });

  it("既定より先の step は新しいステージとして増える", () => {
    const step = STAGES.length + 1;
    const merged = toMapStages(STAGES, [stage({ step, id: "studio-new" })]);
    expect(merged).toHaveLength(STAGES.length + 1);
    expect(merged[merged.length - 1]?.id).toBe("studio-new");
  });

  it("step 昇順に並ぶ（マップは上から step 順に積むため）", () => {
    const merged = toMapStages(STAGES, [stage({ step: 9, id: "a" }), stage({ step: 7, id: "b" })]);
    const steps = merged.map((s) => s.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });
});

describe("toMapAreas", () => {
  it("ステージ1つにつきエリア1つ（1ステージ＝1エリア）", () => {
    const stages = [stage({ step: STAGES.length + 1, id: "studio-new", area: AREA })];
    const mapStages = toMapStages(STAGES, stages);
    const areas = toMapAreas(ROUTE_AREAS, mapStages, stages);
    expect(areas).toHaveLength(mapStages.length);
  });

  it("スタジオで作らなければ、既定のエリアがそのまま出る", () => {
    const mapStages = toMapStages(STAGES, []);
    const areas = toMapAreas(ROUTE_AREAS, mapStages, []);
    expect(areas.map((a) => a.image)).toEqual(ROUTE_AREAS.map((a) => a.image));
    expect(areas.map((a) => a.name)).toEqual(ROUTE_AREAS.map((a) => a.name));
  });

  it("area を決めると、その土地の名前と絵に差し替わる", () => {
    const seed = STAGES[1]!;
    const stages = [stage({ step: seed.step, area: AREA })];
    const areas = toMapAreas(ROUTE_AREAS, toMapStages(STAGES, stages), stages);
    const target = areas.find((a) => a.stageId === seed.id);
    expect(target?.name).toBe(AREA.name);
    expect(target?.image).toBe(AREA.image);
  });

  it("既定より先で area が無くても、エリアは消えない（絵は空のまま出す）", () => {
    // 絵の用意が遅れただけでステージが消えると、学習者は昨日あった教材を探しまわる。
    const step = STAGES.length + 1;
    const stages = [stage({ step, id: "studio-new" })];
    const areas = toMapAreas(ROUTE_AREAS, toMapStages(STAGES, stages), stages);
    const added = areas[areas.length - 1]!;
    expect(added.stageId).toBe("studio-new");
    expect(added.image).toBe("");
  });

  it("エリアのIDは重複しない（React の key と aria-label に使うため）", () => {
    const stages = [
      stage({ step: STAGES.length + 1, id: "a", area: AREA }),
      stage({ step: STAGES.length + 2, id: "b", area: AREA }),
    ];
    const areas = toMapAreas(ROUTE_AREAS, toMapStages(STAGES, stages), stages);
    expect(new Set(areas.map((a) => a.id)).size).toBe(areas.length);
  });

  it("エリアの stageId は、その位置のステージを必ず指す", () => {
    // ここがずれると、ピンが別のステージの土地の上に立つ。
    const stages = [stage({ step: STAGES.length + 1, id: "studio-new", area: AREA })];
    const mapStages = toMapStages(STAGES, stages);
    const areas = toMapAreas(ROUTE_AREAS, mapStages, stages);
    areas.forEach((area, index) => {
      expect(area.stageId).toBe(mapStages[index]!.id);
    });
  });
});
