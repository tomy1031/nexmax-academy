import { describe, expect, it } from "vitest";
import { contentSchema, type Content, type Stage } from "../src/content/schema";
import {
  listArticles,
  listListenings,
  listMangas,
  listMeetings,
  listQuizSets,
  listScenarios,
  listSkits,
  listStages,
} from "../src/lib/content";
import { mapListedStages } from "../src/lib/map-data";
import { contentCardImage, stageCardImage } from "../src/lib/stage-card-image";

/**
 * カード表示の 絵（2026-09-22 の 指定「カードに 絵をつけて欲しい。とりあえず 各ステージで
 * 使われている 絵の なかから 選んでください」）。
 *
 * ここが 崩れると **字だけの カードが 並ぶ**（学習者が 自分の いた ところを 目で
 * 探せない）か、**教材に 無い 絵が 出る**（カードが 中身の 見本で なくなる）。
 * どちらも 画面を 見ないと 気づけない ので、機械で 見張る。
 */

function parse(raw: Record<string, unknown>): Content {
  const parsed = contentSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`fixture が壊れている: ${parsed.error.message}`);
  return parsed.data as Content;
}

const DONE = (src: string) => ({ src, status: "done" as const, refs: [] });

function stage(over: Record<string, unknown> = {}): Stage {
  return parse({
    kind: "stage",
    id: "test-stage",
    order: 1,
    title: "ためしの ステージ",
    reading: "ためしの すてーじ",
    description: "ためしの ステージ。",
    color: "sky",
    status: "published",
    contents: [{ ref: "a", type: "manga" }],
    wordStageIds: [],
    ...over,
  }) as Stage;
}

const manga = (id: string, src?: string) =>
  parse({
    kind: "manga",
    id,
    format: "story",
    title: "まんが",
    description: "まんがの せつめい。",
    characters: [{ id: "hendy", name: "ヘンディ", role: "先輩" }],
    pages: [
      {
        panels: [
          { image: { refs: [], status: "empty" }, lines: [] },
          { image: src ? DONE(src) : { refs: [], status: "empty" }, lines: [] },
        ],
      },
    ],
  });

const article = (id: string, blocks: Record<string, unknown>[]) =>
  parse({ kind: "article", id, title: "きじ", description: "きじの せつめい。", blocks });

describe("教材 1本の 代表の 絵", () => {
  it("まんがは 絵の 出来て いる いちばん 早い コマ（作りかけの コマは とばす）", () => {
    expect(contentCardImage(manga("m1", "/img/manga/m1/c02.webp"))).toBe("/img/manga/m1/c02.webp");
  });

  it("記事は 表紙（hero）の 絵。本文の 中の 絵より 先", () => {
    const withHero = article("a1", [
      { kind: "paragraph", text: "はじめの 文。" },
      { kind: "image", ...DONE("/img/a1/naka.webp") },
      { kind: "hero", title: "表紙", image: DONE("/img/a1/hero.webp") },
    ]);
    expect(contentCardImage(withHero)).toBe("/img/a1/hero.webp");
  });

  it("表紙が 無い 記事は 本文の 絵ブロックの 1枚目", () => {
    const noHero = article("a2", [
      { kind: "paragraph", text: "はじめの 文。" },
      { kind: "image", ...DONE("/img/a2/naka.webp") },
    ]);
    expect(contentCardImage(noHero)).toBe("/img/a2/naka.webp");
  });

  it("カードの 中の 小さな 絵は 拾わない（1枚だけ 切り出すと 何の 絵か 分からない）", () => {
    const cardsOnly = article("a3", [
      { kind: "cards", items: [{ title: "あ", image: DONE("/img/a3/chiisai.webp") }] },
    ]);
    expect(contentCardImage(cardsOnly)).toBeNull();
  });

  it("絵を 持たない 種別（リンク）は null", () => {
    const link = parse({
      kind: "link",
      id: "l1",
      title: "リンク",
      description: "リンクの せつめい。",
      url: "https://example.com",
    });
    expect(contentCardImage(link)).toBeNull();
  });
});

describe("ステージ 1つの カードの 絵", () => {
  it("学習順に 見て いちばん 早く 見つかった 1枚を 使う", () => {
    const contents = [
      { ref: "m0", type: "manga" },
      { ref: "m1", type: "manga" },
    ];
    const byRef = new Map<string, Content>([
      ["manga:m0", manga("m0")],
      ["manga:m1", manga("m1", "/img/manga/m1/c02.webp")],
    ]);
    expect(stageCardImage(stage({ contents }), (ref) => byRef.get(`${ref.type}:${ref.ref}`))).toBe(
      "/img/manga/m1/c02.webp",
    );
  });

  it("教材に 絵が 1枚も 無ければ、その 土地の 景色に 落ちる", () => {
    const area = { image: "/img/scenes/area_test.webp", note: "ためしの しま。" };
    expect(stageCardImage(stage({ area }), () => undefined)).toBe("/img/scenes/area_test.webp");
  });

  it("景色も 無ければ null（カードは 字だけで 出す）", () => {
    expect(stageCardImage(stage(), () => undefined)).toBeNull();
  });
});

/**
 * 実データ。ステージが 増えた ときに「絵の 出ない カード」が 黙って 混ざらない ように、
 * **地図に 並ぶ ステージ ぜんぶ**を 見張る。
 */
describe("カードの 絵（実データ）", () => {
  it("地図に 並ぶ ステージは ぜんぶ 絵を 持つ", async () => {
    const [stages, mangas, articles, skits, listenings, quizSets, meetings, scenarios] =
      await Promise.all([
        listStages(),
        listMangas(),
        listArticles(),
        listSkits(),
        listListenings(),
        listQuizSets(),
        listMeetings(),
        listScenarios(),
      ]);
    const byRef = new Map<string, Content>();
    for (const item of [
      ...mangas,
      ...articles,
      ...skits,
      ...listenings,
      ...quizSets,
      ...meetings,
      ...scenarios,
    ] as Content[]) {
      byRef.set(`${item.kind}:${item.id}`, item);
    }

    const listed = mapListedStages(stages);
    expect(listed.length).toBeGreaterThan(5);
    for (const item of listed) {
      const src = stageCardImage(item, (ref) => byRef.get(`${ref.type}:${ref.ref}`));
      expect(src, `${item.id} に カードの 絵が 無い`).toBeTruthy();
      expect(src, `${item.id} の 絵は /img/ の 下に 置く`).toMatch(/^\/img\//);
    }
  });

  it("はじまりは まんがの 1コマ目（2026-09-22 に 見本として 指定された 1枚）", async () => {
    const [stages, mangas] = await Promise.all([listStages(), listMangas()]);
    const hajimari = stages.find((item) => item.id === "hajimari");
    expect(hajimari).toBeDefined();
    const byRef = new Map<string, Content>(
      mangas.map((item) => [`manga:${item.id}`, item as Content]),
    );
    expect(stageCardImage(hajimari!, (ref) => byRef.get(`${ref.type}:${ref.ref}`))).toBe(
      "/img/manga/hajimari_manga/v2c01.webp",
    );
  });
});
