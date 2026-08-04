import { describe, expect, it } from "vitest";
import {
  checkDuplicateIds,
  checkReferenceIntegrity,
  checkStageSteps,
  MAP_STOP_COUNT,
  type ContentEntry,
} from "../src/lib/content-checks";
import { contentSchema, type Content } from "../src/content/schema";

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
  it("公開ステージの step が重なったら弾く（片方がたどり着けなくなる）", () => {
    const findings = checkStageSteps([
      entry(stage({ id: "s1", step: 2 }), "s1.json"),
      entry(stage({ id: "s2", step: 2 }), "s2.json"),
    ]);
    expect(findings.some((f) => f.level === "error" && f.message.includes("step 2"))).toBe(true);
  });

  it("停留所の数を超える step は警告する（公開してもマップから行けない）", () => {
    const findings = checkStageSteps([
      entry(stage({ id: "far", step: MAP_STOP_COUNT + 1 }), "far.json"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("warn");
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
