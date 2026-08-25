import { describe, expect, it } from "vitest";
import { contentSchema, type Stage } from "../src/content/schema";
import {
  isOnMap,
  mapListedStages,
  mapStageActions,
  sortStages,
  stageStepNumber,
  toMapAreas,
  toMapStages,
  type MapStage,
} from "../src/lib/map-data";

/**
 * マップの中身＝公開ステージそのもの。
 *
 * コードに書いた既定の停留所はもう持たない。ここが崩れると、先生が作った
 * ステージが地図に出ない／消したステージが地図に残る。どちらも学習者から見ると
 * 教材が行方不明になる。
 */

function stage(over: Record<string, unknown> = {}): Stage {
  const parsed = contentSchema.safeParse({
    kind: "stage",
    id: "studio-stage",
    order: 3,
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

describe("sortStages", () => {
  it("order の昇順に並ぶ（マップは上から この順に積む）", () => {
    const sorted = sortStages([
      stage({ id: "c", order: 9 }),
      stage({ id: "a", order: 1 }),
      stage({ id: "b", order: 5 }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("order が同じでも並びが揺れない（ID順で決まる）", () => {
    const input = [stage({ id: "z", order: 2 }), stage({ id: "a", order: 2 })];
    expect(sortStages(input).map((item) => item.id)).toEqual(["a", "z"]);
    expect(sortStages([...input].reverse()).map((item) => item.id)).toEqual(["a", "z"]);
  });

  it("もとの配列を書きかえない", () => {
    const input = [stage({ id: "b", order: 2 }), stage({ id: "a", order: 1 })];
    sortStages(input);
    expect(input.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

/**
 * 「地図に出す」は「完成している」とは別の問い。
 *
 * 「はじめに」のような案内は、完成していても地図には出さず、URLで配る。ここが
 * 崩れると、案内が学習の道すじに割り込むか（出しすぎ）、先生が配ったリンクの先が
 * 消える（出さなすぎ）。
 */
describe("isOnMap / mapListedStages", () => {
  it("既定では地図に出る（listed を書かない既存のステージが消えない）", () => {
    expect(isOnMap(stage())).toBe(true);
  });

  it("したがきは 地図に出ない", () => {
    expect(isOnMap(stage({ status: "draft" }))).toBe(false);
  });

  it("こうかいしていても listed:false なら 地図に出ない", () => {
    expect(isOnMap(stage({ status: "published", listed: false }))).toBe(false);
  });

  it("地図に並ぶのは 出す指定のものだけ", () => {
    const stages = [
      stage({ id: "guide", order: 1, listed: false }),
      stage({ id: "a", order: 2 }),
      stage({ id: "b", order: 3 }),
    ];
    expect(mapListedStages(stages).map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("stageStepNumber", () => {
  it("地図の上から数えた番号（地図に出ないステージは 数に入らない）", () => {
    const stages = [
      stage({ id: "guide", order: 1, listed: false }),
      stage({ id: "a", order: 2 }),
      stage({ id: "b", order: 3 }),
    ];
    expect(stageStepNumber(stages, "a")).toBe(1);
    expect(stageStepNumber(stages, "b")).toBe(2);
  });

  it("地図に出ないステージは null（1 に倒さない）", () => {
    // 1 に倒すと、案内のページが 本物の STEP 01 と同じ札を出す。
    const stages = [stage({ id: "guide", order: 1, listed: false }), stage({ id: "a", order: 2 })];
    expect(stageStepNumber(stages, "guide")).toBeNull();
  });

  it("知らないIDも null", () => {
    expect(stageStepNumber([stage({ id: "a" })], "nowhere")).toBeNull();
  });
});

describe("toMapStages", () => {
  it("ステージが1つも無ければ 停留所も0（既定の飾りは出さない）", () => {
    expect(toMapStages([])).toEqual([]);
  });

  it("STEP番号は order ではなく 上から数えた位置（order は飛び番になりうる）", () => {
    const mapStages = toMapStages([stage({ id: "a", order: 1 }), stage({ id: "b", order: 30 })]);
    expect(mapStages.map((item) => item.number)).toEqual([1, 2]);
  });

  it("中に入っている教材の種別を そのまま持つ（ラベルを別に持たない）", () => {
    const [mapStage] = toMapStages([
      stage({
        contents: [
          { ref: "m", type: "manga" },
          { ref: "q", type: "quizset" },
        ],
      }),
    ]);
    expect(mapStage?.kinds).toEqual(["manga", "quizset"]);
  });

  it("同じ種別が2つあっても しるしは1つ", () => {
    const [mapStage] = toMapStages([
      stage({
        contents: [
          { ref: "a", type: "listening" },
          { ref: "b", type: "listening" },
        ],
      }),
    ]);
    expect(mapStage?.kinds).toEqual(["listening"]);
  });
});

describe("toMapAreas", () => {
  it("ステージ1つにつきエリア1つ（1ステージ＝1エリア）", () => {
    const stages = [stage({ id: "a", order: 1, area: AREA }), stage({ id: "b", order: 2 })];
    expect(toMapAreas(stages)).toHaveLength(stages.length);
  });

  it("area を決めると、その土地の名前と絵になる", () => {
    const [area] = toMapAreas([stage({ id: "a", area: AREA })]);
    expect(area?.name).toBe(AREA.name);
    expect(area?.image).toBe(AREA.image);
    expect(area?.note).toBe(AREA.note);
  });

  it("area が無くてもエリアは消えない（絵は空のまま出す）", () => {
    // 絵の用意が遅れただけでステージが消えると、学習者は昨日あった教材を探しまわる。
    const [area] = toMapAreas([stage({ id: "studio-new" })]);
    expect(area?.stageId).toBe("studio-new");
    expect(area?.image).toBe("");
    // 名前が空だと札が消えるので、ステージの見出しで代わりにする
    expect(area?.name).toBe("スタジオの ステージ");
  });

  it("エリアのIDは重複しない（React の key と aria-label に使うため）", () => {
    const areas = toMapAreas([
      stage({ id: "a", order: 1, area: AREA }),
      stage({ id: "b", order: 2, area: AREA }),
    ]);
    expect(new Set(areas.map((item) => item.id)).size).toBe(areas.length);
  });

  it("エリアの stageId は、その位置のステージを必ず指す", () => {
    // ここがずれると、ピンが別のステージの土地の上に立つ。
    const stages = [
      stage({ id: "b", order: 20 }),
      stage({ id: "a", order: 10, area: AREA }),
      stage({ id: "c", order: 30 }),
    ];
    const mapStages = toMapStages(stages);
    toMapAreas(stages).forEach((area, index) => {
      expect(area.stageId).toBe(mapStages[index]!.id);
    });
  });
});

/**
 * ステージカードの札 — 出す／出さない と 行き先
 *
 * マップは**ログインの内側**にあり、鍵ゼロの通しの検証（Playwright）からは
 * `/welcome` へ送り返されて中身が見えない。だから札の判断はここで見張る。
 *
 * 2026-08-25 に直した2つ:
 *  - ことばを1つも持たないステージにも「単語を 勉強」の札が出て、押すと
 *    どの課のものか分からない一覧（`/arcade`）に放り出されていた
 *  - 「最初から」が1本目の教材へ直行し、何が何本あるのかを見せずに中へ入れていた
 */
describe("mapStageActions", () => {
  function mapStage(over: Record<string, unknown> = {}): MapStage {
    return toMapStages([
      stage({
        id: "hajimari",
        contents: [
          { ref: "m", type: "manga" },
          { ref: "q", type: "quizset" },
        ],
        ...over,
      }),
    ])[0]!;
  }

  it("ことばが ひもづいて いなければ 単語の札を 出さない", () => {
    expect(mapStageActions(mapStage({ wordStageIds: [] }), "00").wordsHref).toBeNull();
  });

  it("ひもづいて いれば その ステージの ことばへ 直行する", () => {
    const actions = mapStageActions(mapStage({ wordStageIds: ["hajimari_kotoba"] }), "00");
    expect(actions.wordsHref).toBe("/arcade/hajimari_kotoba");
  });

  it("「最初から」は ステージのトップ（1本目の教材を いきなり 開かない）", () => {
    const target = mapStage();
    const actions = mapStageActions(target, "20");
    expect(actions.restartHref).toBe("/hajimari");
    expect(actions.restartHref).not.toBe(target.contents[0]!.href);
  });

  it("まだ 1本目なら 「最初から」は 出さない（つづきからと 行き先が 重なる）", () => {
    expect(mapStageActions(mapStage(), "00").restartHref).toBeNull();
  });

  it("つづきは 最初の おわって いない 教材", () => {
    const actions = mapStageActions(mapStage(), "21");
    expect(actions.resumeIndex).toBe(1);
    expect(actions.resume?.id).toBe("q");
    expect(actions.allDone).toBe(false);
  });

  it("ぜんぶ おわったら 1本目から「もういちど」", () => {
    const actions = mapStageActions(mapStage(), "22");
    expect(actions.allDone).toBe(true);
    expect(actions.resumeIndex).toBe(0);
    expect(actions.resume?.id).toBe("m");
    expect(actions.restartHref).toBeNull();
  });

  it("教材が 1つも 無ければ 行き先も 無い（札は「ステージを ひらく」に 変わる）", () => {
    const empty: MapStage = { ...mapStage(), contents: [] };
    const actions = mapStageActions(empty, "");
    expect(actions.resume).toBeNull();
    expect(actions.allDone).toBe(false);
    expect(actions.restartHref).toBeNull();
  });
});
