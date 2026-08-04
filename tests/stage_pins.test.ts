import { describe, expect, it } from "vitest";
import type { Stage } from "@/content/schema";
import type { StageDefinition } from "@/content/stages";
import { toStagePins } from "@/lib/stage-pins";

/** 定番ステージ（src/content/stages.ts と同じ形）を1件作る。 */
const seed = (over: Partial<StageDefinition> & { id: string; step: number }): StageDefinition => ({
  title: "報告",
  reading: "ほうこく",
  description: "ほうこくを ペアで れんしゅうします。",
  kind: "pair",
  kindLabel: "ペアワーク",
  color: "coral",
  ...over,
});

/** データ化ステージ（content/stages/*.json と同じ形）を1件作る。 */
const stage = (over: Partial<Stage> & { id: string; step: number }): Stage => ({
  kind: "stage",
  title: "朝会",
  reading: "あさかい",
  description: "あさかいの ながれを まなびます。",
  color: "sky",
  status: "published",
  contents: [{ ref: "m2-asakai-manga", type: "manga" }],
  wordStageIds: [],
  ...over,
});

describe("toStagePins", () => {
  it("同じ step ならデータ側の見出し・説明・色が勝つ（スタジオの修正が画面に出る）", () => {
    const pins = toStagePins(
      [seed({ id: "report", step: 3 })],
      [stage({ id: "m2-asakai", step: 3, title: "朝会に でる", color: "leaf" })],
    );

    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({
      id: "m2-asakai",
      step: 3,
      title: "朝会に でる",
      description: "あさかいの ながれを まなびます。",
      color: "leaf",
    });
  });

  it("データ化されていれば /stage/:id、まだなら null（じゅんびちゅう）", () => {
    const pins = toStagePins(
      [seed({ id: "it-words", step: 1 }), seed({ id: "report", step: 3 })],
      [stage({ id: "m2-asakai", step: 3 })],
    );

    expect(pins.map((pin) => pin.href)).toEqual([null, "/stage/m2-asakai"]);
  });

  it("定番にしか無い step も残る（データ化前の停留所が消えない）", () => {
    const pins = toStagePins(
      [seed({ id: "it-words", step: 1 }), seed({ id: "contact", step: 4 })],
      [stage({ id: "m2-asakai", step: 1 })],
    );

    expect(pins.map((pin) => pin.step)).toEqual([1, 4]);
    expect(pins[1]).toMatchObject({ id: "contact", title: "報告", href: null, kinds: [] });
  });

  it("定番に無い step のデータ化ステージが新しいピンになる（教材を足せば停留所が増える）", () => {
    const pins = toStagePins(
      [seed({ id: "consult", step: 5 })],
      [stage({ id: "m3-nissou", step: 6, title: "日報" })],
    );

    expect(pins.map((pin) => pin.step)).toEqual([5, 6]);
    expect(pins[1]).toMatchObject({
      id: "m3-nissou",
      title: "日報",
      href: "/stage/m3-nissou",
      seedId: null,
      seedKind: null,
    });
  });

  it("並び順は step 昇順（入力の順番に引きずられない）", () => {
    const pins = toStagePins(
      [seed({ id: "consult", step: 5 }), seed({ id: "it-words", step: 1 })],
      [stage({ id: "m3-nissou", step: 6 }), stage({ id: "m2-asakai", step: 3 })],
    );

    expect(pins.map((pin) => pin.step)).toEqual([1, 3, 5, 6]);
  });

  it("kinds は contents の種別を学習順・重複なしで拾う", () => {
    const pins = toStagePins(
      [],
      [
        stage({
          id: "m2-asakai",
          step: 2,
          contents: [
            { ref: "m2-asakai-manga", type: "manga" },
            { ref: "m2-asakai-article", type: "article" },
            { ref: "m2-asakai-manga2", type: "manga" },
            { ref: "m2-asakai-quiz", type: "quizset" },
          ],
        }),
      ],
    );

    expect(pins[0]?.kinds).toEqual(["manga", "article", "quizset"]);
  });

  it("seedId・seedKind は同じ step に定番ステージがあるときだけ入る（ルビ見出しの鍵）", () => {
    const pins = toStagePins(
      [seed({ id: "report", step: 3 })],
      [stage({ id: "m2-asakai", step: 3 }), stage({ id: "m3-nissou", step: 6 })],
    );

    expect(pins[0]).toMatchObject({ seedId: "report", seedKind: "pair" });
    expect(pins[1]).toMatchObject({ seedId: null, seedKind: null });
  });
});
