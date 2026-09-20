import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiWaiting } from "../src/components/meeting/ai-waiting";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * Gemini を 呼んで いる あいだの ローディング（2026-09-20 の 指定
 *「Gemini 読み込み中は ローディングが 出る ように…Gemini 呼び出し中と わかる ように」）。
 */
const index = buildFuriganaIndex([["見", "み"]]);

describe("AiWaiting", () => {
  it("Gemini の 名前と、動いて いる しるしを 出す", () => {
    const html = renderToStaticMarkup(<AiWaiting doing="見て います" index={index} />);
    expect(html).toContain("Gemini");
    /* 回る 輪（止まって いるのか 動いて いるのかが 読める）。 */
    expect(html).toContain("animate-spin");
  });

  it("読み上げにも 出す（見えない 待ちを 作らない）", () => {
    const html = renderToStaticMarkup(<AiWaiting doing="見て います" index={index} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("漢字には ふりがなが 付く（学習者の 画面）", () => {
    const html = renderToStaticMarkup(<AiWaiting doing="見て います" index={index} />);
    expect(html).toContain("<rt>み</rt>");
  });
});
