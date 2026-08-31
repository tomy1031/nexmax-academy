import { expect, test } from "@playwright/test";

/**
 * 会社を知る の ことば — **セットに 分けず 1つ**（願い #280・2026-08-31）
 *
 * 2026-08-25（願い #203）は 初級・中級・上級を 別々の 行に 出して いた。
 * ユーザーの ことば:「初級・中級・上級などのセットのものは一つにまとめてください
 *（会社を知る、報連相：連絡）」。**1ステージ＝1つの 単語テスト**に なった。
 *
 * 見るのは 4つ:
 *  - ステージトップの ことばの 行が **1つ**（初級・中級・上級の 札が ならばない）
 *  - `/wordtest/kaisha` は **えらぶ 画面を はさまず** やりかた選びから 始まる
 *  - 古い URL（単語ステージID・`/arcade/...`）が 同じ ところへ つながる
 *  - **センテンスが 遊べる**（長い ひとことでも 画面から はみ出さない）
 */

/** モード選び（やりかた選び）の 画面に 居ることの 目じるし。 */
const MODE_BUTTON = /もんだいだけ/;

/** 「ことば 152こ ／ 1回の もんだい 152こ ／ 合格 80%」の 行。 */
const COUNT_LINE = /ことば \d+こ ／ 1回の もんだい \d+こ ／ 合格 \d+%/;

test("ステージトップの ことばは 1行だけ", async ({ page }) => {
  await page.goto("/kaisha");

  const cards = page.locator('a[href^="/wordtest/"]');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("href", "/wordtest/kaisha");

  // セット名の 札（初級・中級・上級）は もう 出ない
  for (const label of ["初級", "中級", "上級"]) {
    await expect(cards.first()).not.toContainText(label);
  }
});

test("ステージIDで 開くと えらぶ 画面を はさまない", async ({ page }) => {
  await page.goto("/wordtest/kaisha");

  await expect(page.getByRole("button", { name: MODE_BUTTON })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ことばの セットを えらぶ" })).toHaveCount(0);

  // 3つの セットの ことばが 1つに 入って いる（いちばん 多い セットより 多い）
  const line = await page.getByText(COUNT_LINE).innerText();
  const count = Number(line.match(/ことば (\d+)こ/)![1]);
  expect(count).toBeGreaterThan(60);
});

test("古い URL は 同じ まとまりに つながる", async ({ page }) => {
  await page.goto("/wordtest/kaisha");
  const expected = await page.getByText(COUNT_LINE).innerText();

  // 単語ステージID（セットに 分かれて いた ころの リンク）
  await page.goto("/wordtest/stage23_kaisha_jokyu");
  await expect(page.getByText(COUNT_LINE)).toHaveText(expected);

  // 名前が「ことばアーケード」だった ころの URL
  await page.goto("/arcade/kaisha");
  await expect(page).toHaveURL(/\/wordtest\/kaisha$/);
  await page.goto("/arcade");
  await expect(page).toHaveURL(/\/wordtest$/);
});

test("センテンスが 遊べて、長い ひとことが 画面に 収まる", async ({ page }) => {
  await page.goto("/wordtest/kaisha");

  await page.getByRole("button", { name: MODE_BUTTON }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });

  /*
   * 4択の あいだ 出て いる ひとことが **390px の 中に 収まって いる**こと。
   * 前は 1行 固定で、長い 文の 両はしが 画面の 外に 出て いた（実機で 実際に 切れた）。
   * 上級の センテンスも いまは この 1つの まとまりに 入って いる。
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
