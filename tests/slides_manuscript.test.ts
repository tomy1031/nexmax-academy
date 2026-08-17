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
  it("ルビで 分断されていても 捕まえる（rt を除くのは このため）", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide"><p><ruby>間違<rt>まちが</rt></ruby>いです</p></div>`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("error");
    expect(findings[0]?.message).toContain("間違いです");
  });

  it("どこに出たかが分かるよう、前後を添えて出す", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide"><p>この こたえは 不正解です。つぎへ。</p></div>`),
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

  it("合意済みの アメリカ・中国 は 通す（ai_jidai の実データが 使っている）", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(
        `<div class="slide"><p>アメリカの <ruby>会社<rt>かいしゃ</rt></ruby>と <ruby>中国<rt>ちゅうごく</rt></ruby>の <ruby>会社<rt>かいしゃ</rt></ruby></p></div>`,
      ),
    );
    expect(findings).toEqual([]);
  });

  it("あたらしい国名（ベトナム など）は warn で 確認を うながす", () => {
    const findings = checkManuscript(
      "f.html",
      manuscript(`<div class="slide"><p>ベトナムの 話を します</p></div>`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("warn");
    expect(findings[0]?.message).toContain("ユーザーへ確認");
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
