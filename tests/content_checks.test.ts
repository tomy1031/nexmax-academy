import { describe, expect, it } from "vitest";
import {
  checkDanglingRefs,
  checkDuplicateIds,
  checkReferenceIntegrity,
  checkStageSteps,
  type ContentEntry,
} from "../src/lib/content-checks";
import { ROUTE_AREAS } from "../src/content/areas";
import { contentSchema, type Content, type Stage } from "../src/content/schema";

/**
 * 検収の機械検査（設計07 §2）。
 * ここが素通しすると、先生は「保存できた」と思ったまま壊れた教材を公開してしまう。
 */

function parse(raw: unknown): Content {
  const result = contentSchema.safeParse(raw);
  if (!result.success) throw new Error(`fixture が壊れている: ${result.error.message}`);
  return result.data;
}

function stage(over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "stage",
    id: "s1",
    step: 1,
    title: "テスト",
    reading: "てすと",
    description: "てすとの ステージ",
    color: "leaf",
    status: "published",
    contents: [{ ref: "m1", type: "manga" }],
    wordStageIds: [],
    ...over,
  });
}

function manga(over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "manga",
    id: "m1",
    format: "yonkoma",
    title: "まんが",
    description: "てすとの まんが",
    pages: [{ panels: [{ lines: [] }] }],
    ...over,
  });
}

function article(blocks: unknown[], over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "article",
    id: "a1",
    title: "よみもの",
    description: "てすとの よみもの",
    blocks,
    ...over,
  });
}

const entry = (content: Content, file = `${content.id}.json`): ContentEntry => ({ file, content });

describe("ID重複の検査", () => {
  it("種別がちがっても同じIDなら弾く（進捗キーとDB主キーが種別を持たないため）", () => {
    const findings = checkDuplicateIds([
      entry(stage({ id: "same" }), "stage.json"),
      entry(manga({ id: "same" }), "manga.json"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
    expect(findings[0]?.message).toContain("種別をまたいで一意");
  });

  it("同じ種別の重複も従来どおり弾く", () => {
    const findings = checkDuplicateIds([
      entry(manga({ id: "dup" }), "a.json"),
      entry(manga({ id: "dup" }), "b.json"),
    ]);
    expect(findings).toHaveLength(1);
  });

  it("IDが全部ちがえば何も出ない", () => {
    expect(checkDuplicateIds([entry(stage()), entry(manga())])).toEqual([]);
  });
});

describe("マップの停留所とステージの結びつき", () => {
  /** 既定のエリアより先の step。ここから先は自分で土地（area）を決める必要がある。 */
  const BEYOND_SEEDS = ROUTE_AREAS.length + 1;

  /** マップの土地（景色の名前・絵・一言）。国名を入れない。 */
  const area = {
    name: "しごとの しま",
    reading: "しごとの しま",
    image: "/img/scenes/area_office_island.webp",
    note: "あたらしい しごとの しま。",
  };

  it("公開ステージの step が重なったら弾く（片方がたどり着けなくなる）", () => {
    const findings = checkStageSteps([
      entry(stage({ id: "s1", step: 2 }), "s1.json"),
      entry(stage({ id: "s2", step: 2 }), "s2.json"),
    ]);
    expect(findings.some((f) => f.level === "error" && f.message.includes("step 2"))).toBe(true);
  });

  it("既定のエリアより先で area が無いステージは、決め方まで書いて警告する", () => {
    const findings = checkStageSteps([entry(stage({ id: "far", step: BEYOND_SEEDS }), "far.json")]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("warn");
    // 直し方が書いていないと、先生は step を戻して教材を引っこめるしかないと思ってしまう
    expect(findings[0]?.message).toContain("スタジオ");
    expect(findings[0]?.message).toContain("Codex");
  });

  it("area が無くても「たどり着けない」とは言わない（ステージは出るので、消えると書くと先生が公開を取り下げる）", () => {
    const findings = checkStageSteps([entry(stage({ id: "far", step: BEYOND_SEEDS }), "far.json")]);
    expect(findings[0]?.message).not.toContain("たどり着けない");
    expect(findings[0]?.message).toContain("空色の帯");
  });

  it("area を決めれば既定より先でも何も出ない — スタジオだけでステージを足せる", () => {
    expect(
      checkStageSteps([entry(stage({ id: "far", step: BEYOND_SEEDS }), "far.json")]),
    ).toHaveLength(1);
    expect(
      checkStageSteps([entry(stage({ id: "far", step: BEYOND_SEEDS, area }), "far.json")]),
    ).toEqual([]);
  });

  it("既定のエリアの範囲なら area が無くても何も出ない", () => {
    const findings = checkStageSteps([
      entry(stage({ id: "last", step: ROUTE_AREAS.length }), "last.json"),
    ]);
    expect(findings).toEqual([]);
  });

  it("下書きは検査しない（作りかけの step 重複で止めない）", () => {
    const findings = checkStageSteps([
      entry(stage({ id: "s1", step: 2 }), "s1.json"),
      entry(stage({ id: "s2", step: 2, status: "draft" }), "s2.json"),
    ]);
    expect(findings).toEqual([]);
  });
});

describe("参照整合の検査", () => {
  const link = (ref: string, type: string) => ({
    kind: "link",
    ref,
    type,
    label: "つぎは これ",
  });

  it("記事の link 先が無ければ弾く（タップ先が404になる）", () => {
    const findings = checkReferenceIntegrity([entry(article([link("nope", "quizset")]), "a.json")]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("nope");
    expect(findings[0]?.message).toContain("404");
  });

  it("link 先が実在すれば通す", () => {
    const findings = checkReferenceIntegrity([
      entry(article([link("m1", "manga")]), "a.json"),
      entry(manga()),
    ]);
    expect(findings).toEqual([]);
  });

  it("種別違いは参照切れとして扱う（idだけ合っていても行き先が別）", () => {
    const findings = checkReferenceIntegrity([
      entry(article([link("m1", "quizset")]), "a.json"),
      entry(manga()),
    ]);
    expect(findings).toHaveLength(1);
  });

  it("ステージの参照切れは従来どおり弾く", () => {
    const findings = checkReferenceIntegrity([entry(stage())]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("m1");
  });
});

describe("保存するときの参照切れ（スタジオの保存経路）", () => {
  /** stage() は Content を返すので、ステージ1件を受け取る検査に渡せる形に絞る。 */
  const asStage = (content: Content): Stage => {
    if (content.kind !== "stage") throw new Error("fixture が stage ではない");
    return content;
  };
  const known = (...ids: string[]): ReadonlySet<string> => new Set(ids);

  it("contents の参照先がまだ無いIDなら1件しらせる", () => {
    const findings = checkDanglingRefs(asStage(stage()), known());
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("m1");
  });

  it("wordStageIds のまだ無いIDもしらせる", () => {
    const findings = checkDanglingRefs(asStage(stage({ wordStageIds: ["w1"] })), known("m1"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("w1");
  });

  it("参照先がぜんぶそろっていれば何も出ない", () => {
    const target = asStage(stage({ wordStageIds: ["w1"] }));
    expect(checkDanglingRefs(target, known("m1", "w1"))).toEqual([]);
  });

  it("level は必ず warn（error にすると、先に枠だけ作ったステージを保存できなくなる）", () => {
    const findings = checkDanglingRefs(asStage(stage({ wordStageIds: ["w1"] })), known());
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.level === "warn")).toBe(true);
    expect(findings.some((f) => f.level === "error")).toBe(false);
  });
});
