import { describe, expect, it } from "vitest";
import { checkManuscript, extractManuscriptTexts } from "../scripts/slides/manuscript_checks";

/**
 * スライド組版原稿（scripts/slides/<教材ID>/index.html）の機械検査。
 *
 * slides 教材で学習者が読む字の大半は PDF の中＝原稿の側にあるのに、
 * 検査は JSON（title / notes）しか見ていなかった（2026-08-17 の ai_jidai 検収で
 * 手動確認で代替した穴）。ここが素通しすると、禁止語（規律1）と国名（規律9）は
 * 原稿では機械に掛からない。
 */

/** 原稿の最小形。本文だけ差し替えて使う。 */
const manuscript = (body: string) => `<!doctype html>
<html lang="ja">
<head>
<title>タイトル（スライド原稿）</title>
<style>.slide { width: 960px; } /* タイでも禁止語でもない字: 不正解 */</style>
</head>
<body>
${body}
</body>
</html>`;

describe("原稿から 学習者が読む文を 取り出す", () => {
  it("ルビの読み（rt）は除き、表記は連続した字として復元する", () => {
    const texts = extractManuscriptTexts(
      manuscript(
        `<div class="slide"><h1><ruby>時代<rt>じだい</rt></ruby>の <ruby>話<rt>はなし</rt></ruby></h1></div>`,
      ),
    );
    expect(texts).toContain("時代の 話");
    // 読みが本文に混ざると「時代じだい」のような字面になり、語の検査が壊れる
    expect(texts.join("\n")).not.toContain("じだい");
  });

  it("head・style・コメントは 印刷に出ないので 見ない", () => {
    // fixture の head/style には わざと「タイトル」「不正解」を入れてある
    const texts = extractManuscriptTexts(
      manuscript(`<!-- 9: タイの けしき --><div class="slide"><p>こんにちは</p></div>`),
    );
    expect(texts).toEqual(["こんにちは"]);
  });

  it("rt の閉じタグが 省略されていても、読みだけを除く（HTML5 では省略が合法）", () => {
    // Chromium は省略でも正しく描くので、原稿としては通ってしまう形。
    // ここで次の </rt> まで飲み込むと、間の本文が検査から静かに消える。
    const texts = extractManuscriptTexts(
      manuscript(
        `<div class="slide"><p><ruby>時代<rt>じだい</ruby>は ここから <ruby>始<rt>はじ</rt></ruby>まる</p></div>`,
      ),
    );
    expect(texts).toEqual(["時代は ここから 始まる"]);
  });

  it("属性値の中の > で タグの除去が 壊れない", () => {
    const texts = extractManuscriptTexts(
      manuscript(`<div class="slide"><p title="人 > AI">こんにちは</p></div>`),
    );
    expect(texts).toEqual(["こんにちは"]);
  });

  it("一覧に無いブロックタグ（header/main など）でも 行が貼り付かない", () => {
    // 貼り付くと カタカナ境界のガードが狂い、国名検査が黙る（逆の誤検出もある）
    const texts = extractManuscriptTexts(
      manuscript(`<header>タイ</header><main>ランチが 好きです</main>`),
    );
    expect(texts).toEqual(["タイ", "ランチが 好きです"]);
  });

  it("CSS の content: の文字列は 印字されるので 検査対象に入れる", () => {
    // 実原稿の .pageno::before { content: counter(slide) " / 22" } が現用の経路。
    // justify-content: center のような値は 拾わない
    const html = `<!doctype html><html><head><style>
      .x { justify-content: center; }
      .pageno::before { content: counter(slide) " / 22"; }
      .bad::after { content: "だから ダメです"; }
    </style></head><body><div class="slide"><p>こんにちは</p></div></body></html>`;
    const texts = extractManuscriptTexts(html);
    expect(texts).toContain("だから ダメです");
    expect(texts).toContain("/ 22");
    expect(texts).not.toContain("center");
    const findings = checkManuscript("f.html", html);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("ダメです");
  });

  it("br や ブロックの閉じで 行を分け、別の行の字を 貼り付けない", () => {
    const texts = extractManuscriptTexts(
      manuscript(`<div class="slide"><div>アメリカ<br />約566万</div><div>べつの 行</div></div>`),
    );
    expect(texts).toContain("アメリカ");
    expect(texts).toContain("約566万");
    expect(texts).toContain("べつの 行");
  });

  it("実体参照（&amp; など）は 元の字に 戻す", () => {
    const texts = extractManuscriptTexts(manuscript(`<div class="slide"><p>Q&amp;A</p></div>`));
    expect(texts).toEqual(["Q&A"]);
  });
});

describe("原稿の 禁止語（規律1）", () => {
  /*
   * 禁止語は 2026-09-03 に 「ダメです」「ダメだ」の 2語だけに なった
   *（AGENTS.md 規律1）。**「不正解」「間違いです」は もう 禁止語では ない**——
   * 判定が 要る 場面で ぼかす 方が 害だから。見本の 語を 差しかえただけで、
   * 見て いる もの（ルビ分断・前後の 添え）は 前と 同じ。
   */
  it("ルビで 分断されていても 捕まえる（rt を除くのは このため）", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide"><p><ruby>ダメ<rt>だめ</rt></ruby>です</p></div>`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
    expect(findings[0]?.message).toContain("ダメです");
  });

  it("判定そのもの（「不正解です」）は 通す — ぼかす 方が 害（2026-09-03）", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(
        `<div class="slide"><p>この こたえは 不正解です。正しい こたえは 3つです。</p></div>`,
      ),
    );
    expect(findings).toHaveLength(0);
  });

  it("どこに出たかが分かるよう、前後を添えて出す", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide"><p>この こたえは ダメです。つぎへ。</p></div>`),
    );
    expect(findings[0]?.message).toContain("つぎへ");
  });
});

describe("原稿の 国名（規律9）", () => {
  it("「タイ」は error（教材データと同じ判定を共用する）", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide"><p>タイに 行きます</p></div>`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
  });

  it("「タイトル」「タイプ」のような カタカナ語は 拾わない", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide"><p>タイトルを 書きます。タイプを えらびます。</p></div>`),
    );
    expect(findings).toEqual([]);
  });

  it("アメリカ・中国 は 通す（ai_jidai の実データが 使っている）", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(
        `<div class="slide"><p>アメリカの <ruby>会社<rt>かいしゃ</rt></ruby>と <ruby>中国<rt>ちゅうごく</rt></ruby>の <ruby>会社<rt>かいしゃ</rt></ruby></p></div>`,
      ),
    );
    expect(findings).toEqual([]);
  });

  it("タイ以外の 国名（ベトナム など）は 何も言わない", () => {
    /*
     * 2026-08-23 の 是正。前は「新しい 国名は 事前に 確認」で warn を 出して いたが、
     * 規律9 が 禁じて いるのは **タイだけ**で、国名を 出さないのは まなびマップの
     * 見せかたの 話だった（src/lib/content-checks.ts の 覚書）。
     */
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide"><p>ベトナムの 話を します</p></div>`),
    );
    expect(findings).toEqual([]);
  });
});

describe("きれいな原稿は 何も出ない", () => {
  it("ルビ直書き・図・英語チップの ある ふつうの原稿", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide">
        <div class="kicker">AIの <ruby>時代<rt>じだい</rt></ruby></div>
        <h1><ruby>仕事<rt>しごと</rt></ruby>は どう <ruby>変<rt>か</rt></ruby>わるか</h1>
        <span class="en-chip">PM = Project Manager</span>
        <img src="img/01.jpg" alt="" />
        <div class="pageno"></div>
      </div>`),
    );
    expect(findings).toEqual([]);
  });
});
