import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, joinCall, seedCompleted, shot } from "./helpers";

/**
 * ウェブサイトの 要件定義（youken-web）— **深く 聞く たいわ**を 鍵ゼロで 通す
 *
 * 2026-11-04 の 指定「カードは 最低限。質問は もっと オープンに。決められた 答えを
 * 見つけるだけでは ない 仕組みを」。見るのは 3つ:
 *  1. 「なぜ」と 深く 聞くと、カードは 開かないが「番では ない」とは 言わず、数が 1つ 増える
 *  2. カードの しつもん（目的）は これまでどおり 開く（0 / 8 → 1 / 8）
 *  3. ほかの たいわ（アプリの 要件定義）には 数の チップが 出ない（OPEN_TALK の 外は 変えない）
 *
 * Live（Gemini）は 無い 前提。判定は ことばの 照合だけで 決まる。
 */

const BEFORE_TALK = [
  "youkenweb_story",
  "youkenweb_sado",
  "youkenweb_call",
  "youkenweb_call_check",
  "youkenweb_skit",
];

async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

/** 調査クイズ 3もんを、並びの 番号で 答える（選択肢は ルビで 名前が 割れるので 位置で 押す）。 */
async function answerResearch(page: Page, answers: readonly number[]) {
  for (const at of answers) {
    await page.locator("ul.mt-3.grid > li > button").nth(at).click();
    await page.getByRole("button", { name: "つぎへ" }).click();
  }
}

async function ask(page: Page, text: string) {
  await page.getByLabel("しつもんを 入力する").fill(text);
  await page.getByRole("button", { name: "きく" }).click();
}

test("深く 聞く たいわ: なぜ と 聞くと 数が 増え、カードの しつもんは 開く（鍵ゼロ・390px）", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCompleted(context, BEFORE_TALK);
  await page.goto("/youken-web/talk");

  // ミッション → しらべる（クメール語だけの 投稿・電話・小さい 子ども）
  await page.getByRole("button", { name: /すすむ →$/ }).click();
  await noOverflow(page);
  await shot(page, "youkenweb-01-research");
  await answerResearch(page, [1, 0, 0]);
  await page.getByRole("button", { name: /しつもんメモへ/ }).click();

  // しつもんメモは 二人の 欄
  await expect(page.getByLabel("山本に 聞く こと")).toBeVisible();
  await expect(page.getByLabel("佐々木に 聞く こと")).toBeVisible();
  await page.getByRole("button", { name: /ミーティングに/ }).click();

  await expect(page.getByText("はなす まえに")).toBeVisible();
  await joinCall(page);
  await expect(page.getByRole("radiogroup", { name: "だれに 話しかけるか" })).toBeVisible();
  await expect(page.getByTestId("deep-count")).toContainText("0");
  await expect(page.getByTestId("opinion-count")).toContainText("0");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await shot(page, "youkenweb-02-room");

  // 1) 深い しつもん → カードは 開かない・数が 増える・「番では ない」は 出ない
  await ask(page, "山本社長に お聞きします。なぜ プノンペンに 店を 出すのですか。");
  await expect(page.getByTestId("deep-count")).toContainText("1");
  await expect(page.getByText(/（0 \/ 8）/)).toBeVisible();
  await expect(page.getByText(/番では ないかも/)).toHaveCount(0);
  await shot(page, "youkenweb-03-deep");

  // 2) カードの しつもん → 開く
  await ask(page, "この サイトの 目的は 何ですか");
  await expect(page.getByText(/（1 \/ 8）/)).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await shot(page, "youkenweb-04-opened");
});

test("深く 聞く たいわの 数は、ほかの たいわ（アプリの 要件定義）には 出ない", async ({
  page,
  context,
}) => {
  await seedCompleted(context, [
    "youken2_ichinengo",
    "youken2_hearing",
    "youken2_hearing_check",
    "youken2_kinou",
    "youken2_skit",
  ]);
  await page.goto("/youken2/talk");
  await page.getByRole("button", { name: /すすむ →$/ }).click();
  for (const answer of [/Instagramの DM/, /本社/, /クメール/]) {
    await page.getByRole("button", { name: answer }).click();
    await page.getByRole("button", { name: "つぎへ" }).click();
  }
  await page.getByRole("button", { name: /しつもんメモへ/ }).click();
  await page.getByRole("button", { name: /ミーティングに/ }).click();
  await joinCall(page);
  await expect(page.getByRole("radiogroup", { name: "だれに 話しかけるか" })).toBeVisible();
  await expect(page.getByTestId("deep-count")).toHaveCount(0);
  // 深い しつもんでも これまでどおりの 案内（番では ないかも）
  await ask(page, "なぜ アプリを 作りたいのですか");
  await expect(page.getByTestId("deep-count")).toHaveCount(0);
});

/** ステージの 画面に ルビの 外の 裸の 漢字が 無い。 */
const SCREENS = [
  "/youken-web",
  "/youken-web/article-youkenweb_story",
  "/youken-web/article-youkenweb_sado",
  "/youken-web/skit",
  "/youken-web/quiz-youkenweb_teian",
  "/youken-web/article-youkenweb_doc",
];

for (const path of SCREENS) {
  test(`ルビの 外に 裸の漢字が 無い — ${path}`, async ({ page, context }) => {
    await seedCompleted(context, [...BEFORE_TALK, "youkenweb_zoom", "youkenweb_teian"]);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await bareKanjiTexts(page)).toEqual([]);
  });
}
