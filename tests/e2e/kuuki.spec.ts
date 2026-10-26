import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * ステージ「空気を 読む」— まんがの あとに 空気読みゲームを 全画面で 開く
 *
 * ゲームは 別の リポジトリの 静的な ページを そのまま 写した もの
 *（public/tools/kuuki-yomi/）。アプリの 画面からは 中が 見えないので、
 * 「おわった」は ゲームの 中の 合図（nexmax-bridge.js）だけが 運ぶ。
 * 合図の 形は 単体テスト（tests/kuuki_yomi_tool.test.ts）が 見る。ここで 見るのは
 * **本物の iframe 越しに 届くか**——同じ 置き場か・合図が main.js の あとに
 * 読まれて いるか・受け口が 教材の id で 受けるか は、ここでしか 通しで 確かめられない。
 */

const GAME_JS = join(__dirname, "..", "..", "public", "tools", "kuuki-yomi", "js", "stages");
/** ゲームの 50ステージの id（`KY.defineStage({ id: '1-1', … })`。10/23 の 修正版で 足した 問題は `id:'1-4'` と 空白なし）。 */
const STAGE_IDS = readdirSync(GAME_JS)
  .filter((name) => name.endsWith(".js"))
  .flatMap((name) =>
    [...readFileSync(join(GAME_JS, name), "utf8").matchAll(/\bid: ?'(\d-\d+)'/g)].map((m) => m[1]!),
  );

/** ゲームの 端末の 記録（`kuukiyomi-it.v2`）を、指定の ステージだけ 遊んだ 形で 置く。 */
async function seedGame(page: Page, played: readonly string[]) {
  await page.context().addInitScript(
    (ids: string[]) => {
      const best: Record<string, string> = {};
      for (const id of ids) best[id] = "ok";
      window.localStorage.setItem(
        "kuukiyomi-it.v2",
        JSON.stringify({ v: 2, settings: {}, best, name: "", flags: { guide: true } }),
      );
    },
    [...played],
  );
}

async function openGame(page: Page) {
  await page.goto("/kuuki/link");
  /*
   * ゲームは この ステージだけ 関門に して ある（content/stages/kuuki.json の gates: true）。
   * 関門で ないと、まんがの 最後の ページ（ゲームの 案内）に 着いた とたん
   * 「ステージ クリア」の 板が かぶさり、ゲームを 飛ばして 戻れて しまう。
   * だから まんがを 終えて 開いた 時点では、板は 出ない。
   */
  await expect(page.getByRole("dialog", { name: "ステージ クリア" })).toHaveCount(0);
  await page
    .getByRole("button", { name: /ひらく/ })
    .first()
    .click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#scr-title")).toBeVisible();
  return frame;
}

test("ステージの 中は まんが → ゲーム の 順", async ({ page }) => {
  await page.goto("/kuuki");
  // 見出しは ルビ付きで 名前引き できない（「空気くうき」に なる）ので 行き先で 引く
  const manga = page.locator('a[href="/kuuki/manga"]').first();
  const game = page.locator('a[href="/kuuki/link"]').first();
  await expect(manga).toBeVisible();
  await expect(game).toBeVisible();
  const [mangaTop, gameTop] = await Promise.all([manga.boundingBox(), game.boundingBox()]);
  expect(mangaTop!.y).toBeLessThan(gameTop!.y);
  await shot(page, "kuuki-01-stage");
});

test("ゲームは 写した まま 開き、最後の 1ステージを 遊ぶと ✅ に なる", async ({ page }) => {
  expect(STAGE_IDS).toHaveLength(50);
  await seedCompleted(page.context(), ["kuuki_manga"]);
  await seedGame(page, STAGE_IDS.slice(0, -1));

  await openGame(page);
  await shot(page, "kuuki-02-game");
  await expect(page.getByText("✅ おわりました")).toHaveCount(0);

  // 最後の 1ステージの 記録を、ゲームと 同じ 呼び方で 書く（遊び終えた ときと 同じ 道）
  const game = page.frames().find((frame) => frame.url().includes("/tools/kuuki-yomi/"));
  expect(game).toBeTruthy();
  await game!.evaluate((id) => {
    (
      window as unknown as { KY: { store: { recordBest(id: string, grade: string): void } } }
    ).KY.store.recordBest(id, "great");
  }, STAGE_IDS.at(-1)!);

  await expect(page.getByText("✅ おわりました").first()).toBeVisible();
  // ゲームを 終えて はじめて ステージが クリアに なる
  await expect(page.getByRole("dialog", { name: "ステージ クリア" })).toBeVisible();
  await shot(page, "kuuki-03-done");
});

test("前に ぜんぶ 遊んで いた 端末は、開いた だけで ✅ に なる", async ({ page }) => {
  await seedCompleted(page.context(), ["kuuki_manga"]);
  await seedGame(page, STAGE_IDS);
  await openGame(page);
  await expect(page.getByText("✅ おわりました").first()).toBeVisible();
});

for (const path of ["/kuuki", "/kuuki/manga", "/kuuki/link"]) {
  test(`ルビの 外に 裸の漢字が 無い — ${path}`, async ({ page }) => {
    await seedCompleted(page.context(), ["kuuki_manga"]);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await bareKanjiTexts(page)).toEqual([]);
  });
}

/**
 * まんがの ページ絵が **引き伸ばされずに** 出るか（2026-10-16「まんがが縦に引き伸ばされていました」）。
 *
 * ページは ふつうの 漫画と 同じ 縦長（1024×1536）。最初の 版は 絵を 作る 指示が「横長」と
 *「1024×1536」で 食い違い、Codex が 横長で 描いた 絵を 縦長に 引き伸ばして 保存して いた。
 * ファイルの 大きさは 縦長の ままなので、大きさを 見ても 気づけない（引き伸ばしは 中身に ある）。
 * だから ファイルの 縦横比と、**出て いる 絵の 縦横比が 絵そのものと 同じか**を 見る。
 * 中身が 引き伸ばされて いないかは、作った ときに 目で 見る（台帳の 各ページに output を 書く）。
 */
test("まんがの ページ絵は 絵の 縦横比の まま 出る（引き伸ばさない）", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/kuuki/manga");
  const img = page.getByRole("button", { name: "まんがの ページを おおきく する" }).locator("img");
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const { natural, shown } = await img.evaluate((el: HTMLImageElement) => {
    const box = el.getBoundingClientRect();
    return { natural: el.naturalWidth / el.naturalHeight, shown: box.width / box.height };
  });
  expect(natural).toBeCloseTo(1024 / 1536, 2);
  expect(Math.abs(shown - natural)).toBeLessThan(0.03);
  await shot(page, "kuuki-04-manga-390");
});
