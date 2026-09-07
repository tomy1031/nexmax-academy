import { describe, expect, it } from "vitest";
import { sanitizeMockPage } from "../src/lib/text/mock-page";

/**
 * 事前調査の 模擬ページは **教材データ**（`/admin` から 先生が 直せる）なのに、
 * 見た目が 教材なので innerHTML で 出すしかない。出す 直前の ふるいが 効いて いるかを
 * ここで 見張る——効かなく なったら、貼りまちがい 1回で 学習者の 画面が 乗っ取られる。
 */
describe("模擬ページの ふるい（sanitizeMockPage）", () => {
  it("script は 中身ごと 消える", () => {
    expect(sanitizeMockPage("<div>a</div><script>alert(1)</script><b>b</b>")).toBe(
      "<div>a</div><b>b</b>",
    );
  });

  it("閉じタグの 無い script も 消える", () => {
    expect(sanitizeMockPage('<p>x</p><script src="//evil/x.js">')).toBe("<p>x</p>");
  });

  it("style・iframe・object・embed も 消える", () => {
    const html = '<style>body{}</style><iframe src="//x"></iframe><object></object><embed>';
    expect(sanitizeMockPage(html)).toBe("");
  });

  it("on* の 属性は 引用符の 形を 問わず 消える", () => {
    expect(sanitizeMockPage('<img src="a.png" onerror="alert(1)">')).toBe('<img src="a.png">');
    expect(sanitizeMockPage("<div onclick='go()'>x</div>")).toBe("<div>x</div>");
    expect(sanitizeMockPage("<div onmouseover=go()>x</div>")).toBe("<div>x</div>");
  });

  it("javascript: の 行き先は 引用符を 崩さずに 無効に なる", () => {
    expect(sanitizeMockPage('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a href="blocked:alert(1)">x</a>',
    );
    // 空白を はさむ 書き方（java script:）も 同じ
    expect(sanitizeMockPage('<a href="java\tscript:alert(1)">x</a>')).toContain("blocked:");
  });

  it("見た目の タグ・class・style・ruby は そのまま 残る", () => {
    const html =
      '<div class="ig-header" style="background:#fff">' +
      "<ruby>投稿<rt>とうこう</rt></ruby><b>1,842</b></div>";
    expect(sanitizeMockPage(html)).toBe(html);
  });

  it("いま 教材が 持って いる HTML を 変えない", async () => {
    const { GIT_CONTENTS } = await import("../src/content/git-contents.generated");
    const { contentSchema } = await import("../src/content/schema");
    const parsed = GIT_CONTENTS.map((raw) => contentSchema.parse(raw));
    const pages = parsed.flatMap((c) => (c.kind === "scenario" ? (c.research?.pages ?? []) : []));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(sanitizeMockPage(page.html), `${page.tab} が ふるいで 変わった`).toBe(page.html);
    }
  });
});
