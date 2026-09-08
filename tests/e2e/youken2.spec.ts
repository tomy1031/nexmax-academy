import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, joinCall, seedCompleted, shot } from "./helpers";

/**
 * アプリの 要件定義（youken2）— **3人の たいわ**を 鍵ゼロで 通す
 *
 * 見るのは 3つ:
 *  1. 5段（ミッション → しらべる → しつもんメモ → インタビュー）を 文字だけで 歩ける
 *  2. **担当では ない 人**に 聞くと 札は 開かず、だれが くわしいかが 出る。
 *     🎤 を 担当へ 向けて 聞き直すと 開き、その人の 台本の 返事が 字幕に 出る
 *  3. 390px でも 横に はみ出さず、ルビの 外に 裸の 漢字が 無い（規律2）
 *
 * Live（Gemini）は 無い 前提。判定は ことばの 照合だけで 決まる ので、何度 走らせても 同じ。
 */

/** たいわの 手前に ある 関門の 教材（content/stages/youken2.json の 並び）。 */
const BEFORE_TALK = [
  "youken2_ichinengo",
  "youken2_hearing",
  "youken2_hearing_check",
  "youken2_kinou",
  "youken2_skit",
];

const ZAIKO = "在庫は 今 どう 数えて いますか";

async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

test("3人の たいわ: 担当を えらんで 聞くと 札が 開く（鍵ゼロ・390px）", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCompleted(context, BEFORE_TALK);
  await page.goto("/youken2/talk");

  // 1) ミッション → しらべる
  await page.getByRole("button", { name: /すすむ →$/ }).click();
  await noOverflow(page);
  await shot(page, "youken2-01-research");
  // 調査クイズ 3もん（答えは 模擬ページに ある）
  for (const answer of [/Instagramの DM/, /本社/, /クメール/]) {
    await page.getByRole("button", { name: answer }).click();
    await page.getByRole("button", { name: "つぎへ" }).click();
  }
  await page.getByRole("button", { name: /しつもんメモへ/ }).click();

  // 2) しつもんメモは 人ごとの 欄
  await expect(page.getByLabel("山本に 聞く こと")).toBeVisible();
  await expect(page.getByLabel("佐々木に 聞く こと")).toBeVisible();
  await expect(page.getByLabel("田中に 聞く こと")).toBeVisible();
  await page.getByLabel("田中に 聞く こと").fill(ZAIKO);
  await noOverflow(page);
  await shot(page, "youken2-02-memo");
  await page.getByRole("button", { name: /ミーティングに/ }).click();

  // 3) ロビー → 入室。3人 ＋ 自分
  await expect(page.getByText("はなす まえに")).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await joinCall(page);
  await expect(page.getByRole("radiogroup", { name: "だれに 話しかけるか" })).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await shot(page, "youken2-03-room");

  // 4) 社長に 在庫を 聞く → 開かない。だれが くわしいかが 出る
  await page.getByLabel("しつもんを 入力する").fill(ZAIKO);
  await page.getByRole("button", { name: "きく" }).click();
  await expect(page.getByText(/くわしいよ/).first()).toBeVisible();
  await expect(page.getByText(/（0 \/ 12）/)).toBeVisible();
  await shot(page, "youken2-04-wrong-person");

  // 5) 🎤 を 店長へ → 同じ 質問で 開く。店長の 台本の 返事が 字幕に 出る
  await page.getByRole("radio", { name: /田中/ }).click();
  await page.getByLabel("しつもんを 入力する").fill(ZAIKO);
  await page.getByRole("button", { name: "きく" }).click();
  await expect(page.getByText(/（1 \/ 12）/)).toBeVisible();
  // 記録は 3行（あなた×2 ＋ 店長の 台本の 返事）。会話が 始まった あとも ルビの 外に 裸の 漢字が 無い
  await expect(page.getByLabel("会話の 記録").locator(".card-island")).toHaveCount(3);
  expect(await bareKanjiTexts(page)).toEqual([]);
  await noOverflow(page);
  await shot(page, "youken2-05-opened");

  // ヒントは 2段（だれに・何の こと → 言い方）
  await page.getByRole("button", { name: /ヒントを 1つ もらう/ }).click();
  await expect(page.getByRole("button", { name: /言い方も 見る/ })).toBeVisible();

  // 6) けっかへ。近道からでも「お礼を 言いましたか」の 一呼吸が 入る。人ごとの 数が 出る
  await page.getByRole("button", { name: /けっかを/ }).click();
  await page.getByRole("button", { name: /けっかへ/ }).click();
  await expect(page.getByText("1 / 12", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "人ごとの 数" })).toBeVisible();
  await shot(page, "youken2-06-result");
});

/** ステージの 画面に ルビの 外の 裸の 漢字が 無い（新しい 教材 7本の 入口）。 */
const SCREENS = [
  "/youken2",
  "/youken2/article-youken2_ichinengo",
  // `/youken2/listening` は 入れない。リスニングの 再生画面が 自分で 出す 字
  //（「ここに 注目して 聞きます」など）に ルビが 無く、教材では なく 共有の 部品の 話（別タスク）。
  "/youken2/article-youken2_kinou",
  "/youken2/skit",
  "/youken2/article-youken2_doc",
];

for (const path of SCREENS) {
  test(`ルビの 外に 裸の漢字が 無い — ${path}`, async ({ page, context }) => {
    await seedCompleted(context, [...BEFORE_TALK, "youken2_aoba_app"]);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await bareKanjiTexts(page)).toEqual([]);
  });
}
