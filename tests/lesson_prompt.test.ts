import { describe, expect, it } from "vitest";
import {
  ARTICLE_SCHEMA,
  buildArticlePrompt,
  buildLessonContext,
  buildQuizPrompt,
  MAX_CONTEXT_CHARS,
  quizSchemaFor,
} from "@/lib/lesson-prompt";
import { contentSchema, type Content } from "@/content/schema";

/**
 * もんだい と よみもの の 頼み文
 *
 * いちばん大事なのは**産出フェーズに選択式を作らせない**こと（規律3）。
 * 保存時の superRefine が落としてくれるが、落ちてから作り直すと
 * 先生は理由が分からないまま2回待つ。作らせない方が先。
 */

function parse(raw: unknown): Content {
  const result = contentSchema.safeParse(raw);
  if (!result.success) throw new Error(`fixture が壊れている: ${result.error.message}`);
  return result.data;
}

describe("もんだい — 産出フェーズに 選択式を 出さない（規律3）", () => {
  it("産出では 形から choose / multi / emotion が 消える", () => {
    const types = quizSchemaFor("production").properties.questions.items.properties.type.enum;
    expect(types).toEqual(["keyword", "wordbank"]);
  });

  it("読解確認では 5種類とも つかえる", () => {
    const types = quizSchemaFor("research").properties.questions.items.properties.type.enum;
    expect(types).toContain("choose");
    expect(types).toContain("emotion");
    expect(types).toHaveLength(5);
  });

  it("頼み文でも「選択式を 作らない」と はっきり 言う", () => {
    const prompt = buildQuizPrompt({
      request: "報告の れんしゅう",
      count: 5,
      phase: "production",
      context: "",
    });
    expect(prompt).toContain("選択式を 作らないでください");
    // 理由まで書く。理由の無い禁止は、言い換えられて破られる
    expect(prompt).toContain("言えるか");
  });

  it("読解確認では 選択式を すすめる", () => {
    const prompt = buildQuizPrompt({
      request: "朝会の 読みとり",
      count: 5,
      phase: "research",
      context: "",
    });
    expect(prompt).toContain("4択");
    expect(prompt).not.toContain("選択式を 作らないでください");
  });
});

describe("もんだい — 学習者に見える文の決まりを 毎回 書く", () => {
  const prompt = buildQuizPrompt({
    request: "報告",
    count: 3,
    phase: "research",
    context: "",
  });

  it.each([
    ["30字いない", "1文の長さ"],
    ["否定する 言い方を しない", "禁止語（規律1）"],
    ["1つ残らず", "ふりがな全覆い（規律2）"],
    ["国名", "規律9"],
  ])("%s を 書く（%s）", (needle) => {
    expect(prompt).toContain(needle);
  });

  it("ヒントは 答えを 言わない、を 言う", () => {
    expect(prompt).toContain("答えそのものを 言わない");
  });

  it("まちがいの 選択肢は まよう理由が あるもの、を 言う", () => {
    expect(prompt).toContain("まよう理由が あるもの");
  });
});

describe("よみもの", () => {
  const prompt = buildArticlePrompt({ request: "ほうれんそう", sections: 3, context: "" });

  it("行き先（link）は 作らせない（導線の検査が 必ず落ちるので）", () => {
    expect(prompt).toContain("行き先は 作らないでください");
    const kinds = ARTICLE_SCHEMA.properties.blocks.items.properties.kind.enum;
    expect(kinds).not.toContain("link");
  });

  it("しごとの ことばを かんたんな ことばに 置きかえない、を 言う", () => {
    expect(prompt).toContain("置きかえない");
    expect(prompt).toContain("要件定義");
  });

  it("見出しの 数が 入る", () => {
    expect(prompt).toContain("3つの 見出し");
  });

  it("画像ブロックは 作らせない（絵は あとで 1枚ずつ）", () => {
    const kinds = ARTICLE_SCHEMA.properties.blocks.items.properties.kind.enum;
    expect(kinds).not.toContain("image");
  });
});

describe("過去に 習った ことばを ふまえる", () => {
  const wordStage = parse({
    kind: "wordstage",
    id: "w1",
    title: "ことば",
    description: "てすと",
    fieldSequence: ["forest"],
    questionCount: 6,
    passRate: 70,
    words: Array.from({ length: 6 }, (_, i) => ({
      id: `w${i}`,
      term: `語${i}`,
      reading: "ご",
      meaningEn: `word ${i}`,
      wrongMeanings: ["a", "b", "c"],
      explanationJa: "せつめい",
      example: "れいぶん",
    })),
  });

  it("習った ことばを 並べる", () => {
    const context = buildLessonContext([wordStage]);
    expect(context).toContain("語0");
    expect(context).toContain("復習");
  });

  it("同じ ことばは 1回だけ", () => {
    const context = buildLessonContext([wordStage, wordStage]);
    expect(context.split("語0").length - 1).toBe(1);
  });

  it("単語ステージが 無ければ 空（頼み文に 空の見出しを 足さない）", () => {
    expect(buildLessonContext([])).toBe("");
  });

  it("長すぎたら 打ち切る", () => {
    const many = Array.from({ length: 40 }, (_, n) =>
      parse({
        kind: "wordstage",
        id: `w${n}`,
        title: "ことば",
        description: "てすと",
        fieldSequence: ["forest"],
        questionCount: 6,
        passRate: 70,
        words: Array.from({ length: 6 }, (_, i) => ({
          id: `w${n}_${i}`,
          term: `語${n}の${i}`,
          reading: "ご",
          meaningEn: "word",
          wrongMeanings: ["a", "b", "c"],
          explanationJa: "せつめい",
          example: "れいぶん",
        })),
      }),
    );
    const context = buildLessonContext(many);
    expect(context.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS + 20);
    expect(context).toContain("ここまで");
  });
});
