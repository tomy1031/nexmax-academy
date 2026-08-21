import { expect, test } from "@playwright/test";
import { shot } from "./helpers";

/**
 * ネクマックス図鑑（`/nexmax`）の 見た目を 機械で 見る
 *
 * ## なぜ ここで 見るのか
 * この2つは **台帳の 検査では 出ない**——どちらも「並べ方」と「はみ出し」なので、
 * 画面に して 測らないと 分からない。人の 目でしか 見つからなかった 2件
 *（2026-08-21 の 指摘）を、次からは 機械が 止める。
 *
 * ## 鍵ゼロで 見られる
 * Supabase 未設定なら 関所は 開いたまま（`src/middleware.ts`）。ログイン なしで 開く。
 */

test("図鑑の カードに 男女2体が 並ぶ（左＝男子・右＝女子）", async ({ page }) => {
  await page.goto("/nexmax");
  const card = page.locator("article").first();
  await expect(card).toBeVisible();

  const portraits = card.locator("img");
  await expect(portraits).toHaveCount(2);

  const srcs = await portraits.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLImageElement).src),
  );
  // 左が 男子（`<CODE>.webp`）・右が 女子（`<CODE>_f.webp`）。
  expect(srcs[0]).toMatch(/\/types\/[A-Z]{4}\.webp$/);
  expect(srcs[1]).toMatch(/\/types\/[A-Z]{4}_f\.webp$/);

  // 左右の 順は 座標でも 確かめる（src だけだと 並び替えに 気づけない）。
  const boxes = await portraits.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().left),
  );
  expect(boxes[0]!).toBeLessThan(boxes[1]!);

  await shot(page, "nexmax-図鑑");
});

test("ラベルの ふりがなが 札から はみ出さない", async ({ page }) => {
  await page.goto("/nexmax");

  // ルビの 入る 札を すべて 見る（チーム役割の 札・組の 名前の 札）。
  const overflowing = await page.evaluate(() => {
    const bad: string[] = [];
    for (const rt of Array.from(document.querySelectorAll("rt"))) {
      // 色の 面を 持つ 先祖＝札。地の文の ルビは 対象外。
      const chip = rt.closest("span,h2,h3,p") as HTMLElement | null;
      if (!chip) continue;
      const paint = getComputedStyle(chip).backgroundColor;
      if (paint === "transparent" || paint === "rgba(0, 0, 0, 0)") continue;
      const box = chip.getBoundingClientRect();
      const ruby = rt.getBoundingClientRect();
      // ふりがなの 上端が 札の 上端より 上に 出ていたら はみ出し。
      if (ruby.top < box.top)
        bad.push(`${chip.textContent?.slice(0, 12)} (${Math.round(box.top - ruby.top)}px)`);
    }
    return bad;
  });

  expect(overflowing).toEqual([]);
});
