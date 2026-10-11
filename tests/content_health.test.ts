import { describe, expect, it } from "vitest";
import { CONTENT_REF_TYPES, contentSchema } from "../src/content/schema";
import { buildContentHealth, HEALTH_CONTENT_KINDS } from "../src/lib/content-health";

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

/*
 * 教材の 並びにも 同じ 事故が 起きる（2026-08-27）。
 *
 * 「会社を知る」の ステージは DBに 保存ずみ だった。git に ページを 1本 足しても
 * **学習者の 画面には 出ない**し、git から 教材を 消すと DBの 版だけが それを
 * 指したまま 残って **ステージの 途中で 404**に なる。ことばセットの ときと 同じで、
 * git も DBも 壊れて おらず、検査は ぜんぶ 緑——印を ここで 出す。
 */
describe("教材の 並びの 健康しらべ", () => {
  it("DBの 版が gitの 教材を 隠して いたら 名指しする", () => {
    const health = buildContentHealth({
      gitStages: [
        {
          id: "kaisha",
          contents: [
            { ref: "kaisha_shirabekata", type: "article" },
            { ref: "kaisha_matsui_junbi", type: "article" },
          ],
        },
      ],
      liveStages: [{ id: "kaisha", contents: [{ ref: "kaisha_shirabekata", type: "article" }] }],
      liveWordStages: [],
      dbPublishedIds: new Set(["stage:kaisha"]),
      liveContentIds: new Set(["article:kaisha_shirabekata"]),
    });

    expect(health.stages[0]?.hiddenContents).toEqual(["article:kaisha_matsui_junbi"]);
    expect(health.warnings.join(" ")).toContain("kaisha_matsui_junbi");
  });

  it("指した 先が 無い 教材も 名指しする（開くと 404）", () => {
    const health = buildContentHealth({
      gitStages: [{ id: "kaisha", contents: [] }],
      liveStages: [{ id: "kaisha", contents: [{ ref: "kaisha_jibun", type: "quizset" }] }],
      liveWordStages: [],
      dbPublishedIds: new Set(["stage:kaisha"]),
      liveContentIds: new Set(),
    });

    expect(health.stages[0]?.missingContents).toEqual(["quizset:kaisha_jibun"]);
    expect(health.warnings.join(" ")).toContain("404");
  });

  it("gitが 出て いる ステージでは 隠しの しるしを 出さない", () => {
    const health = buildContentHealth({
      gitStages: [{ id: "intro", contents: [{ ref: "a", type: "article" }] }],
      liveStages: [{ id: "intro", contents: [{ ref: "a", type: "article" }] }],
      liveWordStages: [],
      dbPublishedIds: new Set(),
      liveContentIds: new Set(["article:a"]),
    });

    expect(health.stages[0]?.hiddenContents).toEqual([]);
    expect(health.warnings).toEqual([]);
  });

  it("種別が ちがえば 別の 教材（同じ id でも 混ぜない）", () => {
    const health = buildContentHealth({
      gitStages: [{ id: "s", contents: [] }],
      liveStages: [{ id: "s", contents: [{ ref: "same", type: "quizset" }] }],
      liveWordStages: [],
      dbPublishedIds: new Set(["stage:s"]),
      liveContentIds: new Set(["article:same"]),
    });

    expect(health.stages[0]?.missingContents).toEqual(["quizset:same"]);
  });
});

/*
 * しらべる 種別の もれ（2026-10-11）。
 *
 * `/api/health/content` の 種別から `quest` が 抜けて いて、本番で ちゃんと 出て いる
 * `quest:waterfall_quest`（開発の ステージ）を 「見つからない・404に なる」と 警告し 続けて いた。
 * 抜けた 種別の 教材は ぜんぶ 「無い」に 数えられ、「`warnings` が 空なら 健康」が
 * 当てに ならなく なる。種別を 足した ときに ここで 落とす。
 */
describe("しらべる 種別の もれ", () => {
  it("ステージの contents[].type に 入りうる 種別を ぜんぶ、1回ずつ 数える", () => {
    expect([...HEALTH_CONTENT_KINDS].sort()).toEqual([...CONTENT_REF_TYPES].sort());
    expect(new Set(HEALTH_CONTENT_KINDS).size).toBe(HEALTH_CONTENT_KINDS.length);
  });

  it("教材の 種別（contentSchema の kind）が 増えたら、数えるか 外すかを 決めさせる", () => {
    /*
     * ステージの 並びに 置かない 種別だけを 名指しで 外す。新しい 種別を
     * contentSchema に 足すと ここが 落ちる——数える なら `CONTENT_REF_TYPES` と
     * `HEALTH_CONTENT_KINDS` へ、置かない なら この 一覧へ 足す。
     */
    const NOT_IN_STAGE = ["stage", "vocab", "character"];
    const kinds = contentSchema.options.map((option) => option.shape.kind.value as string);
    const expected = kinds.filter((kind) => !NOT_IN_STAGE.includes(kind));
    expect([...HEALTH_CONTENT_KINDS].sort()).toEqual(expected.sort());
  });
});
