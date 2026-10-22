import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seedAdmin, shot } from "./helpers";

/**
 * 管理画面の ステージ編集 — スキット・クエスト・リンク・タイピングを「保存ずみ」と 見る
 *
 * 2026-09-30 まで スタジオの 教材一覧に この 4種が 入って おらず、ステージの ながれで
 * 「まだ ほぞんして いません — …学習者には 出ません。」と 誤って 出ていた
 *（実際は 学習者に 出ている）。「もう ある ものから えらぶ」にも 出なかった。
 *
 * 保存は 押さない（デモモードでは そもそも 保存できないが、押す 理由も 無い）。
 */

const WARNING = "まだ ほぞんして いません";

/** 種別 → content/ の 置き場。 */
const DIRS = { typing: "typing", quest: "quests", skit: "skits", link: "links" } as const;
type Kind = keyof typeof DIRS;

function stageRefs(stageId: string, kind: Kind): string[] {
  const stage: { contents: { ref: string; type: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${stageId}.json`), "utf8"),
  );
  return stage.contents.filter((item) => item.type === kind).map((item) => item.ref);
}

/** その種別の git の 教材（id → 題名）。 */
function titles(kind: Kind): Map<string, string> {
  const dir = join("content", DIRS[kind]);
  return new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        const data: { id: string; title: string } = JSON.parse(
          readFileSync(join(dir, name), "utf8"),
        );
        return [data.id, data.title] as const;
      }),
  );
}

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

test.beforeEach(async ({ context }) => {
  await seedAdmin(context);
});

const CASES: { stageId: string; kind: Kind }[] = [
  { stageId: "houkoku-kiku", kind: "typing" },
  { stageId: "kaihatsu", kind: "quest" },
  { stageId: "houkoku", kind: "skit" },
  { stageId: "kaisha", kind: "link" },
];

for (const { stageId, kind } of CASES) {
  test(`${stageId} の ${kind} は 題名で 出て、「まだ ほぞんして いません」が 出ない`, async ({
    page,
  }) => {
    const refs = stageRefs(stageId, kind);
    expect(refs.length).toBeGreaterThan(0);
    await openStage(page, stageId);

    const known = titles(kind);
    for (const ref of refs) {
      const title = known.get(ref);
      expect(title, `${ref} の 題名`).toBeTruthy();
      // 題名の 行には 種別の 名前（span）も 入るので、行の 中に 題名が あるかで 見る。
      const row = flowItems(page).filter({ hasText: ref });
      await expect(row.first()).toContainText(title!);
    }
    await expect(page.getByText(WARNING)).toHaveCount(0);
    if (kind === "typing") await shot(page, `studio-${stageId}-flow`);
  });
}

test("タイピングを「もう ある ものから えらぶ」で 入れられる（入れても 警告が 出ない）", async ({
  page,
}) => {
  await openStage(page, "kaisha");
  const before = await flowItems(page).count();

  await page.getByRole("button", { name: "⌨️ タイピング" }).click();
  const select = page.getByLabel("もう ある タイピングから えらぶ");
  const [id, title] = [...titles("typing")][0]!;
  await expect(select.locator("option", { hasText: `（${id}）` })).toHaveCount(1);
  await select.selectOption(id);
  await page.getByRole("button", { name: "この ステージに 入れる" }).click();

  await expect(flowItems(page)).toHaveCount(before + 1);
  await expect(flowItems(page).last()).toContainText(title);
  await expect(page.getByText(WARNING)).toHaveCount(0);
  await shot(page, "studio-pick-typing");
});
