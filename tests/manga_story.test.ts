import { describe, expect, it } from "vitest";
import {
  buildLayoutPrompt,
  buildStoryContext,
  buildStoryPrompt,
  MAX_CONTEXT_CHARS,
  validateOutline,
  type StoryOutline,
} from "@/lib/manga-story";
import { contentSchema, type Content } from "@/content/schema";

/**
 * まんがを作る段どり
 *
 * 承認した骨組みが**そのまま**コマになることが要。
 * 言い換えられると、先生が承認したものと違うものが教材に入る。
 */

function parse(raw: unknown): Content {
  const result = contentSchema.safeParse(raw);
  if (!result.success) throw new Error(`fixture が壊れている: ${result.error.message}`);
  return result.data;
}

const CAST = [{ id: "hendy", name: "ヘンディ", role: "先輩", personality: "おだやか" }];

describe("段①→② そうだんから すじがきへ", () => {
  const prompt = buildStoryPrompt({
    request: "トラブルを 先輩に 報告する場面",
    panels: 4,
    cast: CAST,
    context: "",
  });

  it("セリフを まだ 書かせない（段を 分ける意味が なくなる）", () => {
    expect(prompt).toContain("セリフは まだ 書きません");
  });

  it("依頼と コマ数と 人物が 入る", () => {
    expect(prompt).toContain("トラブルを 先輩に 報告する場面");
    expect(prompt).toContain("4コマ");
    expect(prompt).toContain("ヘンディ");
  });

  it("学習者を 否定する話に しない、を 毎回 言う", () => {
    expect(prompt).toContain("否定する 話に しない");
  });
});

describe("過去の教材を ふまえる", () => {
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

  const manga = parse({
    kind: "manga",
    id: "m1",
    format: "yonkoma",
    title: "はじめての 朝会",
    description: "てすと",
    pages: [{ panels: [{ lines: [{ speaker: "narration", text: "よく できました。" }] }] }],
  });

  it("すでに 習った ことばを 集める", () => {
    const context = buildStoryContext([wordStage]);
    expect(context).toContain("語0");
    expect(context).toContain("すでに 習った ことば");
  });

  it("前の まんがの おわりを 集める（話が つながると 覚えやすい）", () => {
    const context = buildStoryContext([manga]);
    expect(context).toContain("はじめての 朝会");
    expect(context).toContain("よく できました。");
  });

  it("何も 無ければ 空（頼み文に 余計な 見出しを 足さない）", () => {
    expect(buildStoryContext([])).toBe("");
  });

  it("長くなりすぎたら 打ち切る（肝心の依頼が 薄まらないように）", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      parse({
        kind: "manga",
        id: `m${i}`,
        format: "yonkoma",
        title: `まんが${i}`,
        description: "てすと",
        pages: [{ panels: [{ lines: [{ speaker: "narration", text: "あ".repeat(60) }] }] }],
      }),
    );
    const context = buildStoryContext(many);
    expect(context.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS + 20);
    expect(context).toContain("ここまで");
  });

  it("同じ ことばは 1回だけ", () => {
    const context = buildStoryContext([wordStage, wordStage]);
    expect(context.split("語0").length - 1).toBe(1);
  });
});

describe("段②→③ 承認した骨組みを そのまま コマにする", () => {
  const outline: StoryOutline = {
    title: "先輩、教えてください",
    logline: "ニャムが 質問のしかたを 学ぶ。",
    teachingPoint: "試したことと 疑問点を みじかく つたえる。",
    beats: [
      { panel: 1, what: "作業が 止まる。", why: "質問が 要る場面を 見せる" },
      { panel: 2, what: "長く 説明する。", why: "きんちょうを 見せる" },
    ],
  };
  const prompt = buildLayoutPrompt({ outline, cast: CAST });

  it("骨組みを 変えるな、と はっきり 言う（承認の意味が なくなるので）", () => {
    expect(prompt).toContain("骨組みを 変えないでください");
    expect(prompt).toContain("言い換え");
  });

  it("承認ずみの beat が 逐語で 入る", () => {
    expect(prompt).toContain("作業が 止まる。");
    expect(prompt).toContain("長く 説明する。");
  });

  it("ねらいも 渡す（コマが ねらいから ずれないように）", () => {
    expect(prompt).toContain("試したことと 疑問点を みじかく つたえる。");
  });

  it("読み辞書を 1つ残らず、を 言う（規律2）", () => {
    expect(prompt).toContain("1つ残らず");
  });
});

describe("骨組みの 形を たしかめる", () => {
  const valid = {
    title: "あ",
    logline: "い",
    teachingPoint: "う",
    beats: [{ panel: 1, what: "え", why: "お" }],
  };

  it("そろっていれば 通す", () => {
    expect(validateOutline(valid).ok).toBe(true);
  });

  it.each([
    ["title が 無い", { ...valid, title: "" }],
    ["beats が 空", { ...valid, beats: [] }],
    ["what が 無い", { ...valid, beats: [{ panel: 1, why: "お" }] }],
    ["panel が 数字でない", { ...valid, beats: [{ panel: "1", what: "え", why: "お" }] }],
  ])("%s なら 止める", (_label, broken) => {
    const result = validateOutline(broken);
    expect(result.ok).toBe(false);
  });

  it("JSONでない ものも 止める", () => {
    expect(validateOutline("こんにちは").ok).toBe(false);
    expect(validateOutline(null).ok).toBe(false);
  });
});
