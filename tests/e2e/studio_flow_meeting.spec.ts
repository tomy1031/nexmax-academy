import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin, shot } from "./helpers";

/**
 * 管理画面の ステージ編集 —「＋ ふやす」で ミーティングを 入れる
 *
 * 2026-08-13 に ミーティングの エディタと「ステージの 中で あたらしく つくる」処理を
 * 足したのに、「＋ ふやす」の 種別一覧（stage-editor.tsx の FLOW_TYPES）だけ 足し忘れ、
 * 2026-09-30 まで スタジオから ミーティングを 入れられなかった。
 * 「えらぶ＋つくる 両方」を 出す（2026-09-30 ユーザー指定）。
 *
 * 保存は 押さない（デモモードでは そもそも 保存できないが、押す 理由も 無い）。
 */

const WARNING = "まだ ほぞんして いません";

/** ③ ながれ の 並び（ほかの 欄の 一覧と 混ぜない）。 */
function flowItems(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "③ この ステージの ながれ" }) })
    .locator("ol > li");
}

async function openStage(page: Page, stageId: string) {
  await page.goto("/admin/stages");
  const row = page.locator("li").filter({ has: page.getByText(`/${stageId}`, { exact: true }) });
  await row.getByRole("button", { name: "✎ ひらく" }).click();
  await expect(page.getByRole("heading", { name: "③ この ステージの ながれ" })).toBeVisible();
}

/** git の ミーティング 1本（id と 題名）。ステージ「報告」には ミーティングが 無い。 */
function aMeeting(): { id: string; title: string } {
  return JSON.parse(readFileSync(join("content", "meetings", "hajimari_meeting.json"), "utf8")) as {
    id: string;
    title: string;
  };
}

test.beforeEach(async ({ context }) => {
  await seedAdmin(context);
});

test("ミーティングを「もう ある ものから えらぶ」で 入れられる", async ({ page }) => {
  await openStage(page, "houkoku");
  const before = await flowItems(page).count();

  await page.getByRole("button", { name: "💬 ミーティング" }).click();
  const { id, title } = aMeeting();
  const select = page.getByLabel("もう ある ミーティングから えらぶ");
  await expect(select.locator("option", { hasText: `（${id}）` })).toHaveCount(1);
  await select.selectOption(id);
  await page.getByRole("button", { name: "この ステージに 入れる" }).click();

  await expect(flowItems(page)).toHaveCount(before + 1);
  await expect(flowItems(page).last()).toContainText(title);
  await expect(flowItems(page).last()).toContainText("ミーティング");
  // 足した 行だけを 見る（このステージの スキットの 行には、スキットが スタジオの
  // 一覧に まだ 無いので 別の 理由で 出ている — 並行スレッドで 直し中）。
  await expect(flowItems(page).last().getByText(WARNING)).toHaveCount(0);
  await shot(page, "studio-flow-meeting-picked");
});

test("ミーティングを ステージの 中で あたらしく つくれる（エディタが 開く）", async ({ page }) => {
  await openStage(page, "houkoku");

  await page.getByRole("button", { name: "💬 ミーティング" }).click();
  await page.getByRole("button", { name: "＋ あたらしい ミーティングを つくる" }).click();

  await expect(page.getByRole("heading", { name: "あいての 話し方（AIへの 指示）" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "③ この ステージの ながれ" })).toHaveCount(0);
  await shot(page, "studio-flow-meeting-create");
});
