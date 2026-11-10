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

test("デザインの ページ: 答えの 絵を 出さず、山本社長（AI）に 見て もらう 部品と ワイヤーの 例が ある", async ({
  page,
  context,
}) => {
  await seedCompleted(context, [...BEFORE_DOC, "youken_doc"]);
  await page.goto("/youken/article-youken_design");

  for (const name of [...ANSWER_IMAGES, "page_component"]) {
    await expect(imagesNamed(page, name)).toHaveCount(0);
  }
  await expect(page.getByTestId("ai-image-check")).toBeVisible();
  await expect(imagesNamed(page, "wireflame")).toHaveCount(1);

  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await shot(page, "youken-02-design");
});

/*
 * 画像の AI判定（要望 #713）は 授業の 時間だけ 開く。鍵ゼロ（デモモード・CI）は 授業の 外と 同じ
 *「閉じて いる」形に なる——学習者を 止めず、サイトと 理由だけ 保存して、確かめ方を 案内する。
 */
test("デザインの ページ: AIが 使えない ときは 止めずに、サイトと 理由を 保存して こたえの ページを 案内する", async ({
  page,
  context,
}) => {
  await seedCompleted(context, [...BEFORE_DOC, "youken_doc"]);
  await page.goto("/youken/article-youken_design");

  const check = page.getByTestId("ai-image-check");
  await expect(check).toHaveAttribute("data-gate", "closed");
  const closed = page.getByTestId("ai-image-check-closed");
  await expect(closed).toBeVisible();
  // ルビの 読みが 字の あいだに 入るので、ルビの 付かない 語で 見る
  await expect(closed).toContainText("もらえません");
  await expect(closed).toContainText("こたえと くらべる");
  // 閉じて いる ときは 画像を 求めない（送る 先が 無い）
  await expect(check.getByLabel("画像を えらぶ")).toHaveCount(0);

  // 空のまま 押すと、何が 足りないかを はっきり 言う（規律1）
  await check.getByRole("button", { name: "保存する" }).click();
  await expect(check.getByRole("alert")).toHaveCount(2);

  await check.getByLabel("サイトの 名前か URL").fill("https://sankoudesign.com/example");
  await check.getByLabel("えらんだ 理由").fill("しずかで、余白が 広いから です。");
  await check.getByRole("button", { name: "保存する" }).click();

  const entry = page.getByTestId("ai-image-check-entry").first();
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("sankoudesign.com");
  await expect(entry).toContainText("いません");
  await expect(page.getByTestId("ai-image-check-verdict")).toHaveCount(0);

  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await check.scrollIntoViewIfNeeded();
  await shot(page, "youken-02b-design-closed");
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
