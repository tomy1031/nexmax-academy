/**
 * 事前調査の 模擬サイト（`public/tools/youken/research.html`）が、たいわの
 * `research.pages` と **同じ 中身**で あることを 見張る。
 *
 * ## なぜ 同じ ものが 2つ あるのか
 * `scenarioSchema` は `research`（模擬ページ3枚・クイズ3問・findings）を 必ず 持つ
 * 決まりだが、いまの たいわの 画面（`src/components/listening/live-mode.tsx`）は
 * `client` / `interview.reqs` / `mission.goal` / `lesson.points` しか 描かない——
 * **調査の 層は 学習者に 一度も 出ない**。要件定義の 教材は「調べる → 足りない ことを
 * 聞く」の 往復が 本体なので、調査を 出さないと 教材が 半分に なる。
 *
 * そこで 当面は リンク教材（`content/links/youken_research.json` →
 * `public/tools/youken/research.html`）で 出す。**同じ 文が 2か所に ある**ので、
 * 先生が JSON だけを 直したときに 画面が 古いまま 残る——それを ここで 止める。
 *
 * たいわの 画面が `research` を 描けるように なったら、この テストごと
 * リンク教材を 消す。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scenarioSchema } from "../src/content/schema";

const ROOT = join(import.meta.dirname, "..");

const scenario = scenarioSchema.parse(
  JSON.parse(readFileSync(join(ROOT, "content/scenarios/youken_aoba.json"), "utf8")),
);
const html = readFileSync(join(ROOT, "public/tools/youken/research.html"), "utf8");

describe("事前調査の 模擬サイト", () => {
  it("3枚 とも、たいわの research.pages と 同じ 本文が 載って いる", () => {
    expect(scenario.research.pages).toHaveLength(3);
    for (const page of scenario.research.pages) {
      expect(html, `「${page.tab}」の 本文が ずれて いる`).toContain(page.html);
      expect(html, `「${page.tab}」の タブ名が 無い`).toContain(page.tab);
      expect(html, `「${page.tab}」の URL が 無い`).toContain(page.url);
    }
  });

  it("秘匿情報（reqs の キーワード）を 1つも 載せて いない", () => {
    // 規律6。たいわ側は lint:content が 見て いるが、こちらは 検査の 外に ある。
    for (const req of scenario.interview.reqs) {
      for (const keyword of req.keywords) {
        if (keyword.length < 2) continue;
        expect(html, `${req.id}（${req.label}）の「${keyword}」が 調査ページに ある`).not.toContain(
          keyword,
        );
      }
    }
  });
});
