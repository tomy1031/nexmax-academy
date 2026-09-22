import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressBoxes } from "../src/components/asakai/asakai-parts";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * しごとの 表の 絵の 欄（2026-09-16 の 検収）。
 *
 * **絵を 持って いる 表だけ 欄を 広げる**。390px の 画面では 表の 幅が 318px しか なく、
 * 絵の 無い 表で 88px を 空欄に 使うと、しごとの 名前に 134px しか 残らない。
 *
 * この 守りは もともと e2e が 夕礼（`asakai_muzukashii`）の 表で 見て いた。
 * 2026-09-18 に 夕礼の 表にも 絵が 入った（ユーザーの 判断 A）ので、教材の 中に
 * 「絵の 無い 表」が 無く なった——部品を じかに 描いて 見る。
 */
const index = buildFuriganaIndex([]);

function firstCellClass(html: string): string {
  const td = /<td class="([^"]*)"/.exec(html);
  return td?.[1] ?? "";
}

describe("ProgressBoxes の 絵の 欄", () => {
  it("絵の 無い 表は 欄を 広げない（絵文字の 幅だけ）", () => {
    const html = renderToStaticMarkup(
      <ProgressBoxes
        index={index}
        items={[
          { label: "学生一覧・検索", state: "now" },
          { label: "絞り込み", state: "later" },
        ]}
      />,
    );
    expect(firstCellClass(html)).toContain("w-7");
    expect(firstCellClass(html)).not.toContain("w-[88px]");
  });

  it("絵が まだ 無い（status が done で ない）表も 広げない", () => {
    const html = renderToStaticMarkup(
      <ProgressBoxes
        index={index}
        items={[
          {
            label: "学生一覧・検索",
            icon: "🔍",
            image: { src: "/img/x.webp", status: "empty" },
            state: "now",
          },
        ]}
      />,
    );
    expect(firstCellClass(html)).not.toContain("w-[88px]");
  });

  it("絵を 1枚でも 持って いる 表は 欄を 広げる", () => {
    const html = renderToStaticMarkup(
      <ProgressBoxes
        index={index}
        items={[
          {
            label: "学生一覧・検索",
            icon: "🔍",
            image: { src: "/img/x.webp", status: "done" },
            state: "now",
          },
          { label: "絞り込み", state: "later" },
        ]}
      />,
    );
    expect(firstCellClass(html)).toContain("w-[88px]");
  });
});
