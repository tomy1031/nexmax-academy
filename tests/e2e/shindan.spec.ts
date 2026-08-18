import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts } from "./helpers";

/**
 * ネクマックス性格診断を 通しで 歩く（デモモード）
 *
 * ## なぜ 画面でも 見るのか
 * `tests/personality_furigana.test.ts` は **台帳の 全文** を 総当たりで 見る。
 * ここは その台帳が **画面に そのまま 出ているか** を 見る——画面が 自分で 出す 文
 *（見出し・ボタン・すすみ具合の 帯）は 台帳に 無いので、そちらは ここでしか 拾えない。
 *
 * ## 鍵ゼロで 歩ける
 * Supabase 未設定なら `/welcome` は ログインずみ として 開く（src/app/welcome/page.tsx）。
 * だから 学習者と 同じ道を、鍵なしで 最初から 最後まで 機械が 歩ける。
 */

/** せっていを 埋めて 20問へ 入る。 */
async function startQuestions(page: Page) {
  await page.goto("/welcome");
  await page.getByPlaceholder("れい：ソク").fill("ソク");
  await page.getByPlaceholder("れい：ソピア").fill("ソピア");
  await page.getByRole("button", { name: /AUPP/ }).click();
  await page.getByRole("button", { name: /1\s*きせい/ }).click();
  await page.getByRole("button").filter({ hasText: "男性" }).first().click();
  await page.getByRole("button", { name: /つぎへ/ }).click();
  await expect(page.getByRole("button", { name: /しつもんを はじめる/ })).toBeVisible();
}

/** Ⓐ を 選び続けて 次の 設問へ。選ぶと 自動で 進む。 */
async function answer(page: Page) {
  await page.locator("fieldset button[aria-pressed]").first().click();
}

test("診断のどの画面にも 裸の漢字が 無い（やさしい日本語）", async ({ page }) => {
  await startQuestions(page);
  expect(await bareKanjiTexts(page)).toEqual([]);

  await page.getByRole("button", { name: /しつもんを はじめる/ }).click();
  for (let index = 0; index < 20; index += 1) {
    expect(await bareKanjiTexts(page), `Q${index + 1}`).toEqual([]);
    await answer(page);
  }

  await page.getByRole("button", { name: /けっかを/ }).click();
  await expect(page.getByRole("heading", { name: /あなたの ネクマックス/ })).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
});

test("日本語モードでも 裸の漢字が 無い", async ({ page }) => {
  await startQuestions(page);
  await page.getByRole("button", { name: /しつもんを はじめる/ }).click();
  await page
    .getByRole("button")
    .filter({ hasText: /^日本語/ })
    .click();

  for (let index = 0; index < 20; index += 1) {
    expect(await bareKanjiTexts(page), `Q${index + 1}（日本語）`).toEqual([]);
    await answer(page);
  }
});

test("ことばメモを 押すと、日本語の 意味が 出る", async ({ page }) => {
  await startQuestions(page);
  await page.getByRole("button", { name: /しつもんを はじめる/ }).click();
  for (let index = 0; index < 10; index += 1) await answer(page);

  // Q11「何かを きめる とき、どちらが 大切ですか。」＝ 語彙メモが 3つ 出る設問。
  const memo = page.locator("button").filter({ hasText: /理由/ }).last();
  await expect(memo).toBeVisible();
  await memo.click();

  const popover = page.getByRole("note");
  await expect(popover).toBeVisible();
  // 4段（日本語・英語・日本語の意味・英語の意味）がそろっている。
  await expect(popover).toContainText("りゆう");
  await expect(popover).toContainText("the reason");
  await expect(popover).toContainText("こたえ");
  // 吹き出しの 意味の 1文にも ふりがなが 振れている（裸の漢字が 増えていない）。
  expect(await bareKanjiTexts(page)).toEqual([]);
});
