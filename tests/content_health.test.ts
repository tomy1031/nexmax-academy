import { describe, expect, it } from "vitest";
import { buildContentHealth } from "../src/lib/content-health";

/**
 * DBの 古い 版が gitの 教材を 隠して いないか（2026-08-26 の 事故）
 *
 * 実際に 起きた かたち: スタジオで 保存した ステージ行が DBに 残り、
 * その `wordStageIds` が 保存時の 1本の まま。git に 3本 書いても
 * **DBが 勝つ** ので 学習者には 1本しか 出ない。git も DBも 壊れて いないので、
 * 検査は ぜんぶ 緑に なる——だから ここで 名指しする。
 */
describe("教材の 健康しらべ", () => {
  const gitStages = [
    { id: "kaisha", wordStageIds: ["shokyu", "chukyu", "jokyu"] },
    { id: "hajimari", wordStageIds: [] },
  ];
  const liveWordStages = [
    { id: "shokyu", words: new Array(50), questionCount: 50 },
    { id: "chukyu", words: new Array(60), questionCount: 60 },
    { id: "jokyu", words: new Array(24), questionCount: 24 },
  ];

  it("DBの 版が セットを 隠していたら 警告する", () => {
    const health = buildContentHealth({
      gitStages,
      liveStages: [
        { id: "kaisha", wordStageIds: ["shokyu"] },
        { id: "hajimari", wordStageIds: [] },
      ],
      liveWordStages,
      dbPublishedIds: new Set(["stage:kaisha"]),
    });

    const kaisha = health.stages.find((s) => s.id === "kaisha")!;
    expect(kaisha.source).toBe("db");
    expect(kaisha.hiddenByDb).toEqual(["chukyu", "jokyu"]);
    expect(health.warnings.join("\n")).toContain("stage:kaisha");
    expect(health.warnings.join("\n")).toContain("2本");
  });

  it("そろっていれば 警告は 出ない", () => {
    const health = buildContentHealth({
      gitStages,
      liveStages: [
        { id: "kaisha", wordStageIds: ["shokyu", "chukyu", "jokyu"] },
        { id: "hajimari", wordStageIds: [] },
      ],
      liveWordStages,
      dbPublishedIds: new Set(["stage:kaisha"]),
    });
    expect(health.warnings).toEqual([]);
    expect(health.stages.find((s) => s.id === "kaisha")!.hiddenByDb).toEqual([]);
  });

  it("参照の 先が 落ちていたら 名指しする（語が 引けずに 消えた セット）", () => {
    const health = buildContentHealth({
      gitStages,
      liveStages: [{ id: "kaisha", wordStageIds: ["shokyu", "chukyu", "jokyu"] }],
      liveWordStages: [{ id: "shokyu", words: new Array(50), questionCount: 50 }],
      dbPublishedIds: new Set(),
    });
    expect(health.stages[0]!.missing).toEqual(["chukyu", "jokyu"]);
    expect(health.warnings.join("\n")).toContain("見つからない");
  });

  it("出題数が 語数を 超えていたら 警告する", () => {
    const health = buildContentHealth({
      gitStages: [],
      liveStages: [],
      liveWordStages: [{ id: "shokyu", words: new Array(8), questionCount: 20 }],
      dbPublishedIds: new Set(),
    });
    expect(health.warnings.join("\n")).toContain("出題数");
  });
});
