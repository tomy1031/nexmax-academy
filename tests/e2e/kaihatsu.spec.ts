import { expect, test } from "@playwright/test";
import { shot } from "./helpers";

/**
 * 開発の 工程の クエスト（ウォーターフォール クエスト）を 通しで 遊ぶ
 *
 * 見張るのは **ゲーム風UIが 出て いる こと**。2026-08-31 の 移植は 仕組み
 *（HP・レベル・リスク・4択・解説）は 正しく 移したのに、**見た目だけ**
 * サイトの カードに 直して しまい、遊びの 手ざわりが 消えて いた
 *（2026-09-01「ゲーム風UIが 売りです」）。単体テストは 仕組みしか 見ないので、
 * **画面の 見た目は ここでしか 守れない**。
 *
 *  1. タイトル（WATER FALL QUEST）→ はじめる が 押せる
 *  2. 遊ぶ 画面に **黒地の ゲーム画面**・PARTY・COMMAND・敵の 絵が 出る
 *  3. 会話 → 4択 → **解説** の 順に 進み、解説を 飛ばせない
 *  4. 工程の 図（PROCESS CHART）が 開く
 *  5. 390px で 横に あふれない
 */

const QUEST = "/kaihatsu/quest";

test("クエストが ゲーム風UIで 遊べる", async ({ page }) => {
  await page.goto(QUEST);

  // 1) タイトル
  await expect(page.getByText("WATER FALL")).toBeVisible();
  const start = page.locator('[data-quest="start"]');
  await expect(start).toBeEnabled();
  await shot(page, "kaihatsu-quest-title");
  await start.click();

  // 2) 黒地の ゲーム画面
  const shell = page.locator('[data-quest="shell"]');
  await expect(shell).toBeVisible();
  await expect(page.getByText("PARTY")).toBeVisible();
  await expect(shell.locator("svg").first()).toBeVisible(); // 敵の 絵
  await expect(page.locator('[data-quest="log"]')).toBeVisible();

  // 3) 会話 → 4択
  for (let i = 0; i < 8; i += 1) {
    const options = page.locator('[data-quest="option"]');
    if (await options.count()) break;
    await page.locator('[data-quest="next"]').first().click();
  }
  const options = page.locator('[data-quest="option"]');
  await expect(options.first()).toBeVisible();
  await shot(page, "kaihatsu-quest-command");

  // 4択を 押すと **解説**が 出る（押した ぶん 札が 減る）
  const before = await options.count();
  await options.first().click();
  await expect(page.locator('[data-quest="next"]')).toBeVisible();
  await page.locator('[data-quest="next"]').first().click();
  const after = await page.locator('[data-quest="option"]').count();
  expect(after).toBeLessThan(before);

  // 4) 工程の 図
  await page.locator('[data-quest="process"]').click();
  await expect(page.getByText("PROCESS CHART")).toBeVisible();
  await shot(page, "kaihatsu-quest-process");
});

test("390px で 横に あふれない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(QUEST);
  await page.locator('[data-quest="start"]').click();
  await expect(page.locator('[data-quest="shell"]')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

/**
 * ステージへ 戻れる。2026-09-01 に ここで Error 1102（Worker の 上限）が 出た。
 * 原因は 1回の 読み込みで **全教材を zod に かけて** いた こと（`src/lib/content.ts`）。
 * 画面の 上では「押したら ステージが 出る」だけなので、ここで 見張る。
 */
test("クエストから ステージへ もどれる", async ({ page }) => {
  await page.goto(QUEST);
  await page.getByRole("link", { name: /ステージに もどる/ }).click();
  await expect(page).toHaveURL(/\/kaihatsu$/);
  // 中の 教材への 行き先が 出て いれば ステージが 描けて いる
  //（見出しは ルビで 分かれる ので 文字では 探さない）
  await expect(page.locator('a[href="/kaihatsu/article"]').first()).toBeVisible();
});
