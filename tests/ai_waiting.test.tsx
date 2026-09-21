import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiWaiting, AiWaitingOverlay } from "../src/components/meeting/ai-waiting";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * Gemini を 呼んで いる あいだの ローディング（2026-09-20 の 指定
 *「Gemini 読み込み中は ローディングが 出る ように…Gemini 呼び出し中と わかる ように」）。
 * 2026-09-21 に **画面 ぜんたいを 覆う** 形へ 変えた（マイクで 話す 画面なので、
 * 会話の 記録の 中では 目に 入らず、待って いる あいだに 押せて しまって いた）。
 */
const index = buildFuriganaIndex([["見", "み"]]);

const overlay = () => renderToStaticMarkup(<AiWaitingOverlay doing="見て います" index={index} />);

describe("AiWaitingOverlay — 学習者の 画面", () => {
  it("Gemini の 名前と、動いて いる しるしを 出す", () => {
    expect(overlay()).toContain("Gemini");
    /* 回る 輪（止まって いるのか 動いて いるのかが 読める）。 */
    expect(overlay()).toContain("animate-spin");
  });

  it("画面 ぜんたいを 覆い、ポップアップより 前に 出る", () => {
    const html = overlay();
    expect(html).toContain("fixed inset-0");
    /* ポップアップは z-50・まなびマップの 幕は z-60。それより 前。 */
    expect(html).toContain("z-[70]");
  });

  it("待って いる あいだは さわれない（閉じる ボタンを 置かない）", () => {
    const html = overlay();
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-busy="true"');
    /* 途中で 閉じられると、返事が 来た ときに 画面と 話が 食いちがう。 */
    expect(html).not.toContain("<button");
  });

  it("読み上げにも 出す（見えない 待ちを 作らない）", () => {
    const html = overlay();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("漢字には ふりがなが 付く（学習者の 画面）", () => {
    expect(overlay()).toContain("<rt>み</rt>");
  });

  /*
   * 幕の 字は **教材の 読み辞書が 無い 画面**でも 出る。だから 幕が 自分で 書く
   * ことば（「そのまま おまちください。」）に 漢字を 置かない（規律2）。
   */
  it("幕が 自分で 書く ことばに 裸の 漢字を 置かない", () => {
    const own = renderToStaticMarkup(
      <AiWaitingOverlay doing="" index={buildFuriganaIndex([])} />,
    ).replace(/<[^>]+>/gu, "");
    expect(own).toContain("おまちください");
    expect(own).not.toMatch(/[一-鿿]/u);
  });
});

describe("AiWaiting — 先生の 画面は 行の 中", () => {
  it("幕では なく 1行で 出す（書いて 直す 手を 止めない）", () => {
    const html = renderToStaticMarkup(<AiWaiting doing="きいて います" index={index} />);
    expect(html).toContain("animate-spin");
    expect(html).not.toContain("fixed inset-0");
  });
});
