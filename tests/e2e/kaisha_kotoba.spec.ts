import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * 会社を知る の ことば — **一段目は 1行、二段目で 初級・中級・上級**（願い #280）
 *
 * ユーザーの ことば（2026-08-31）:
 *   「初級・中級・上級などのセットのものは一つにまとめてください（会社を知る、報連相：連絡）」
 *   →「会社を知るを選ぶと、初級・中級・上級が選択できるようにしてください。
 *      まとめるの伝え方が悪かったです」
 *
 * つまり **まとめるのは 一覧の 行**で、セットを 消す ことでは ない。
 *
 * 見るのは 5つ:
 *  - ステージトップの ことばの 行が **1つ**（初級・中級・上級が 3行 ならばない）
 *  - `/wordtest/kaisha` は **えらぶ 画面**で、セットが ぜんぶ ならぶ
 *  - `/wordtest` の 一覧も 1ステージ 1行。押すと えらぶ 画面へ 移る
 *  - 名前が 変わる 前の URL（`/arcade/...`）が 同じ ところへ つながる
 *  - **センテンスの セットが 遊べる**（長い ひとことでも 画面から はみ出さない）
 */

/**
 * セットの 数は **教材から 読む**（画面の 数字を ベタ書きしない）。
 * 先生が セットを 足しても 減らしても、この 検査は そのまま 生きる。
 */
const STAGE = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "content", "stages", "kaisha.json"), "utf8"),
) as { wordStageIds: string[] };

test("ステージトップの ことばは 1行だけ（行き先は ステージID）", async ({ page }) => {
  await page.goto("/kaisha");

  const cards = page.locator('a[href^="/wordtest/"]');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("href", "/wordtest/kaisha");

  // セット名の 札（初級・中級・上級）は ここには 出ない——えらぶのは 押した 先
  for (const label of ["初級", "中級", "上級"]) {
    await expect(cards.first()).not.toContainText(label);
  }
});

/**
 * セット名の 札は ルビが 合成される ので、字は「初しょ級きゅう」と つながる。
 * `"初級"` の ベタ一致では 引けない——あいだを ゆるく 見る
 *（同じ わなを `docs/skills/browser_e2e_verification.md` に 書いて ある）。
 */
const LEVELS = [/初.*級/, /中.*級/, /上.*級/];

async function expectSetChooser(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { name: "ことばの セットを えらぶ" })).toBeVisible();
  // ならぶ 数は ステージが 持って いる セットの 数
  await expect(page.getByText(/ことば \d+こ ／ 合格 \d+%/)).toHaveCount(STAGE.wordStageIds.length);
  for (const level of LEVELS) {
    await expect(page.getByRole("button", { name: level })).toHaveCount(1);
  }
}

test("ステージIDで 開くと セットを えらぶ 画面に なる", async ({ page }) => {
  await page.goto("/wordtest/kaisha");
  await expectSetChooser(page);
});

test("一覧の「会社を 知る」を 押すと、初級・中級・上級が 出る", async ({ page }) => {
  await page.goto("/wordtest");

  /*
   * 一覧は 1ステージ 1行。見出しには ルビが 合成される ので、
   * 通しの 字では 引けない——目じるしの ことばだけを 見る。
   */
  const rows = page.getByRole("button", { name: /会社/ });
  await expect(rows).toHaveCount(1);
  await rows.first().click();

  // えらぶ 画面は **同じ ページの 中**で 開く（一覧へ 1歩で 戻れる）
  await expect(page).toHaveURL(/\/wordtest$/);
  await expectSetChooser(page);
});

test("名前が 変わる 前の URL も 同じ ところへ つながる", async ({ page }) => {
  await page.goto("/arcade/kaisha");
  await expect(page).toHaveURL(/\/wordtest\/kaisha$/);

  await page.goto("/arcade");
  await expect(page).toHaveURL(/\/wordtest$/);
});

test("センテンスの セットが 遊べて、長い ひとことが 画面に 収まる", async ({ page }) => {
  await page.goto("/wordtest/stage23_kaisha_jokyu");

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
