import { expect, test } from "@playwright/test";
import { KAISHA, affinity, itemsBefore, readOn, seedCompleted } from "./helpers";

/**
 * 対話ゲームを 途中で 閉じても、好感度が 0 に 戻らない（願い #177）
 *
 * 「画面更新などした 場合でも 途中から プレイできる ように して ほしい」
 *（2026-08-21 の 指定・docs/constraints.md）。教室の 回線は ゆらぐ ので、
 * **開き直しは たまに 起きる ことでは なく、よく 起きる こと**。
 * ここが 崩れると、見つける ものを 見つけて 60% まで 来た 人が 一瞬で 0% に 戻る。
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
});

/**
 * 「はじめから」も 置く（2026-08-31 の 指定）
 *
 * しおりが あると「つづきから」しか 無く、もう一度 はじめから 話したい 人は
 * **好感度が 残った 部屋に 座り直す**しか なかった。
 */
test("しおりが あっても「はじめから」で 0% に 戻せる", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
  await page.goto(KAISHA.meetingMatsui.path);
  await page.getByRole("button", { name: "はじめる ▶" }).click();
  await readOn(page);

  await page
    .getByLabel("文字で 答える")
    .fill("カンボジアの プログラムが おもしろいと 思いました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "つぎへ ▶" }).click();
  expect(await affinity(page)).toBeGreaterThan(0);

  await page.reload();
  // しおりが ある ときは **2つとも** 出る
  await expect(page.getByRole("button", { name: "つづきから 話す ▶" })).toBeVisible();
  const fresh = page.getByRole("button", { name: "はじめから" });
  await expect(fresh).toBeVisible();

  await fresh.click();
  await readOn(page);
  expect(await affinity(page)).toBe(0);

  // しおりも 消える（つぎに 開いた ときに「つづきから」が 出ない）
  await page.reload();
  await expect(page.getByRole("button", { name: "はじめる ▶" })).toBeVisible();
  await expect(page.getByRole("button", { name: "はじめから" })).toHaveCount(0);
});

/**
 * 用意された セリフは **作り置きの 音**で 鳴る（2026-08-31 の 指定
 *「開いた ときに 音声が 再生される ように」「用意された セリフは 全て 音声化」）。
 *
 * 実際に 鳴ったかは headless では 測りにくい ので、**画面が 音を 取りに 行った こと**を
 * 通信で 見る。ここが 切れると、鍵の 無い 学習者は また 字だけに 戻る。
 */
test("はじめると、社長の 第一声の 音を 取りに 行く", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
  const asked: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/audio/meetings/kaisha_matsui/")) asked.push(req.url());
  });
  await page.goto(KAISHA.meetingMatsui.path);
  await page.getByRole("button", { name: "はじめる ▶" }).click();
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(asked[0]).toContain("opening.wav");
});
