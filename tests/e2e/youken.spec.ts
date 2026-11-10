import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * 要件定義（youken・地図の STEP11）— 旧アプリの 流れ（7.整理 → 8.デザイン・9.ワイヤー → 10.解答）
 *
 * 2026-11-10 の 指定「STEP11要件定義の内容がもとのnextmake-onboardingの内容と異なります」
 *「デザインのページは特にいきなり答えを言っていたり、画像の内容とテキストの内容がチグハグです」。
 * 見るのは 3つ:
 *  1. 要件を 整理する ページは 書きこむ 欄（A〜D）を 出し、模範の 答え（給与の 金額）は 出さない
 *  2. デザインの ページは ブランドの 決まり・ページ構成の 絵を 出さない（答えの 先出しを しない）。
 *     えらんだ 理由を 書く 欄と、ネクストメイクの 例（ワイヤーフレーム）が ある
 *  3. こたえの ページに だけ、ブランドの 決まり 4枚と ページ構成の 絵が 出る
 * どれも 390px で 横に はみ出さず、ルビの 外に 裸の 漢字が 無い（規律2）。
 */

/** content/stages/youken.json の 並び（関門を 開けて おく）。 */
const BEFORE_DOC = [
  "youken_matcha",
  "youken_hearing",
  "youken_hearing_check",
  "youken_skit",
  "youken_aoba",
];

const ANSWER_IMAGES = ["design_1", "design_2", "design_3", "design_4", "page_content_1"];

async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

function imagesNamed(page: Page, name: string) {
  return page.locator(`img[src*="${name}"]`);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("要件を 整理する ページ: 書きこむ 欄が 5つ あり、模範の 答えは 出ない", async ({
  page,
  context,
}) => {
  await seedCompleted(context, BEFORE_DOC);
  await page.goto("/youken/article-youken_doc");

  await expect(page.getByTestId("article-form")).toHaveCount(5);
  await expect(page.getByTestId("form-field-a_riyuu")).toBeVisible();
  await expect(page.getByTestId("form-field-d_nouki")).toBeAttached();
  // 模範の 要件定義書は こたえの ページへ 移した（書く 前に 見せない）
  await expect(page.getByText(/300,000/)).toHaveCount(0);
  for (const name of ANSWER_IMAGES) await expect(imagesNamed(page, name)).toHaveCount(0);

  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await shot(page, "youken-01-doc");
});

test("デザインの ページ: 答えの 絵を 出さず、えらんだ 理由を 書く 欄と ワイヤーの 例が ある", async ({
  page,
  context,
}) => {
  await seedCompleted(context, [...BEFORE_DOC, "youken_doc"]);
  await page.goto("/youken/article-youken_design");

  for (const name of [...ANSWER_IMAGES, "page_component"]) {
    await expect(imagesNamed(page, name)).toHaveCount(0);
  }
  await expect(page.getByTestId("form-field-d_riyuu")).toBeVisible();
  await expect(imagesNamed(page, "wireflame")).toHaveCount(1);

  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await shot(page, "youken-02-design");
});

test("こたえの ページ: ブランドの 決まり 4枚と ページ構成の 絵が 出て、ふりかえりを 書ける", async ({
  page,
  context,
}) => {
  await seedCompleted(context, [...BEFORE_DOC, "youken_doc", "youken_design"]);
  await page.goto("/youken/article-youken_kotae");

  for (const name of ANSWER_IMAGES) await expect(imagesNamed(page, name)).toHaveCount(1);
  await expect(imagesNamed(page, "page_component")).toHaveCount(3);
  await expect(page.getByText(/300,000/).first()).toBeVisible();
  await expect(page.getByTestId("form-field-k_onaji")).toBeAttached();

  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await shot(page, "youken-03-kotae");
});
