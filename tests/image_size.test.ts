import { describe, expect, it } from "vitest";
import { contentSchema } from "../src/content/schema";

/**
 * 絵の 大きさ（2026-08-30 の 指定「説明用の画像が小さすぎて…ちゃんとわかるように」
 *「他の要素では小さくないといけない場合もあるので、この時は大きくするような設定に」）。
 *
 * 見張るのは 1つ: **省いた ときに これまでどおりで ある こと**。
 * 既定を 変えて しまうと、報連相 以外の 何十枚もの さし絵が 黙って 大きく なる。
 */
function articleWith(block: unknown): unknown {
  return {
    kind: "article",
    id: "size_test",
    title: "テスト",
    description: "テストです。",
    blocks: [block],
  };
}

describe("さし絵の 大きさ", () => {
  it("省くと これまでどおり（size は 付かない）", () => {
    const parsed = contentSchema.safeParse(articleWith({ kind: "image", src: "/img/x.webp" }));
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === "article") {
      const block = parsed.data.blocks[0] as { size?: string };
      expect(block.size).toBeUndefined();
    }
  });

  it("大きくしたい 絵には wide を 付けられる", () => {
    const parsed = contentSchema.safeParse(
      articleWith({ kind: "image", src: "/img/x.webp", size: "wide" }),
    );
    expect(parsed.success).toBe(true);
  });

  it("知らない 大きさは 通らない（書きまちがいを 保存させない）", () => {
    const parsed = contentSchema.safeParse(
      articleWith({ kind: "image", src: "/img/x.webp", size: "huge" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("報連相の 説明図は wide、場面の さし絵は そのまま", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const read = (name: string) =>
      JSON.parse(readFileSync(join(__dirname, "..", "content", "articles", name), "utf8")) as {
        blocks: { kind: string; src?: string; size?: string }[];
      };
    const soudan = read("soudan_lecture.json");
    const wide = soudan.blocks.filter((b) => b.kind === "image" && b.size === "wide");
    const plain = soudan.blocks.filter((b) => b.kind === "image" && !b.size);
    // 図（コマ割り・文字入り）は 大きく、場面の さし絵は これまでどおり
    expect(wide.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
    expect(wide.some((b) => b.src?.includes("slide9"))).toBe(true);
    expect(plain.some((b) => b.src?.includes("slide3"))).toBe(true);
  });
});
