import { expect, test } from "@playwright/test";

/**
 * フラッシュカードの ふりがな ON/OFF（2026-09-29 の 指定）
 *
 * ユーザーの ことば:「単語のwordtestでフラッシュカードのひらがなのON/OFF機能も作成してください」
 *
 * 見るのは 4つ:
 *  - はじめは ON（これまでと 同じ。おもての 語に よみが 出る）
 *  - OFF に すると おもての よみが 消える
 *  - OFF の まま めくると、うらに よみが 出る（答え合わせが できる）
 *  - つぎの カードへ 行っても OFF の まま
 */
test("フラッシュカードの ふりがなを 消して、うらで 答え合わせできる", async ({ page }) => {
  await page.goto("/wordtest/intro");
  await page.getByRole("button", { name: /フラッシュカード/ }).click();

  const card = page.getByRole("button", { name: "カードを めくる" });
  const toggle = page.getByRole("button", { name: /ふりがな (ON|OFF)/ });
  const frontReading = card.locator("rt").first();

  // はじめは ON
  await expect(toggle).toHaveText("ふりがな ON");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(frontReading).toBeVisible();
  const reading = (await frontReading.textContent())?.trim() ?? "";
  expect(reading).not.toBe("");

  // OFF に すると おもての よみが 消える
  await toggle.click();
  await expect(toggle).toHaveText("ふりがな OFF");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(frontReading).toBeHidden();

  // めくると うらに よみが 出る
  await card.click();
  await expect(card.locator("rt", { hasText: reading }).first()).toBeVisible();

  // つぎの カードでも OFF の まま
  await page.getByRole("button", { name: "つぎ →" }).click();
  await expect(toggle).toHaveText("ふりがな OFF");
  await expect(card.locator("rt").first()).toBeHidden();

  // ON に もどせば また 出る
  await toggle.click();
  await expect(card.locator("rt").first()).toBeVisible();
});
