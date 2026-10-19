import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressBoxes, RowTaskPictures } from "../src/components/asakai/asakai-parts";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * 報告メモの 行（きのう したこと・きょう すること）に 並べる しごとの 絵
 *（2026-10-09 の 指定「昨日したこと、今日することの 項目内に しごとの イメージ画像を
 * 入れてください」）。絵の ファイルは **表（progress）の 行が 持つ**——`tasks` の 名前で
 * 表から 引く ので、引けて いる ことと、引けない 名前を 飛ばす ことを 見る。
 */
const index = buildFuriganaIndex([]);

const PROGRESS = [
  { label: "決済の 画面", icon: "💳", image: { src: "/img/a.webp", status: "done" } },
  { label: "成功の 画面", icon: "✅", image: { src: "/img/b.webp", status: "done" } },
  { label: "失敗の 画面", icon: "❌", image: { src: "/img/c.webp", status: "done" } },
];

/** 絵の 並び（src の 末尾だけ）。 */
function srcs(html: string): string[] {
  return [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/gu)].map(
    (match) => /([a-z]\.webp)/u.exec(match[1] ?? "")?.[1] ?? "",
  );
}

describe("RowTaskPictures", () => {
  it("名前で 表の 絵を 引く（並びは tasks の 順）", () => {
    const html = renderToStaticMarkup(
      <RowTaskPictures tasks={["失敗の 画面", "決済の 画面"]} progress={PROGRESS} />,
    );
    expect(srcs(html)).toEqual(["c.webp", "a.webp"]);
  });

  it("表に 無い 名前は 飛ばす（ほかの 絵は 出る）", () => {
    const html = renderToStaticMarkup(
      <RowTaskPictures tasks={["成功の 画面", "どこにも ない しごと"]} progress={PROGRESS} />,
    );
    expect(srcs(html)).toEqual(["b.webp"]);
  });

  it("ぜんぶ 無い 名前なら 何も 描かない（空の 枠を 残さない）", () => {
    const html = renderToStaticMarkup(
      <RowTaskPictures tasks={["どこにも ない しごと"]} progress={PROGRESS} />,
    );
    expect(html).toBe("");
  });

  it("64px で 出す（表の 80px より 小さい）", () => {
    const html = renderToStaticMarkup(
      <RowTaskPictures tasks={["決済の 画面"]} progress={PROGRESS} />,
    );
    expect(html).toContain("h-16 w-16");
    expect(html).not.toContain("h-20 w-20");
  });

  it("押すと 全画面（名前は しごとの 名前）。キャプションの 字は 付けない", () => {
    const html = renderToStaticMarkup(
      <RowTaskPictures tasks={["決済の 画面"]} progress={PROGRESS} />,
    );
    expect(html).toContain('aria-label="決済の 画面（ひろげて 見る）"');
    /* 見える 字は ⛶ の 印だけ（aria-label は 属性なので 字では ない）。 */
    expect(html.replace(/<[^>]+>/gu, "")).toBe("⛶");
  });

  it("絵が まだ 無い（status が done で ない）行は 絵文字に 落ちる", () => {
    const html = renderToStaticMarkup(
      <RowTaskPictures
        tasks={["決済の 画面"]}
        progress={[
          { label: "決済の 画面", icon: "💳", image: { src: "/img/a.webp", status: "empty" } },
        ]}
      />,
    );
    expect(srcs(html)).toEqual([]);
    expect(html).toContain("💳");
  });
});

describe("表（ProgressBoxes）の 絵は 80px の まま", () => {
  it("行の 絵を 足しても、表は h-20 w-20", () => {
    const html = renderToStaticMarkup(
      <ProgressBoxes
        index={index}
        items={PROGRESS.map((one) => ({ ...one, state: "done" as const }))}
      />,
    );
    expect(html).toContain("h-20 w-20");
    expect(html).not.toContain("h-16 w-16");
  });
});
