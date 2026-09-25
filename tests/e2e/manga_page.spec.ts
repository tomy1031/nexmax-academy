import { expect, test } from "@playwright/test";
import manga from "../../content/manga/renraku_manga.json";
import { bareKanjiTexts, shot } from "./helpers";

/**
 * まんがの ページ絵（`size: "page"`）— カラー漫画の 1ページを 1スライドで 見せる
 *
 * 2026-09-25 の 指定「一般的なカラー漫画の形式」。1枚の 縦長の 絵に 3コマと
 * 吹き出し（漢字は ふりがなつき）が 入る。スマホでは ふりがなまで 読むには 小さいので
 * **タップで 大きく できる**こと、大きく した 画面を **とじて もどれる**ことを 見張る。
 * 絵の 下の セリフ（アプリの ふりがな）も 残る こと（規律2）。
 */

const PATH = "/renraku/manga";
const FIRST = manga.pages[0]!.panels[0]!;

test("ページ絵は 縦長で 出て、タップで 大きく なり、とじて もどれる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PATH);

  const open = page.getByRole("button", { name: "まんがの ページを おおきく する" });
  await expect(open).toBeVisible();
  await expect(open.locator("img")).toHaveAttribute("src", FIRST.image.src);

  // 縦長の わく（2:3）。4:3 の コマの わくに 押しこめない
  const box = await open.boundingBox();
  expect(box && box.height > box.width).toBe(true);

  // 絵の 下の セリフも 出て いる（焼いた 字とは 別に、ふりがな・語彙は ここが 担う）
  const figure = page.locator("figure").first();
  await expect(figure.getByText("ヘンディ").first()).toBeVisible();
  await expect(figure.getByText("テストして").first()).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "manga-page-01-390");

  await open.click();
  const zoom = page.getByTestId("manga-page-zoom");
  await expect(zoom.getByRole("button", { name: "✕ とじる" })).toBeFocused();
  await expect(zoom).toBeVisible();
  // 大きく した 画面は 画面に 固定の 幕なので、ページ全体では なく 見えて いる 範囲で 撮る
  await page.screenshot({ path: "e2e-screens/manga-page-02-zoom.png" });

  // もう 1回 タップで 2ばい（ふりがなまで 読める 大きさ）
  await zoom.getByRole("button", { name: "もっと おおきく する" }).click();
  await expect(zoom.getByRole("button", { name: "もとの おおきさに もどす" })).toBeVisible();
  await page.screenshot({ path: "e2e-screens/manga-page-03-zoom2x.png" });

  // 大きく して いる あいだは ←→ で コマが 変わらない（2ばいでは 横スクロールの キー）
  await page.keyboard.press("ArrowRight");
  await expect(zoom).toBeVisible();
  await expect(page.getByText(`1 / ${manga.pages.length} コマ`)).toBeAttached();

  await zoom.getByRole("button", { name: "✕ とじる" }).click();
  await expect(zoom).toBeHidden();
  await expect(open).toBeFocused();

  // Esc でも 閉じて、フォーカスは ページの ボタンへ 戻る
  await open.click();
  await expect(zoom.getByRole("button", { name: "✕ とじる" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(zoom).toBeHidden();
  await expect(open).toBeFocused();
});
