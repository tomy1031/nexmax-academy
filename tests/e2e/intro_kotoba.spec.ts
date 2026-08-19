import { expect, test } from "@playwright/test";

/**
 * 「はじめに」の ことばが 学習者に とどいて いるか
 *
 * カードは **1枚**（ことばの グループが 2つ 付いていても まとめて 出す —
 * 2026-08-19 の指定）。データで つながって いるだけの 道なので、
 * カードが 出るか、押した先で 1問目まで 行けるかを 機械が 毎回 確かめる。
 */

test("「はじめに」の ことばカードは 1枚だけ 出る", async ({ page }) => {
  await page.goto("/intro");

  await expect(page.getByRole("heading", { name: "🕹️ ことばで あそぶ" })).toBeVisible();
  const cards = page.locator('a[href^="/arcade/"]');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("href", "/arcade/intro");
  await expect(page.getByText("この ステージの ことば")).toBeVisible();
});

test("/arcade/intro は 2つの グループを まとめて 出す", async ({ page }) => {
  await page.goto("/arcade/intro");

  // はじめに の 25語 ＋ オリエンテーション の 20語
  await expect(page.getByText("ことば 45こ ／ 1回の もんだい 10こ ／ 合格 80%")).toBeVisible();

  // 「もんだいだけ」＝ 入力なしの 意味クイズ（ひらがな入力チェックを はさまない）
  await page.getByRole("button", { name: /もんだいだけ/ }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 15_000 });
});

test("単語ステージの URL は これまでどおり 開ける", async ({ page }) => {
  await page.goto("/arcade/intro_kotoba");
  await expect(page.getByText("ことば 25こ ／ 1回の もんだい 10こ ／ 合格 80%")).toBeVisible();
});
