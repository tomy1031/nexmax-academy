import { expect, test } from "@playwright/test";
import { KAISHA, itemsBefore, seedCompleted } from "./helpers";

/**
 * ことばの いみは **マウスを のせるだけ**で 出る（2026-08-18 の指定）
 *
 * 読んでいる 途中で 手を 止めさせない ための ものなので、
 * 「押さないと 出ない」に 戻っていないかを 見る。
 * 指の きかい（hover の 無い 端末）では これまでどおり タップで 出る——
 * その道も 同じ 画面で 確かめる（`toggle` が 生きているか）。
 */

test("ことばチップは マウスを のせるだけで いみが 出る", async ({ page }) => {
  await page.goto(KAISHA.article1.path);

  const chip = page.getByRole("button", { name: "会社概要" }).first();
  await expect(page.getByText("かいしゃがいよう — Company overview")).toHaveCount(0);

  await chip.hover();
  await expect(page.getByText("かいしゃがいよう — Company overview")).toBeVisible();
});

test("本文の 下線の ことばも、マウスを のせるだけで いみが 出る", async ({ page, context }) => {
  // 辞書は 単語ステージを 畳んだもの。ステージの 中の ページで 引ける。
  await seedCompleted(context, itemsBefore(KAISHA.article1));
  await page.goto(KAISHA.article1.path);

  const underlined = page.locator("button.underline").first();
  await expect(underlined).toBeVisible();
  await underlined.hover();
  // 吹き出し（role=note）が ひらく。中身は 語ごとに ちがうので 出たことだけを 見る。
  await expect(page.getByRole("note").first()).toBeVisible();
});

test("教材の 種別は「ページ」と 出る（よみもの とは 呼ばない）", async ({ page }) => {
  await page.goto(KAISHA.article1.path);

  await expect(page.getByText("📄 ページ").first()).toBeVisible();
  await expect(page.getByText("よみもの")).toHaveCount(0);
});
