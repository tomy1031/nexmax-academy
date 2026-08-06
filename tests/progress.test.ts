import { describe, expect, it } from "vitest";
import { GOAL_AREA } from "../src/content/areas";
import { deriveProgress, stageStatus } from "../src/lib/progress";

/**
 * 進み具合は「マップに出ている順のID」を渡して計算する。
 * ステージの並びはコードではなく先生が決めるので、ここに固定の一覧は持たない。
 */
const STAGE_IDS = ["s1", "s2", "s3", "s4", "s5"];

describe("deriveProgress", () => {
  it("なにもクリアしていないときは最初のステージが現在地になる", () => {
    const progress = deriveProgress([], STAGE_IDS);
    expect(progress.currentStageId).toBe(STAGE_IDS[0]);
    expect(progress.clearedCount).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it("クリア数から進捗率を出す", () => {
    const progress = deriveProgress(STAGE_IDS.slice(0, 2), STAGE_IDS);
    expect(progress.clearedCount).toBe(2);
    expect(progress.currentStageId).toBe(STAGE_IDS[2]);
    expect(progress.percent).toBe(Math.round((2 / STAGE_IDS.length) * 100));
  });

  it("すべてクリアすると現在のステージが無くなる", () => {
    const progress = deriveProgress(STAGE_IDS, STAGE_IDS);
    expect(progress.currentStageId).toBeNull();
    expect(progress.percent).toBe(100);
  });

  it("途中を飛ばしてクリアしていても、未クリアの最初のステージを現在地にする", () => {
    const progress = deriveProgress([STAGE_IDS[0]!, STAGE_IDS[3]!], STAGE_IDS);
    expect(progress.currentStageId).toBe(STAGE_IDS[1]);
    expect(progress.clearedCount).toBe(2);
  });

  it("消したステージのクリア記録は数に入れない", () => {
    // 残したままだと「5つ中6つ おわった」が出る
    const progress = deriveProgress([STAGE_IDS[0]!, "けしたステージ"], STAGE_IDS);
    expect(progress.clearedCount).toBe(1);
    expect(progress.totalCount).toBe(STAGE_IDS.length);
  });

  it("ステージが1つも無ければ 0%（0除算にしない）", () => {
    const progress = deriveProgress([], []);
    expect(progress.percent).toBe(0);
    expect(progress.currentStageId).toBeNull();
  });
});

describe("stageStatus", () => {
  it("クリア済み・いまここ・まだ、の3状態に振り分ける", () => {
    const progress = deriveProgress([STAGE_IDS[0]!], STAGE_IDS);
    expect(stageStatus(STAGE_IDS[0]!, progress)).toBe("cleared");
    expect(stageStatus(STAGE_IDS[1]!, progress)).toBe("current");
    expect(stageStatus(STAGE_IDS[2]!, progress)).toBe("locked");
  });
});

describe("GOAL_AREA", () => {
  it("ゴールは日本で、ステージには結びつかない", () => {
    // ゴールだけは学習の目的地そのものなのでコードに置く（先生が消す対象ではない）
    expect(GOAL_AREA.id).toBe("japan");
    expect(GOAL_AREA.stageId).toBeNull();
    expect(GOAL_AREA.image).not.toBe("");
  });
});
