import { describe, expect, it } from "vitest";
import { MAP_AREAS, ROUTE_AREAS } from "../src/content/areas";
import { STAGES } from "../src/content/stages";
import { deriveProgress, stageStatus } from "../src/lib/progress";

const STAGE_IDS = STAGES.map((stage) => stage.id);

describe("deriveProgress", () => {
  it("なにもクリアしていないときは最初のステージが現在地になる", () => {
    const progress = deriveProgress([]);
    expect(progress.currentStageId).toBe(STAGE_IDS[0]);
    expect(progress.clearedCount).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it("クリア数から進捗率を出す", () => {
    const progress = deriveProgress(STAGE_IDS.slice(0, 2));
    expect(progress.clearedCount).toBe(2);
    expect(progress.currentStageId).toBe(STAGE_IDS[2]);
    expect(progress.percent).toBe(Math.round((2 / STAGES.length) * 100));
  });

  it("すべてクリアすると現在のステージが無くなる", () => {
    const progress = deriveProgress(STAGE_IDS);
    expect(progress.currentStageId).toBeNull();
    expect(progress.percent).toBe(100);
  });

  it("途中を飛ばしてクリアしていても、未クリアの最初のステージを現在地にする", () => {
    const progress = deriveProgress([STAGE_IDS[0]!, STAGE_IDS[3]!]);
    expect(progress.currentStageId).toBe(STAGE_IDS[1]);
    expect(progress.clearedCount).toBe(2);
  });
});

describe("stageStatus", () => {
  it("クリア済み・いまここ・まだ、の3状態に振り分ける", () => {
    const progress = deriveProgress([STAGE_IDS[0]!]);
    expect(stageStatus(STAGE_IDS[0]!, progress)).toBe("cleared");
    expect(stageStatus(STAGE_IDS[1]!, progress)).toBe("current");
    expect(stageStatus(STAGE_IDS[2]!, progress)).toBe("locked");
  });
});

describe("MAP_AREAS", () => {
  it("エリアに割り当てたステージが STAGES に実在し、重複しない", () => {
    const assigned = MAP_AREAS.flatMap((area) => (area.stageId ? [area.stageId] : []));
    expect(new Set(assigned).size).toBe(assigned.length);
    for (const id of assigned) expect(STAGE_IDS).toContain(id);
  });

  it("すべてのステージがどこかのエリアに置かれている", () => {
    const assigned = new Set(MAP_AREAS.flatMap((area) => (area.stageId ? [area.stageId] : [])));
    for (const id of STAGE_IDS) expect(assigned.has(id)).toBe(true);
  });

  it("最後のエリアは日本（ゴール）で、道のりのエリアには含めない", () => {
    expect(MAP_AREAS[MAP_AREAS.length - 1]!.id).toBe("japan");
    expect(ROUTE_AREAS).toHaveLength(MAP_AREAS.length - 1);
    expect(ROUTE_AREAS.some((area) => area.id === "japan")).toBe(false);
  });
});
