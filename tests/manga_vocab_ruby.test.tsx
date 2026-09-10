import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MangaSlides } from "../src/components/manga/manga-slides";
import { mangaSchema } from "../src/content/schema";

/*
 * **まんがの ことばの 説明文にも ルビを 付ける。**
 *
 * 記事の ことばチップは 説明文を `RubyText` で 描いて いるのに、まんがだけ
 * 地の文の まま だった——読み辞書を いくら 足しても、画面には 裸の 漢字が
 * 出つづける（2026-09-10）。規律2「学習者が 読む 文の 漢字は 読み辞書で
 * 全部 覆う」は 辞書だけでなく **描きかた**まで 含めて はじめて 満たせる。
 */
const manga = mangaSchema.parse({
  kind: "manga",
  id: "ruby-test",
  format: "yonkoma",
  title: "テスト",
  description: "テスト",
  furigana: [
    ["報告", "ほうこく"],
    ["仕事", "しごと"],
  ],
  vocab: [{ term: "報告", reading: "ほうこく", meaning: "仕事の ことを 知らせる ことです。" }],
  pages: [{ panels: [{ lines: [{ speaker: "narration", text: "報告を します。" }] }] }],
});

describe("まんがの ことばの 説明文", () => {
  const html = renderToStaticMarkup(<MangaSlides manga={manga} embedded />);

  it("説明文の 漢字に ルビが 付く（地の文の まま 出さない）", () => {
    // 「仕事」は 説明文にしか 出ない。ルビが 付けば <ruby> が 立つ。
    expect(html).toContain("仕事");
    expect(html).toContain("<ruby>仕事<rt>しごと</rt></ruby>");
  });

  it("コマの 下と よみおわりの 一覧、どちらの 説明文にも 付く", () => {
    const ruby = html.split("<ruby>仕事<rt>しごと</rt></ruby>").length - 1;
    expect(ruby).toBe(2);
  });

  it("読み辞書に 無い ことばは そのまま 出す（描き分けが 効いて いる）", () => {
    expect(html).toContain("知らせる");
  });
});
