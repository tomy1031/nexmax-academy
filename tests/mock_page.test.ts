import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  parseMockPage,
  parseStyle,
  type MockNode,
} from "../src/lib/text/mock-page";

/**
 * 事前調査の 模擬ページは **教材データ**（`/admin` から 先生が 直せる）なのに、
 * 見た目が それ自体 教材なので タグを 残して 描くしかない。
 *
 * 2026-09-07 のコード検収が、正規表現で 消す やりかたを 実機 Chromium で 破った
 *（`<img src="x"/onerror=…>` — 引用符の 直後の `/` が 属性の 区切りに なる）。
 * いまは **通す ものだけ 通す**形なので、ここでは「許した もの以外 1つも 生き残らない」ことを
 * 見張る。ここが ゆるむと、貼りまちがい 1回で 学習者の 画面が 乗っ取られる。
 */

/** 木を 読みやすい 形へ（テストの 中でだけ 使う）。 */
function flatten(nodes: readonly MockNode[]): string {
  return nodes
    .map((n) =>
      n.kind === "text"
        ? n.text
        : `<${n.tag}${n.className ? ` class=${n.className}` : ""}${
            n.style ? ` style=${JSON.stringify(n.style)}` : ""
          }>${flatten(n.children)}</${n.tag}>`,
    )
    .join("");
}

/** 木の どこかに その 名前の 手がかりが 残って いないか。 */
function hasAnywhere(nodes: readonly MockNode[], needle: string): boolean {
  return nodes.some((n) =>
    n.kind === "text"
      ? n.text.includes(needle)
      : n.tag.includes(needle) ||
        (n.className ?? "").includes(needle) ||
        JSON.stringify(n.style ?? {}).includes(needle) ||
        hasAnywhere(n.children, needle),
  );
}

describe("模擬ページを 木に ほどく（parseMockPage）", () => {
  it("見た目の タグ・class・style・ruby は 残る", () => {
    const html =
      '<div class="ig-header" style="background:#fff"><ruby>投稿<rt>とうこう</rt></ruby><b>1,842</b></div>';
    expect(flatten(parseMockPage(html))).toBe(
      '<div class=ig-header style={"background":"#fff"}><ruby>投稿<rt>とうこう</rt></ruby><b>1,842</b></div>',
    );
  });

  it("class と style 以外の 属性は 1つも 残らない", () => {
    const html = '<div id="x" data-a="1" onclick="go()" title="t" class="c">中</div>';
    const tree = parseMockPage(html);
    expect(flatten(tree)).toBe("<div class=c>中</div>");
    for (const gone of ["onclick", "data-a", "title", "id"]) {
      expect(hasAnywhere(tree, gone), `${gone} が 残って いる`).toBe(false);
    }
  });

  it("検収が 破った PoC が どれも 通らない", () => {
    const poc = [
      '<img src="x"/onerror="alert(document.cookie)">',
      '<img/src="x"/onerror="alert(1)">',
      '<img src="x" onx="1"/onerror="alert(1)">',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<a href="java&Tab;script:alert(1)">x</a>',
      '<button formaction="javascript:alert(1)">x</button>',
      '<svg><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>',
      '<base href="https://evil.example/">',
      "<script>alert(1)</script>",
      '<iframe src="//evil"></iframe>',
    ];
    for (const html of poc) {
      const tree = parseMockPage(html);
      for (const gone of ["onerror", "javascript", "formaction", "href", "base", "alert", "src"]) {
        expect(hasAnywhere(tree, gone), `${html} から ${gone} が 生き残った`).toBe(false);
      }
    }
  });

  it("script は 中身ごと 消え、知らない タグは 中身だけ 残す", () => {
    expect(flatten(parseMockPage("<p>a</p><script>alert(1)</script><b>b</b>"))).toBe(
      "<p>a</p><b>b</b>",
    );
    // <a> は 許可の 外。行き先は 消えるが、読ませたい 文字は 残す
    expect(flatten(parseMockPage('<p>まえ<a href="//x">なか</a>あと</p>'))).toBe(
      "<p>まえなかあと</p>",
    );
  });

  it("実体参照は **文字として** 戻す（戻した 先で タグに 化けない）", () => {
    expect(decodeEntities("&amp;&#65;")).toBe("&A");
    // < > & は 記号に 戻さない（戻すと 読み直された ときに タグに 見える）
    expect(decodeEntities("&#60;script&#62;")).toBe("script");
    expect(flatten(parseMockPage("&lt;script&gt;alert(1)&lt;/script&gt;"))).toBe(
      "<script>alert(1)</script>",
    );
  });

  it("style は 組に なり、危ない 宣言は 落ちる", () => {
    expect(parseStyle("background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#fff")).toEqual({
      background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
      color: "#fff",
    });
    expect(parseStyle("background:url(javascript:alert(1));color:red")).toEqual({ color: "red" });
    expect(parseStyle("aspect-ratio:4/3")).toEqual({ aspectRatio: "4/3" });
  });

  it("閉じ忘れ・順番ちがいでも 落ちない", () => {
    expect(flatten(parseMockPage("<div><b>ふとじ<div>つぎ"))).toBe(
      "<div><b>ふとじ<div>つぎ</div></b></div>",
    );
    expect(flatten(parseMockPage("</div>まいご"))).toBe("まいご");
  });

  it("いま 教材が 持って いる 9枚が、文字を 落とさずに ほどける", async () => {
    const { GIT_CONTENTS } = await import("../src/content/git-contents.generated");
    const { contentSchema } = await import("../src/content/schema");
    const pages = GIT_CONTENTS.map((raw) => contentSchema.parse(raw)).flatMap((c) =>
      c.kind === "scenario" ? (c.research?.pages ?? []) : [],
    );
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const tree = parseMockPage(page.html);
      // 地の文（タグを 外した 中身）が 1字も 欠けて いない
      const original = page.html
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/gu, "");
      const parsed = flatten(tree)
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/gu, "");
      expect(parsed, `${page.tab} の 文字が 変わった`).toBe(original);
    }
  });
});
