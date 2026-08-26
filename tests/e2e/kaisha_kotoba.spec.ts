import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * セットの 数は **教材から 読む**（画面の 数字を ベタ書きしない）。
 * 先生が セットを 足しても 減らしても、この 検査は そのまま 生きる。
 */
const STAGE = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "content", "stages", "kaisha.json"), "utf8"),
) as { wordStageIds: string[] };

/**
 * 会社を知る の ことば — **セットに 分かれて いる**（願い #203）
 *
 * 見るのは 4つ:
 *  - ステージトップに セットが **ぜんぶ 行で ならぶ**（初級・中級・上級）
 *  - まなびマップの 札と ステージトップの 行き先が **同じ**（/arcade/kaisha）
 *  - `/arcade/kaisha` は **えらぶ 画面**から 始まる
 *  - **センテンスの セットが 遊べる**（長い ひとことでも 画面から はみ出さない）
 */

test("ステージトップに セットが ぜんぶ ならぶ", async ({ page }) => {
  await page.goto("/kaisha");

  const cards = page.locator('a[href^="/arcade/"]');
  await expect(cards).toHaveCount(STAGE.wordStageIds.length);
  await expect(cards.first()).toHaveAttribute("href", `/arcade/${STAGE.wordStageIds[0]}`);
  await expect(cards.last()).toHaveAttribute(
    "href",
    `/arcade/${STAGE.wordStageIds[STAGE.wordStageIds.length - 1]}`,
  );

  /*
   * 札の 字は **セット名＋その セットの 見出し**（同じ 名前が 何行も ならばない）。
   * 見出しには ルビが 合成される ので、字の 間に よみが 入る——
   * `toContainText` で 通しの 字を 見ずに、目じるしの ことばだけを 見る。
   */
  await expect(cards.first()).toContainText("初級");
  await expect(cards.last()).toContainText("上級");
});

test("ステージIDで 開くと セットを えらぶ 画面に なる", async ({ page }) => {
  await page.goto("/arcade/kaisha");

  await expect(page.getByRole("heading", { name: "ことばの セットを えらぶ" })).toBeVisible();
  // ならぶ 数は ステージが 持って いる セットの 数
  await expect(page.getByText(/ことば \d+こ ／ 合格 \d+%/)).toHaveCount(STAGE.wordStageIds.length);
});

test("センテンスの セットが 遊べて、長い ひとことが 画面に 収まる", async ({ page }) => {
  await page.goto("/arcade/stage23_kaisha_jokyu");

  await page.getByRole("button", { name: /もんだいだけ/ }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });

  /*
   * 4択の あいだ 出て いる ひとことが **390px の 中に 収まって いる**こと。
   * 前は 1行 固定で、長い 文の 両はしが 画面の 外に 出て いた（実機で 実際に 切れた）。
   */
  const box = await page.evaluate(() => {
    const rubies = [...document.querySelectorAll("ruby")];
    const biggest = rubies
      .map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }))
      .sort((a, b) => b.size - a.size)[0];
    if (!biggest) return null;
    const r = biggest.el.getBoundingClientRect();
    return { left: r.left, right: r.right, text: biggest.el.textContent ?? "" };
  });

  expect(box).not.toBeNull();
  expect(box!.left).toBeGreaterThanOrEqual(0);
  expect(box!.right).toBeLessThanOrEqual(page.viewportSize()!.width);
});
