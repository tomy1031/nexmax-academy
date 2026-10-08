import { describe, expect, it } from "vitest";
import { gateStage } from "@/components/stage/stage-progress";
import {
  NO_HIDDEN,
  contentVisibilityKey,
  parseGroupVisibility,
  visibleContents,
  visibleFrame,
  visibleMapAreas,
  visibleMapStages,
  type GroupVisibility,
} from "@/lib/group-visibility";

/**
 * 組（大学 × 期生）ごとの 表示／非表示（`src/lib/group-visibility.ts`・願い #589）
 *
 * 2026-10-08 の 指定:「デフォルトはどの学校のどの期も同じ表示状態からスタート」
 * 「場合によって非表示にしたりするものもあって欲しい」。ここが 壊れると:
 * - 隠した 関門の 前で 学習者が 止まる（「おわると つぎへ」が 消えない）
 * - 隠した ステージが 地図に 残る／隠して いない ものが 消える
 */

const HIDE: GroupVisibility = {
  hiddenStages: ["soudan"],
  hiddenContents: [contentVisibilityKey("houkoku", "houkoku_quiz")],
};

const ITEMS = [{ id: "houkoku_lecture" }, { id: "houkoku_quiz" }, { id: "houkoku_bug_quiz" }];

describe("既定は 全部 見える", () => {
  it("隠す もの が 無ければ 何も 抜かない", () => {
    expect(visibleContents(ITEMS, "houkoku", NO_HIDDEN)).toEqual(ITEMS);
    expect(visibleFrame(ITEMS, 1, "houkoku", NO_HIDDEN)).toEqual({ items: ITEMS, currentIndex: 1 });
  });

  it("壊れた 保存値は 読まない（何も 隠さない 側へ）", () => {
    expect(parseGroupVisibility("壊れた")).toBeNull();
    expect(parseGroupVisibility(JSON.stringify({ hiddenStages: ["a"] }))).toBeNull();
    expect(parseGroupVisibility(null)).toBeNull();
  });
});

describe("教材を 隠す", () => {
  it("ステージの トップから 抜く（順は 変えない）", () => {
    expect(visibleContents(ITEMS, "houkoku", HIDE).map((one) => one.id)).toEqual([
      "houkoku_lecture",
      "houkoku_bug_quiz",
    ]);
  });

  it("ほかの ステージに 入って いる 同じ 教材は 隠さない（ステージと 組で 持つ）", () => {
    expect(visibleContents(ITEMS, "renraku", HIDE)).toEqual(ITEMS);
  });

  it("隠した 関門の 前で 止まらない（関門は 見える 教材だけで 数える）", () => {
    // 1本目は おわった・隠した 2本目は まだ・3本目を 開いた
    const { items, currentIndex } = visibleFrame(ITEMS, 2, "houkoku", HIDE);
    expect(items.map((one) => one.id)).toEqual(["houkoku_lecture", "houkoku_bug_quiz"]);
    expect(currentIndex).toBe(1);
    const gating = gateStage(["2", "0"], [true, true]);
    expect(gating.openable[currentIndex]).toBe(true);
  });

  it("いま 開いて いる 教材は 隠して いても 残す（URL を 直接 開いた とき）", () => {
    const { items, currentIndex } = visibleFrame(ITEMS, 1, "houkoku", HIDE);
    expect(items.map((one) => one.id)).toEqual([
      "houkoku_lecture",
      "houkoku_quiz",
      "houkoku_bug_quiz",
    ]);
    expect(currentIndex).toBe(1);
  });
});

describe("ステージを 隠す（地図）", () => {
  const stages = [
    {
      id: "houkoku",
      number: 4,
      kinds: ["article", "quizset"],
      contents: [
        { id: "houkoku_lecture", type: "article" },
        { id: "houkoku_quiz", type: "quizset" },
      ],
    },
    { id: "soudan", number: 7, kinds: ["article"], contents: [{ id: "s1", type: "article" }] },
  ];

  it("隠した ステージを 抜き、番号は 付け直さない", () => {
    const shown = visibleMapStages(stages, HIDE);
    expect(shown.map((one) => one.id)).toEqual(["houkoku"]);
    expect(shown[0]?.number).toBe(4);
  });

  it("中の 教材も 抜き、種類の 札を 出し直す", () => {
    const shown = visibleMapStages(stages, HIDE);
    expect(shown[0]?.contents.map((one) => one.id)).toEqual(["houkoku_lecture"]);
    expect(shown[0]?.kinds).toEqual(["article"]);
  });

  it("道のりの エリアも 抜く（ゴールは 残す）", () => {
    const areas = [{ stageId: "houkoku" }, { stageId: "soudan" }, { stageId: null }];
    expect(visibleMapAreas(areas, HIDE)).toEqual([{ stageId: "houkoku" }, { stageId: null }]);
  });
});
