import { describe, expect, it } from "vitest";
import { GOAL_AREA } from "../src/content/areas";
import { deriveProgress, mapInitialPanel, mapLanding, stageStatus } from "../src/lib/progress";

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

  it("途中を飛ばしてクリアしていたら、いちばん先のクリアの つぎを現在地にする", () => {
    // 2026-09-29 の指定で 向きを 変えた。以前は「未クリアの 最初」＝s2 に 引き戻して いた
    const progress = deriveProgress([STAGE_IDS[0]!, STAGE_IDS[3]!], STAGE_IDS);
    expect(progress.currentStageId).toBe(STAGE_IDS[4]);
    expect(progress.skippedIds).toEqual([STAGE_IDS[1], STAGE_IDS[2]]);
    expect(progress.clearedCount).toBe(2);
  });

  it("最後に教材を開いたステージがまだなら、そこを現在地にする", () => {
    const progress = deriveProgress(STAGE_IDS.slice(0, 2), STAGE_IDS, STAGE_IDS[3]!);
    expect(progress.currentStageId).toBe(STAGE_IDS[3]);
    expect(progress.skippedIds).toEqual([STAGE_IDS[2]]);
  });

  it("とばしたステージへ戻って学習しているなら、そこを現在地にする", () => {
    const progress = deriveProgress(
      [STAGE_IDS[0]!, STAGE_IDS[1]!, STAGE_IDS[3]!],
      STAGE_IDS,
      STAGE_IDS[2]!,
    );
    expect(progress.currentStageId).toBe(STAGE_IDS[2]);
    expect(progress.skippedIds).toEqual([]);
  });

  it("最後に開いたステージがクリア済み・地図に無いときは、いちばん先のクリアの つぎ", () => {
    const cleared = [STAGE_IDS[0]!, STAGE_IDS[1]!];
    expect(deriveProgress(cleared, STAGE_IDS, STAGE_IDS[1]!).currentStageId).toBe(STAGE_IDS[2]);
    expect(deriveProgress(cleared, STAGE_IDS, "けしたステージ").currentStageId).toBe(STAGE_IDS[2]);
  });

  it("先がぜんぶクリア済みなら、とばしたステージを現在地にする", () => {
    const progress = deriveProgress(
      [STAGE_IDS[0]!, STAGE_IDS[2]!, STAGE_IDS[3]!, STAGE_IDS[4]!],
      STAGE_IDS,
    );
    expect(progress.currentStageId).toBe(STAGE_IDS[1]);
    expect(progress.skippedIds).toEqual([]);
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

  it("とばしたステージは locked ではなく skipped", () => {
    const progress = deriveProgress([STAGE_IDS[0]!, STAGE_IDS[2]!], STAGE_IDS);
    expect(stageStatus(STAGE_IDS[1]!, progress)).toBe("skipped");
    expect(stageStatus(STAGE_IDS[3]!, progress)).toBe("current");
    expect(stageStatus(STAGE_IDS[4]!, progress)).toBe("locked");
  });
});

describe("mapLanding（地図を ひらいた ときに 下りる 先）", () => {
  it("はじめての学習者は下りない（START の看板から見せる）", () => {
    expect(mapLanding(deriveProgress([], STAGE_IDS), null)).toBeNull();
  });

  it("クリアが無くても、教材をおえたステージがあればそこへ下りる", () => {
    expect(mapLanding(deriveProgress([], STAGE_IDS, STAGE_IDS[0]!), STAGE_IDS[0]!)).toEqual({
      kind: "stage",
      stageId: STAGE_IDS[0],
    });
    expect(mapLanding(deriveProgress([], STAGE_IDS, STAGE_IDS[2]!), STAGE_IDS[2]!)).toEqual({
      kind: "stage",
      stageId: STAGE_IDS[2],
    });
  });

  it("覚えているステージが地図に無ければ、はじめての学習者と同じ", () => {
    expect(
      mapLanding(deriveProgress([], STAGE_IDS, "けしたステージ"), "けしたステージ"),
    ).toBeNull();
  });

  it("とばした学習者は、いちばん先のクリアの つぎへ下りる", () => {
    const progress = deriveProgress([STAGE_IDS[0]!, STAGE_IDS[3]!], STAGE_IDS);
    expect(mapLanding(progress, null)).toEqual({ kind: "stage", stageId: STAGE_IDS[4] });
  });

  it("ぜんぶクリアならゴールへ", () => {
    expect(mapLanding(deriveProgress(STAGE_IDS, STAGE_IDS), null)).toEqual({ kind: "goal" });
  });

  it("ステージが1つも無ければ下りない", () => {
    expect(mapLanding(deriveProgress([], []), null)).toBeNull();
  });
});

describe("mapLanding（最後に 開いた ステージ・2026-09-30 の 指定）", () => {
  const opened = (stageId: string | null) => ({ stageId, stageIds: STAGE_IDS });

  it("先まで進んでいても、最後に開いたステージへ下りる（報告を開いて戻ったら報告）", () => {
    // s1〜s4 クリア済み・いま ここ は s5。s2 を 開いて 戻って きた
    const progress = deriveProgress(STAGE_IDS.slice(0, 4), STAGE_IDS);
    expect(mapLanding(progress, null, opened(STAGE_IDS[1]!))).toEqual({
      kind: "stage",
      stageId: STAGE_IDS[1],
    });
  });

  it("学習中のステージと食い違っても、最後に開いたほうへ下りる（いま ここ は動かない）", () => {
    const progress = deriveProgress(STAGE_IDS.slice(0, 2), STAGE_IDS, STAGE_IDS[3]!);
    expect(progress.currentStageId).toBe(STAGE_IDS[3]);
    expect(mapLanding(progress, STAGE_IDS[3]!, opened(STAGE_IDS[0]!))).toEqual({
      kind: "stage",
      stageId: STAGE_IDS[0],
    });
  });

  it("はじめての学習者でも、開いたステージがあればそこへ下りる", () => {
    expect(mapLanding(deriveProgress([], STAGE_IDS), null, opened(STAGE_IDS[0]!))).toEqual({
      kind: "stage",
      stageId: STAGE_IDS[0],
    });
  });

  it("ぜんぶクリアでも、見直しに開いたステージへ下りる（ゴールへ飛ばさない）", () => {
    expect(mapLanding(deriveProgress(STAGE_IDS, STAGE_IDS), null, opened(STAGE_IDS[2]!))).toEqual({
      kind: "stage",
      stageId: STAGE_IDS[2],
    });
  });

  it("最後に開いたステージが無い・地図に無ければ、いままでどおり いま ここ へ", () => {
    const progress = deriveProgress(STAGE_IDS.slice(0, 2), STAGE_IDS);
    const current = { kind: "stage", stageId: STAGE_IDS[2] };
    expect(mapLanding(progress, null, opened("けしたステージ"))).toEqual(current);
    expect(mapLanding(progress, null, opened(null))).toEqual(current);
    expect(mapLanding(deriveProgress([], STAGE_IDS), null, opened("けしたステージ"))).toBeNull();
  });
});

describe("mapInitialPanel（はじめから 開いて おく パネル）", () => {
  it("下りた先のステージのパネルを開く（いま ここ でなくても）", () => {
    const progress = deriveProgress(STAGE_IDS.slice(0, 4), STAGE_IDS);
    const landing = mapLanding(progress, null, { stageId: STAGE_IDS[1]!, stageIds: STAGE_IDS });
    expect(mapInitialPanel(landing, progress)).toBe(STAGE_IDS[1]);
  });

  it("はじめての学習者（下りない）は いま ここ のパネル", () => {
    const progress = deriveProgress([], STAGE_IDS);
    expect(mapInitialPanel(mapLanding(progress, null), progress)).toBe(STAGE_IDS[0]);
  });

  it("ゴールへ下りたときは開くパネルが無い", () => {
    const progress = deriveProgress(STAGE_IDS, STAGE_IDS);
    expect(mapInitialPanel(mapLanding(progress, null), progress)).toBeNull();
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
