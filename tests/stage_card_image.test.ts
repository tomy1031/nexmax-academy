import { describe, expect, it } from "vitest";
import { contentSchema, type Content, type Stage } from "../src/content/schema";
import { hasAsset } from "../src/lib/asset-url";
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

/**
 * 表紙を 持つ 5種別は **実データを そのまま 使って** 見る。
 *
 * スキット・リスニング・もんだい・ミーティング・シナリオは スキーマが 大きく、
 * 手で 作った 見本は すぐ 本物と ずれる（作った 見本が スキーマを 通らず、
 * テストの ほうを 直す ことに なる）。ここは「実際の 教材から この 1枚が 出る」を
 * 見張る ほうが 役に 立つ。
 */
describe("表紙を 持つ 種別（実データ）", () => {
  it("スキットは 表紙の 1枚", async () => {
    const skit = (await listSkits()).find((item) => item.id === "houkoku_skit");
    expect(skit).toBeDefined();
    expect(contentCardImage(skit as Content)).toBe(skit?.cover?.src);
    expect(contentCardImage(skit as Content)).toMatch(/^\/img\//);
  });

  it("リスニングは 聞く 前の 表紙", async () => {
    const listening = (await listListenings()).find((item) => item.id === "houkoku_listening");
    expect(listening).toBeDefined();
    expect(contentCardImage(listening as Content)).toBe(listening?.cover?.src);
  });

  it("もんだいは 設問の 場面の 絵（絵の ある いちばん 早い 問い）", async () => {
    const set = (await listQuizSets()).find((item) => item.id === "soudan_kehai");
    expect(set).toBeDefined();
    const first = set?.questions.find((question) => question.image?.src);
    expect(first).toBeDefined();
    expect(contentCardImage(set as Content)).toBe(first?.image?.src);
  });

  it("ミーティングは たいわの 背景。背景の 無い ミーティングは null", async () => {
    const meetings = await listMeetings();
    const withGame = meetings.find((item) => item.talkGame);
    expect(withGame).toBeDefined();
    expect(contentCardImage(withGame as Content)).toBe(withGame?.talkGame?.background);

    const plain = meetings.find((item) => !item.talkGame);
    expect(plain).toBeDefined();
    expect(contentCardImage(plain as Content)).toBeNull();
  });

  it("シナリオは お客さまの 顔。`/` で 始まらない 名前は 絵では ない", async () => {
    const scenarios = await listScenarios();
    const withFace = scenarios.find((item) => item.client.avatar.startsWith("/"));
    expect(withFace).toBeDefined();
    expect(contentCardImage(withFace as Content)).toBe(withFace?.client.avatar);

    // `bakery` などは 頭文字の 丸に なる 名前を 入れて ある（たいわの 画面と 同じ 見分け）
    const withInitial = scenarios.find((item) => !item.client.avatar.startsWith("/"));
    expect(withInitial).toBeDefined();
    expect(contentCardImage(withInitial as Content)).toBeNull();
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
    const picked = new Map<string, string>();
    for (const item of listed) {
      const src = stageCardImage(item, (ref) => byRef.get(`${ref.type}:${ref.ref}`));
      expect(src, `${item.id} に カードの 絵が 無い`).toBeTruthy();
      expect(src, `${item.id} の 絵は /img/ の 下に 置く`).toMatch(/^\/img\//);
      /*
       * **置いて ある ファイルか**まで 見る。`status: "done"` の まま 絵だけ 消えると
       * 404 に なり、画面は わくごと 消して 字だけの カードに 静かに 戻る——
       * URL の 形だけ 見て いると、その 静かな 後退を 誰も 見つけられない。
       */
      expect(hasAsset(src as string), `${item.id} の 絵が public に 無い: ${src}`).toBe(true);
      picked.set(item.id, src as string);
    }

    /*
     * **同じ 絵が 2つの カードに 出ない。** カードは「自分の いた ところを 目で 探す」
     * ための ものなので、2枚が 同じ 顔に なった 時点で その 役目が 消える。
     * ぶつかったら、どちらかの 教材で 別の 1枚（表紙）を 用意する。
     */
    const byImage = new Map<string, string[]>();
    for (const [id, src] of picked) byImage.set(src, [...(byImage.get(src) ?? []), id]);
    const shared = [...byImage].filter(([, ids]) => ids.length > 1);
    expect(shared.map(([src, ids]) => `${src} ← ${ids.join(" / ")}`)).toEqual([]);
  });

  /**
   * **景色に 落ちた ステージ**（教材に 絵が 1枚も 無い）の 一覧。
   *
   * 落ちる ことは 壊れでは ないが、カードが「中身の 見本」で なくなる ので
   * **増えた ことに 気づける ように して おく**。増やすなら、ここを 書き直す ついでに
   * その ステージの 教材に 表紙を 1枚 用意する ことを 考える。
   */
  it("教材に 絵が 無くて 景色に 落ちる ステージは、いまは お客さまインタビューだけ", async () => {
    const [stages, ...rest] = await Promise.all([
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
    for (const item of rest.flat() as Content[]) byRef.set(`${item.kind}:${item.id}`, item);

    const fellBack = mapListedStages(stages)
      .filter((item) => {
        const src = stageCardImage(item, (ref) => byRef.get(`${ref.type}:${ref.ref}`));
        return Boolean(src) && src === item.area?.image;
      })
      .map((item) => item.id);
    expect(fellBack).toEqual(["interview"]);
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
