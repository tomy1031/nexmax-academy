import { expect, test } from "@playwright/test";
import manga from "../../content/manga/renraku_manga.json";

/**
 * まんがの しおり — 開き直したときに どのコマから始まるか
 *
 * 途中で閉じたら そのコマから続ける。最後のコマまで読んだら、次に開いたときは
 * 1コマ目から（2026-10-13 の指定「最終ページにいった場合はリセットして、
 * 最初のページを初期ページとなるように」）。
 */

const PATH = "/renraku/manga";
const COUNT = manga.pages.flatMap((page) => page.panels).length;

test("途中なら続きから、最後まで読んだら 1コマ目から開く", async ({ page }) => {
  await page.goto(PATH);
  await expect(page.getByText(`1 / ${COUNT} コマ`)).toBeVisible();

  // 3コマ目で閉じる → 開き直すと 3コマ目
  await page.getByRole("button", { name: "3 コマめ" }).click();
  await expect(page.getByText(`3 / ${COUNT} コマ`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`3 / ${COUNT} コマ`)).toBeVisible();

  // 最後のコマまで読む → 開き直すと 1コマ目
  await page.getByRole("button", { name: `${COUNT} コマめ` }).click();
  await expect(page.getByText("よみおわり！ おつかれさま")).toBeVisible();
  await page.reload();
  await expect(page.getByText(`1 / ${COUNT} コマ`)).toBeVisible();
  await expect(page.getByText("よみおわり！ おつかれさま")).toBeHidden();

  // 読み直しの途中で閉じたら、また そのコマから続ける
  await page.getByRole("button", { name: "2 コマめ" }).click();
  await page.reload();
  await expect(page.getByText(`2 / ${COUNT} コマ`)).toBeVisible();
});
