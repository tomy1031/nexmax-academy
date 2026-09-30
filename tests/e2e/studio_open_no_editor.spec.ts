import { expect, test, type Page } from "@playwright/test";
import { seedAdmin, shot } from "./helpers";

/**
 * 管理画面の ステージ編集 — エディタの 無い 教材の「✎ ひらく」
 *
 * 2026-09-30 まで スキット・クエスト・リンク・タイピングの 行は 押しても 何も 起きなかった
 *（`openContent` の switch に case が 無かった）。たいわと 同じく、開けない 理由と
 * 直す 場所（content/ の JSON）を 知らせに 出す。
 *
 * 保存は 押さない（デモモードでは そもそも 保存できないが、押す 理由も 無い）。
 */

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

/**
 * 開けない ときの 知らせ（下に 出る トースト）。デモモードでは「ほぞん・こうかいは
 * じゅんびちゅう」も role=status で 常に 出ているので、文言で 分ける。
 */
function noEditorToast(page: Page) {
  return page.getByRole("status").filter({ hasText: "まだ スタジオで 直せません" });
}

/** ながれ の 1行（参照ID で 引く。題名が 出るかは 一覧の 作りしだいなので 当てにしない）。 */
async function openFlowRow(page: Page, ref: string) {
  const row = flowItems(page).filter({ hasText: ref });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "✎ ひらく" }).click();
}

test.beforeEach(async ({ context }) => {
  await seedAdmin(context);
});

const CASES = [
  { stageId: "houkoku", ref: "houkoku_skit", label: "スキット", dir: "content/skits" },
  { stageId: "kaihatsu", ref: "waterfall_quest", label: "クエスト", dir: "content/quests" },
  { stageId: "kaisha", ref: "nextmake_gakushu_site", label: "リンク", dir: "content/links" },
  {
    stageId: "houkoku-kiku",
    ref: "houkoku_kanryou_typing",
    label: "タイピング",
    dir: "content/typing",
  },
] as const;

for (const { stageId, ref, label, dir } of CASES) {
  test(`${label}の「✎ ひらく」は 開けない 理由と ${dir} を 知らせる`, async ({ page }) => {
    await openStage(page, stageId);
    await openFlowRow(page, ref);

    await expect(noEditorToast(page)).toHaveText(
      `${label}は まだ スタジオで 直せません（${dir} の JSON で 作ります）。`,
    );
    // 知らせを 出すだけで、ステージの 編集からは 動かない。
    await expect(page.getByRole("heading", { name: "③ この ステージの ながれ" })).toBeVisible();
    await shot(page, `studio-open-${stageId}-${ref}`);
  });
}

test("たいわの「✎ ひらく」は これまでと 同じ 知らせ", async ({ page }) => {
  await openStage(page, "youken");
  await openFlowRow(page, "youken_aoba");

  await expect(noEditorToast(page)).toHaveText(
    "たいわは まだ スタジオで 直せません（content/scenarios の JSON で 作ります）。",
  );
});

test("エディタの ある ページは これまでどおり 編集画面が 開く", async ({ page }) => {
  await openStage(page, "houkoku");
  await openFlowRow(page, "houkoku_lecture");

  await expect(page.getByRole("heading", { name: "ブロック" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "③ この ステージの ながれ" })).toHaveCount(0);
  await expect(noEditorToast(page)).toHaveCount(0);
});
