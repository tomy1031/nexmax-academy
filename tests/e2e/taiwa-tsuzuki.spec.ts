import { expect, test } from "@playwright/test";
import { KAISHA, affinity, itemsBefore, readOn, seedCompleted } from "./helpers";

/**
 * 対話ゲームを 途中で 閉じても、好感度が 0 に 戻らない（願い #177）
 *
 * 「画面更新などした 場合でも 途中から プレイできる ように して ほしい」
 *（2026-08-21 の 指定・docs/constraints.md）。教室の 回線は ゆらぐ ので、
 * **開き直しは たまに 起きる ことでは なく、よく 起きる こと**。
 * ここが 崩れると、5つ 見つけて 60% まで 来た 人が 一瞬で 0% に 戻る。
 */
test("画面を 更新しても、好感度と 見つけた ものが 残る", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
  await page.goto(KAISHA.meetingMatsui.path);
  await page.getByRole("button", { name: "はじめる ▶" }).click();
  await readOn(page);

  await page.getByLabel("文字で 答える").fill("カンボジアの プログラムが おもしろかったです。");
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "つぎへ ▶" }).click();
  const before = await affinity(page);
  expect(before).toBeGreaterThan(0);

  await page.reload();

  // ロビーは「つづきから」に 変わり、いまの 好感度を 見せる
  const again = page.getByRole("button", { name: "つづきから 話す ▶" });
  await expect(again).toBeVisible();
  await expect(page.getByText(`いま こうかんど ${before}%`)).toBeVisible();

  await again.click();
  await readOn(page);
  expect(await affinity(page)).toBe(before);
  await expect(page.getByText("おもしろい 1 / 5")).toBeVisible();
});
