import { expect, test } from "@playwright/test";

/**
 * 「はじめに」の ことばが 学習者に とどいて いるか
 *
 * 決めごとは 3つ（2026-08-19/20 の指定）:
 *  - ことばは **1枚**（グループが 2つ 付いていても まとめて 出す）
 *  - 見出しは **ステージの 名前**（「〜の ことば」に しない）
 *  - ことばは **教材より 先**に 置く
 */

test("ことばは 教材より 先に、1枚だけ 出る", async ({ page }) => {
  await page.goto("/intro");

  const words = page.getByRole("heading", { name: "🕹️ さいしょに ことばを おぼえる" });
  const contents = page.getByRole("heading", { name: "📚 この ステージで やること" });
  await expect(words).toBeVisible();
  await expect(contents).toBeVisible();

  // 画面の 上から 見て、ことばの ほうが 先に ある
  const wordsY = (await words.boundingBox())!.y;
  const contentsY = (await contents.boundingBox())!.y;
  expect(wordsY).toBeLessThan(contentsY);

  const cards = page.locator('a[href^="/arcade/"]');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("href", "/arcade/intro");
  await expect(page.getByText("ことば 44こ")).toBeVisible();
});

test("単語ゲームの 見出しは「はじめに」", async ({ page }) => {
  await page.goto("/arcade/intro");

  /*
   * 見出しが **ちょうど「はじめに」**であること（「はじめに の ことば」に 戻らない）。
   * 見るのは 見出しだけ——説明文の「IT の ことばです」は 正しい 文なので 巻きこまない。
   */
  await expect(page.getByRole("heading", { name: "はじめに", exact: true })).toBeVisible();
  await expect(page.getByText("ことば 44こ ／ 1回の もんだい 44こ ／ 合格 80%")).toBeVisible();

  // 「もんだいだけ」＝ 入力なしの 意味クイズ（ひらがな入力チェックを はさまない）
  await page.getByRole("button", { name: /もんだいだけ/ }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 15_000 });
});

test("単語ステージの 古い URL も 同じ まとまりに つながる", async ({ page }) => {
  await page.goto("/arcade/intro_kotoba");
  await expect(page.getByText("ことば 44こ ／ 1回の もんだい 44こ ／ 合格 80%")).toBeVisible();
});
