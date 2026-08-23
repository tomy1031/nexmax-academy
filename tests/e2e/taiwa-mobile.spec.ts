import { expect, test } from "@playwright/test";
import { KAISHA, itemsBefore, readOn, seedCompleted, shot } from "./helpers";

/**
 * 対話ゲームを **実機の 幅（390px）**で 見る（願い #177）
 *
 * 舞台（背景＋立ち絵＋セリフ枠）は 広い 画面を 前提に 作りやすい。1280px でだけ
 * 確かめて いると、**学習者の スマホでだけ 文が 枠から はみ出す**——横に スクロールが
 * 出た 画面は、そこで 読むのを あきらめられる。
 *
 * ここで 見るのは 2つ:
 * 1. 横に はみ出して いない（`scrollWidth` が 画面の 幅を 超えない）
 * 2. 進む ための ボタンと 入力欄が、たたまれずに 見えて いる
 */
test("スマホの 幅でも、対話ゲームの 字が 枠から はみ出さない", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
  await page.goto(KAISHA.meetingMatsui.path);

  const noOverflow = async () => {
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over).toBeLessThanOrEqual(1);
  };

  // ロビー
  await expect(page.getByRole("button", { name: "はじめる ▶" })).toBeVisible();
  await noOverflow();
  await page.waitForTimeout(400);
  await shot(page, "13-taiwa-mobile-lobby");

  // 社長の ことば → 自分の ばん
  await page.getByRole("button", { name: "はじめる ▶" }).click();
  await readOn(page);
  await expect(page.getByLabel("文字で 答える")).toBeVisible();
  await noOverflow();
  await page.waitForTimeout(700);
  await shot(page, "13-taiwa-mobile-ask");

  // 見かたの 板（観点の 内訳）
  await page.getByLabel("文字で 答える").fill("カンボジアの プログラムが おもしろかったです。");
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(page.getByText(/こうかんど \+\d+%/)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "つぎへ ▶" })).toBeVisible();
  await noOverflow();
  await page.waitForTimeout(700);
  await shot(page, "13-taiwa-mobile-feedback");
});
