import { expect, test } from "@playwright/test";

/**
 * 「はじめに」の ことばステージが 学習者に とどいて いるか
 *
 * データを 足しただけの 変更なので、こわれるとしたら **道**（ステージ →
 * ことばアーケード）である。カードが 出るか、押した先で 1問 目が 出るかを 見る。
 */

test("「はじめに」に ビジネスと IT の ことばカードが 出る", async ({ page }) => {
  await page.goto("/intro");

  await expect(page.getByRole("heading", { name: "🕹️ ことばで あそぶ" })).toBeVisible();
  await expect(page.getByRole("link", { name: /ビジネスの ことば/ })).toHaveAttribute(
    "href",
    "/arcade/intro_bijinesu_kotoba",
  );
  await expect(page.getByRole("link", { name: /IT の ことば/ })).toHaveAttribute(
    "href",
    "/arcade/intro_it_kotoba",
  );
});

const STAGES = [
  { id: "intro_bijinesu_kotoba", title: "ビジネスの ことば", words: 12 },
  { id: "intro_it_kotoba", title: "IT の ことば", words: 13 },
] as const;

for (const stage of STAGES) {
  test(`/arcade/${stage.id} で 意味クイズの 1問目まで 行ける`, async ({ page }) => {
    await page.goto(`/arcade/${stage.id}`);

    // モードを えらぶ画面（語数・出題数・合格ラインが データどおり か）
    await expect(
      page.getByText(`ことば ${stage.words}こ ／ 1回の もんだい 10こ ／ 合格 80%`),
    ).toBeVisible();

    // 「もんだいだけ」＝ 入力なしの 意味クイズ。ひらがな入力チェックを はさまない
    await page.getByRole("button", { name: /もんだいだけ/ }).click();

    await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 15_000 });
  });
}
