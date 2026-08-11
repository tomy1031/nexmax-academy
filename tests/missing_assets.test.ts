import { describe, expect, it } from "vitest";
import {
  applyAsset,
  collectMissingAssets,
  reasonCannotMake,
  summarize,
  type AssetOutcome,
} from "@/lib/batch/missing-assets";
import { contentSchema, type Content } from "@/content/schema";

/**
 * まとめて作る — 足りないものを数える
 *
 * 一括処理は、まちがえると**教材を一度にたくさん壊す**。
 * だから「どこへ書き戻すか」を純関数にして、ここで固定する。
 */

function parse(raw: unknown): Content {
  const result = contentSchema.safeParse(raw);
  if (!result.success) throw new Error(`fixture が壊れている: ${result.error.message}`);
  return result.data;
}

function manga(panels: unknown[][], over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "manga",
    id: "m1",
    format: "yonkoma",
    title: "まんが",
    description: "てすとの まんが",
    pages: panels.map((page) => ({ panels: page })),
    ...over,
  });
}

const emptyPanel = { image: { refs: [], status: "empty", prompt: "オフィスの あさ" }, lines: [] };
const donePanel = { image: { src: "/img/a.webp", refs: [], status: "done" }, lines: [] };

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

const emptyImageBlock = {
  kind: "image",
  refs: [],
  status: "empty",
  prompt: "みちが つづく 地図",
};
const doneImageBlock = { kind: "image", refs: [], status: "done", src: "/img/b.webp" };
const paragraphBlock = { kind: "paragraph", text: "みちは つづいて います。" };

function character(over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "character",
    id: "c1",
    name: "ニャム",
    reading: "にゃむ",
    role: "同期",
    looks: "coral cardigan, dark bob hair",
    ...over,
  });
}

function listening(over: Record<string, unknown> = {}): Content {
  return parse({
    kind: "listening",
    id: "l1",
    title: "あさかい",
    description: "てすとの リスニング",
    focus: "あいさつを 聞きとる",
    participants: [{ id: "p1", name: "ヘンディ", role: "先輩" }],
    script: [
      { speaker: "p1", text: "おはようございます。" },
      { speaker: "p1", text: "きょうも よろしく おねがいします。" },
    ],
    keywords: ["おはよう"],
    ...over,
  });
}

describe("足りないものを 集める", () => {
  it("絵の無いコマだけを 拾う（できているコマは 数えない）", () => {
    const found = collectMissingAssets([manga([[donePanel, emptyPanel]])]);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("mangaPanel");
    expect(found[0]?.label).toContain("1ページ目 2コマ目");
  });

  it("読み物の 絵の無い画像ブロックを 拾う（挿絵も まとめて つくれる）", () => {
    const found = collectMissingAssets([
      article([paragraphBlock, doneImageBlock, paragraphBlock, emptyImageBlock]),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("articleImage");
    // 番号は「何まいめの え か」。ブロックの添字（3）ではなく 画像の通し番号（2）
    expect(found[0]?.label).toContain("2まいめの え");
    expect(found[0]?.prompt).toBe("みちが つづく 地図");
  });

  it("設定画の無い登場人物を 拾う", () => {
    const found = collectMissingAssets([character()]);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("characterSheet");
    // 指示が保存されていないときは その場で組み立てる（画面の「AIで つくる」と同じ）
    expect(found[0]?.prompt).toContain("model sheet");
  });

  it("音声の無いリスニングを 拾う", () => {
    const found = collectMissingAssets([listening()]);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("listeningAudio");
  });

  it("できているものは 拾わない", () => {
    expect(
      collectMissingAssets([
        manga([[donePanel]]),
        character({ sheet: { src: "/img/s.webp", refs: [], status: "done" } }),
        listening({ audioUrl: "/audio/a.wav" }),
      ]),
    ).toEqual([]);
  });

  it("`status` ではなく 実体（src）で 判定する", () => {
    /*
     * status は タブを閉じても更新されないので、"generating" のまま残った嘘を掴む。
     * 実体があるかどうかだけが信用できる。
     */
    const lying = manga([
      [{ image: { src: "/img/a.webp", refs: [], status: "empty" }, lines: [] }],
    ]);
    expect(collectMissingAssets([lying])).toEqual([]);

    const alsoLying = manga([[{ image: { refs: [], status: "done", prompt: "x" }, lines: [] }]]);
    expect(collectMissingAssets([alsoLying])).toHaveLength(1);
  });

  it("2回 走査しても 同じ結果になる（前回のぶんが残らない）", () => {
    const contents = [manga([[emptyPanel, emptyPanel]])];
    expect(collectMissingAssets(contents)).toEqual(collectMissingAssets(contents));
  });
});

describe("できたものを 書き戻す", () => {
  it("まんがは 元のコマだけに 入り、他のコマは 触らない", () => {
    const source = manga([[emptyPanel, emptyPanel]]);
    const [, second] = collectMissingAssets([source]);
    const updated = applyAsset(source, second!, "/img/new.webp");
    if (updated.kind !== "manga") throw new Error("kind が変わった");
    expect(updated.pages[0]?.panels[0]?.image.src).toBeUndefined();
    expect(updated.pages[0]?.panels[1]?.image.src).toBe("/img/new.webp");
    expect(updated.pages[0]?.panels[1]?.image.status).toBe("done");
  });

  it("2ページ目にも 正しく入る", () => {
    const source = manga([[donePanel], [donePanel, emptyPanel]]);
    const [asset] = collectMissingAssets([source]);
    const updated = applyAsset(source, asset!, "/img/new.webp");
    if (updated.kind !== "manga") throw new Error("kind が変わった");
    expect(updated.pages[1]?.panels[1]?.image.src).toBe("/img/new.webp");
  });

  it("元の教材は 変えない", () => {
    const source = manga([[emptyPanel]]);
    const [asset] = collectMissingAssets([source]);
    applyAsset(source, asset!, "/img/new.webp");
    if (source.kind !== "manga") throw new Error("kind が変わった");
    expect(source.pages[0]?.panels[0]?.image.src).toBeUndefined();
  });

  it("読み物は その画像ブロックだけに 入り、他のブロックは 触らない", () => {
    const source = article([emptyImageBlock, paragraphBlock, emptyImageBlock]);
    const [, second] = collectMissingAssets([source]);
    const updated = applyAsset(source, second!, "/img/new.webp");
    if (updated.kind !== "article") throw new Error("kind が変わった");
    const first = updated.blocks[0];
    const third = updated.blocks[2];
    if (first?.kind !== "image" || third?.kind !== "image") throw new Error("ブロックが 変わった");
    expect(first.src).toBeUndefined();
    expect(third.src).toBe("/img/new.webp");
    expect(third.status).toBe("done");
    expect(updated.blocks[1]).toEqual(paragraphBlock);
  });

  it("読み物の 画像でないブロックを 指していても 壊さない", () => {
    /*
     * ブロックを1つ消したり 種類を変えたりすると、id の中の添字が別のブロックを指す。
     * 投げずに元のまま返す——一括処理の途中で1件おかしくても 残りを続けたいから。
     */
    const [asset] = collectMissingAssets([article([emptyImageBlock])]);
    const swapped = article([paragraphBlock]);
    const updated = applyAsset(swapped, asset!, "/img/x.webp");
    if (updated.kind !== "article") throw new Error("kind が変わった");
    expect(updated.blocks[0]).toEqual(paragraphBlock);
  });

  it("設定画は sheet に入り、使った指示も 残す（あとで作り直せる）", () => {
    const source = character();
    const [asset] = collectMissingAssets([source]);
    const updated = applyAsset(source, asset!, "/img/sheet.webp");
    if (updated.kind !== "character") throw new Error("kind が変わった");
    expect(updated.sheet.src).toBe("/img/sheet.webp");
    expect(updated.sheet.prompt).toContain("model sheet");
  });

  it("音声は audioUrl に入る", () => {
    const source = listening();
    const [asset] = collectMissingAssets([source]);
    const updated = applyAsset(source, asset!, "/audio/a.wav");
    if (updated.kind !== "listening") throw new Error("kind が変わった");
    expect(updated.audioUrl).toBe("/audio/a.wav");
  });
});

describe("行き先が 合わないときは 元のまま返す（途中で止めない）", () => {
  it("教材IDが ちがう", () => {
    const other = manga([[emptyPanel]], { id: "m2" });
    const [asset] = collectMissingAssets([manga([[emptyPanel]])]);
    expect(applyAsset(other, asset!, "/img/x.webp")).toBe(other);
  });

  it("種類が ちがう", () => {
    const [asset] = collectMissingAssets([character()]);
    const wrongKind = manga([[emptyPanel]], { id: "c1" });
    expect(applyAsset(wrongKind, asset!, "/img/x.webp")).toBe(wrongKind);
  });

  it("消えたコマを 指していても 壊さない", () => {
    const [asset] = collectMissingAssets([manga([[donePanel, emptyPanel]])]);
    const shrunk = manga([[donePanel]]);
    const updated = applyAsset(shrunk, asset!, "/img/x.webp");
    if (updated.kind !== "manga") throw new Error("kind が変わった");
    expect(updated.pages[0]?.panels).toHaveLength(1);
    expect(updated.pages[0]?.panels[0]?.image.src).toBe("/img/a.webp");
  });
});

describe("作れないものを 先に よける", () => {
  it("指示が 空の絵は 作れない（先に書いてもらう）", () => {
    const noPrompt = manga([[{ image: { refs: [], status: "empty" }, lines: [] }]]);
    const [asset] = collectMissingAssets([noPrompt]);
    expect(reasonCannotMake(asset!)).toContain("指示");
  });

  it("音声は 台本そのものが 指示なので、prompt が 空でも 作れる", () => {
    const [asset] = collectMissingAssets([listening()]);
    expect(reasonCannotMake(asset!)).toBeNull();
  });
});

describe("進み具合の 数え方", () => {
  it("できた・できなかった・とばした を 分けて数える", () => {
    const outcomes = new Map<string, AssetOutcome>([
      ["a", { state: "done", url: "/1.webp" }],
      ["b", { state: "done", url: "/2.webp" }],
      ["c", { state: "failed", message: "つながりません" }],
      ["d", { state: "skipped", message: "指示が ありません" }],
    ]);
    expect(summarize(outcomes)).toEqual({ done: 2, failed: 1, skipped: 1 });
  });
});
