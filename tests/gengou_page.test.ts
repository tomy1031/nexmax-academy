import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { KANJI } from "@/lib/text/furigana";

/**
 * 元号の 説明（public/tools/hourensou/gengou.html・2026-10-26）を 機械で 見る。
 *
 * 1枚の 静的な ページなので `npm run lint:content` が 中身を 見ない。ここで 見るのは:
 *  1. 読めない 漢字が 残って いないか（{漢字|よみ} の 書き忘れ。規律2）
 *  2. 見せて いる プログラムが ほんとうに 正しく 動くか（境目の 日と 元年）
 *  3. 禁止語・使わない 国名（規律1・規律9）
 */

const HTML_PATH = join("public", "tools", "hourensou", "gengou.html");
const HTML = readFileSync(HTML_PATH, "utf8");

/** 画面に 出る 文（<head>・スクリプト・コメント・<pre> の コードを 落とし、タグを はずす）。 */
function visibleText(): string {
  return HTML.replace(/<head>[\s\S]*?<\/head>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script>[\s\S]*?<\/script>/g, "")
    .replace(/<pre[\s\S]*?<\/pre>/g, "")
    .replace(/<[^>]+>/g, "");
}

const MARK = /\{([^{}|]+)\|([^{}|]+)\}/g;

/** <pre> の 中の コード（HTML の 文字参照を もどす）。 */
function code(): string {
  const pre = HTML.match(/<pre id="code"[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? "";
  return pre
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/** コードを 動かして toWareki と、console.log に 出した 行を 取る。 */
function runCode(): { toWareki: (y: number, m: number, d: number) => string; logs: string[] } {
  const logs: string[] = [];
  const toWareki = new Function("console", `${code()}\nreturn toWareki;`)({
    log: (line: string) => logs.push(line),
  });
  return { toWareki, logs };
}

describe("元号の 説明ページ", () => {
  it("読めない 漢字が 残って いない（規律2）", () => {
    const outside = visibleText().replace(MARK, "");
    const bare = [...outside].filter((char) => KANJI.test(char));
    expect(bare.join("")).toBe("");
  });

  it("ふりがなの 書き方が くずれて いない（{ } が 残らない）", () => {
    const outside = visibleText().replace(MARK, "");
    expect(outside).not.toMatch(/[{}]/);
  });

  it("コードの 例の 答えが、コメントに 書いた とおり", () => {
    const { logs } = runCode();
    const expected = [...code().matchAll(/console\.log\(.*\);\s+\/\/ (.+)$/gm)].map(
      (hit) => hit[1],
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(logs).toEqual(expected);
  });

  it("境目の 日と 元年を 正しく 出す", () => {
    const { toWareki } = runCode();
    expect(toWareki(2019, 4, 30)).toBe("平成31年4月30日");
    expect(toWareki(2019, 5, 1)).toBe("令和元年5月1日");
    expect(toWareki(1989, 1, 7)).toBe("昭和64年1月7日");
    expect(toWareki(1989, 1, 8)).toBe("平成元年1月8日");
    expect(toWareki(1926, 12, 25)).toBe("昭和元年12月25日");
    expect(toWareki(2026, 10, 26)).toBe("令和8年10月26日");
    expect(toWareki(2005, 4, 1)).toBe("平成17年4月1日");
    expect(toWareki(1985, 6, 1)).toBe("昭和60年6月1日");
    expect(toWareki(1926, 12, 24)).not.toMatch(/昭和|平成|令和/);
  });

  it("ためして みよう の 答えの 漢字は、ふりがなの 表（READINGS）に ある 字だけ", () => {
    const { toWareki } = runCode();
    const answers = [toWareki(2019, 5, 1), toWareki(2026, 10, 26), toWareki(1989, 1, 7)];
    const rest = answers.join("").replace(/令和|平成|昭和|元年|年|月|日/g, "");
    expect([...rest].filter((char) => KANJI.test(char))).toEqual([]);
  });

  it("禁止語と 使わない 国名が 無い（規律1・規律9）", () => {
    const text = visibleText().replace(MARK, "$1");
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      expect(text, `禁止語「${word}」が ある`).not.toContain(word);
    }
    expect(checkCountryNamesInTexts(HTML_PATH, [text]).map((finding) => finding.message)).toEqual(
      [],
    );
  });
});
