import { describe, expect, it } from "vitest";
import { bakeSpeech, staleBakedPanels, unbakeSpeech } from "@/lib/manga-baked";
import { contentSchema, type Manga } from "@/content/schema";

/**
 * まんがの2モードの切りかえ
 *
 * 切りかえは教材ぜんぶのコマを触るので、誤ると被害が大きい。
 * とくに「セリフを直したのに古い字の絵が公開され続ける」は先生から見えないので、
 * 機械で止められるかどうかがすべて。
 */

function manga(over: Record<string, unknown> = {}): Manga {
  const parsed = contentSchema.parse({
    kind: "manga",
    id: "m1",
    format: "yonkoma",
    title: "まんが",
    description: "てすとの まんが",
    furigana: [
      ["朝会", "あさかい"],
      ["報告", "ほうこく"],
    ],
    pages: [
      {
        panels: [
          {
            image: { src: "/img/old.webp", refs: [], status: "done" },
            lines: [{ speaker: "narration", text: "朝会を はじめます。" }],
          },
        ],
      },
    ],
    ...over,
  });
  if (parsed.kind !== "manga") throw new Error("fixture が まんがでない");
  return parsed;
}

describe("セリフ入りに する", () => {
  it("読み辞書から かなを 作って 焼く文字にする", () => {
    const { manga: baked, problems } = bakeSpeech(manga());
    expect(problems).toEqual([]);
    expect(baked.speechInImage).toBe(true);
    expect(baked.pages[0]?.panels[0]?.bakedText).toEqual(["あさかいを はじめます。"]);
  });

  it("焼く文字が 変わったコマの 絵は 消す（字の無い絵を そのまま使わせない）", () => {
    const { manga: baked } = bakeSpeech(manga());
    expect(baked.pages[0]?.panels[0]?.image.src).toBeUndefined();
    expect(baked.pages[0]?.panels[0]?.image.status).toBe("empty");
  });

  it("覆えていない漢字が あっても 止めず、どれが 焼けなかったかを 返す", () => {
    const source = manga({
      pages: [
        {
          panels: [
            {
              lines: [
                { speaker: "narration", text: "朝会を はじめます。" },
                { speaker: "narration", text: "資料を みてください。" },
              ],
            },
          ],
        },
      ],
    });
    const { manga: baked, problems } = bakeSpeech(source);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.text).toContain("資料");
    // 焼けた方は入っている。1語の読み漏れで 切りかえ自体を できなくしない
    expect(baked.pages[0]?.panels[0]?.bakedText[0]).toBe("あさかいを はじめます。");
    expect(baked.pages[0]?.panels[0]?.bakedText[1]).toBe("");
  });

  it("元の教材は 変えない", () => {
    const source = manga();
    bakeSpeech(source);
    expect(source.speechInImage).toBe(false);
    expect(source.pages[0]?.panels[0]?.image.src).toBe("/img/old.webp");
  });
});

describe("絵だけに もどす", () => {
  it("焼き文字を 消し、絵も 消す（二重に 字が 出ないように）", () => {
    const { manga: baked } = bakeSpeech(manga());
    const withArt = {
      ...baked,
      pages: baked.pages.map((page) => ({
        ...page,
        panels: page.panels.map((panel) => ({
          ...panel,
          image: { ...panel.image, src: "/img/baked.webp", status: "done" as const },
        })),
      })),
    };
    const back = unbakeSpeech(withArt);
    expect(back.speechInImage).toBe(false);
    expect(back.pages[0]?.panels[0]?.bakedText).toEqual([]);
    expect(back.pages[0]?.panels[0]?.image.src).toBeUndefined();
  });

  it("もともと 焼いていないコマの 絵は 消さない", () => {
    const back = unbakeSpeech(manga());
    expect(back.pages[0]?.panels[0]?.image.src).toBe("/img/old.webp");
  });

  it("もどした形は スキーマを 通る（焼き文字が 残っていない）", () => {
    const { manga: baked } = bakeSpeech(manga());
    expect(contentSchema.safeParse(unbakeSpeech(baked)).success).toBe(true);
  });
});

describe("ずれたコマを 見つける", () => {
  it("セリフを 直すと ずれとして 出る", () => {
    const { manga: baked } = bakeSpeech(manga());
    const edited = {
      ...baked,
      pages: baked.pages.map((page) => ({
        ...page,
        panels: page.panels.map((panel) => ({
          ...panel,
          lines: [{ speaker: "narration", text: "報告を はじめます。" }],
        })),
      })),
    };
    const stale = staleBakedPanels(edited);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ page: 0, panel: 0, line: 0 });
  });

  it("そろっていれば 空", () => {
    const { manga: baked } = bakeSpeech(manga());
    expect(staleBakedPanels(baked)).toEqual([]);
  });

  it("絵だけモードでは 何も 言わない", () => {
    expect(staleBakedPanels(manga())).toEqual([]);
  });
});

describe("スキーマが 危ないものを 止める", () => {
  const bakedManga = (bakedText: string[], lines = 1) =>
    contentSchema.safeParse({
      kind: "manga",
      id: "m1",
      format: "yonkoma",
      title: "まんが",
      description: "てすと",
      speechInImage: true,
      pages: [
        {
          panels: [
            {
              lines: Array.from({ length: lines }, () => ({
                speaker: "narration",
                text: "はい。",
              })),
              bakedText,
            },
          ],
        },
      ],
    });

  it("漢字を 焼こうとしたら 止める（ふりがなを 焼けない）", () => {
    const result = bakedManga(["朝会を はじめます"]);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("漢字");
  });

  it("20文字を こえたら 止める（長いと 字が くずれる）", () => {
    const result = bakedManga(["あ".repeat(21)]);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("20");
  });

  it("セリフと 数が 合わないと 止める", () => {
    const result = bakedManga(["あ", "い"], 1);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("そろえる");
  });

  it("1コマ 3つ以上の 吹き出しは 止める", () => {
    const result = bakedManga(["あ", "い", "う"], 3);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("2つの 吹き出しまで");
  });

  it("かな・数字・記号なら 通る", () => {
    expect(bakedManga(["9じに はじめます！"]).success).toBe(true);
  });

  it("絵だけモードなのに 焼き文字が 残っていたら 止める", () => {
    const result = contentSchema.safeParse({
      kind: "manga",
      id: "m1",
      format: "yonkoma",
      title: "まんが",
      description: "てすと",
      speechInImage: false,
      pages: [{ panels: [{ lines: [], bakedText: ["あ"] }] }],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("もどしたら");
  });
});
