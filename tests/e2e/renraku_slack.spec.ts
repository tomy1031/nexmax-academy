import { expect, test, type Locator, type Page } from "@playwright/test";
import { shot } from "./helpers";

/**
 * Renraku Master（連絡ステージの Slack の 練習・public/tools/hourensou/renraku_slack.html）の 正誤の 見せ方
 *
 * 2026-10-30 の 指定「正解不正解が分かりにくいので、もう少し間違いを強調したり、
 * 次のクリックをするのに間を置けるように」。前は 正解を 押すと 何も 出さずに 次の 問いへ 切り替わり、
 * 次の 問いの 選択肢が 同じ 場所に 出るので 続けて 押して しまって いた。見張るのは:
 *  1. まちがえた 選択肢に ❌ 不正解 と わけが 出て、点が 減る。ほかの 選択肢は 少しの あいだ 押せない
 *  2. 正解の 選択肢に ⭕ 正解 と わけが 出て、**「次へ」を 押すまで 次の 問いに 進まない**
 *  3. 「次へ」を 待って いる あいだに 開き直すと、次の 問いから（正解の 行は 下書きに 残る）
 *
 * 静的な ページなので、アプリの 画面を 通さずに 直に 開く。
 */

const PAGE = "/tools/hourensou/renraku_slack.html";

async function openFirstQuestion(page: Page) {
  await page.goto(PAGE);
  await page.getByRole("button", { name: "了解です。対応します。" }).click();
  await page.locator("#channel-list button", { hasText: "project-a" }).click();
  await expect(page.locator(".option-card")).toHaveCount(3);
}

/** ルビの 読みを 外した 字（「不正解ふせいかい」に しない）。 */
async function plain(locator: Locator): Promise<string> {
  return locator.evaluate((node) => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("rt").forEach((rt) => rt.remove());
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

test("まちがえると ❌ 不正解 と わけが 出て、ほかの 選択肢は 少し 押せない", async ({ page }) => {
  await openFirstQuestion(page);
  const cards = page.locator(".option-card");

  await cards.nth(0).click();
  const wrong = cards.nth(0);
  expect(await plain(wrong.locator(".verdict"))).toBe("❌ 不正解");
  // わけの 文は 頭の「不正解。」を 外す（しるしと 2回 言わない）
  const reason = await plain(wrong.locator(".feedback-msg"));
  expect(reason).toContain("関係者全員");
  expect(reason).not.toMatch(/^不正解/);
  await expect(page.locator("#score-display")).toHaveText("95");

  // 押した すぐ あとは ほかの 選択肢も 押せない → 少し たつと 押せる。まちがえた 選択肢は 押せない まま
  await expect(cards.nth(1)).toBeDisabled();
  await expect(cards.nth(2)).toBeDisabled();
  await shot(page, "renraku-slack-01-wrong");
  await expect(cards.nth(1)).toBeEnabled({ timeout: 5_000 });
  await expect(cards.nth(2)).toBeEnabled();
  await expect(wrong).toBeDisabled();
  await expect(page.locator("#score-display")).toHaveText("95");
});

test("正解すると ⭕ 正解 と わけが 出て、「次へ」を 押すまで 進まない", async ({ page }) => {
  await openFirstQuestion(page);
  const cards = page.locator(".option-card");
  const step = page.locator("#action-area").getByText(/^Step \d\/3$/);
  await expect(step).toHaveText("Step 1/3");

  await cards.nth(1).click();
  const right = cards.nth(1);
  expect(await plain(right.locator(".verdict"))).toBe("⭕ 正解");
  const reason = await plain(right.locator(".feedback-msg"));
  expect(reason).toContain("@here か @channel");
  expect(reason).not.toMatch(/^正解/);
  // 正解の 行は すぐ 入力欄に 入る。点は 減らない
  await expect(page.locator("#draft-text")).toContainText("@here");
  await expect(page.locator("#score-display")).toHaveText("100");
  // ほかの 選択肢は 押せない
  await expect(cards.nth(0)).toBeDisabled();
  await expect(cards.nth(2)).toBeDisabled();

  const next = page.getByRole("button", { name: "次へ" });
  await expect(next).toBeVisible();
  await shot(page, "renraku-slack-02-correct");
  // 待っても 勝手に 進まない（前は すぐ 次の 問いに 切り替わって いた）
  await page.waitForTimeout(2_000);
  await expect(step).toHaveText("Step 1/3");

  await next.click();
  await expect(step).toHaveText("Step 2/3");
  await expect(page.locator(".verdict")).toHaveCount(0);
  await expect(cards.nth(0)).toBeEnabled();
});

test("最後の 問いの「次へ」で 送信の ボタンが 出る", async ({ page }) => {
  await openFirstQuestion(page);
  const cards = page.locator(".option-card");
  const next = page.getByRole("button", { name: "次へ" });
  // ミッション1の 正解は 2番め・3番め・2番め
  for (const at of [1, 2, 1]) {
    await cards.nth(at).click();
    await next.click();
  }
  await expect(page.getByRole("button", { name: "送信する (Send)" })).toBeVisible();
});

test("「次へ」を 待って いる ときに 開き直すと、次の 問いから", async ({ page }) => {
  await openFirstQuestion(page);
  await page.locator(".option-card").nth(1).click();
  await expect(page.getByRole("button", { name: "次へ" })).toBeVisible();

  await page.reload();
  await expect(page.locator("#action-area").getByText(/^Step \d\/3$/)).toHaveText("Step 2/3");
  await expect(page.locator("#draft-text")).toContainText("@here");
  await expect(page.locator(".verdict")).toHaveCount(0);
});
