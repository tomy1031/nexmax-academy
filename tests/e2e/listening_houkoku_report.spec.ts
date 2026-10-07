import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seedCompleted, shot } from "./helpers";

/**
 * 報告の リスニング 5場面（2026-09-28。`リスニング問題.md` から 作った）
 *
 * 1. 5本とも 報告の リスニングの ステージ（`houkoku-kiku`）に 並び、リスニング → タイピング → もんだい の 順で 開ける
 *    （2026-09-30 の 指定で「報連相：報告」から 移した。古い URL は 新しい ステージへ 送る）
 * 2. **数字・英語の 語も かなで 打って 当たる**（同日の 指定「ひらがなでも 漢字ありでも
 *    どちらも 正しく 機能するように」）。前は「10時」を「じゅうじ」と 打つと 外れた
 * 3. 漢字の 語は 漢字でも かなでも 当たる
 */

const STAGE = "houkoku-kiku";
const SCENES = ["kanryou", "okure", "shougai", "chousa", "chourei"] as const;

function refs(stageId: string = STAGE): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${stageId}.json`), "utf8"),
  );
  return stage.contents.map((item) => item.ref);
}

/** 順番の 関門を 出さない ために、その 教材より 前を 済みに する。 */
function before(ref: string): string[] {
  const all = refs();
  return all.slice(0, all.indexOf(ref));
}

/** 打って、いちばん 新しい 判定の 札を 返す。 */
async function type(page: Page, word: string): Promise<void> {
  const input = page.getByLabel("聞こえた ことばを 入力する");
  await input.fill(word);
  await input.press("Enter");
}

test("5場面は 報告の リスニングの ステージに リスニング → タイピング → もんだい の 順で 並ぶ", () => {
  // 並びは 2026-09-30 の 選択「聴く→打つ→もんだい」。
  // さいごに 全体テスト（2026-10-07。技術調査と 朝礼から 出すので 5場面の 後）
  expect(refs()).toEqual([
    ...SCENES.flatMap((scene) => [
      `houkoku_${scene}_listening`,
      `houkoku_${scene}_typing`,
      `houkoku_${scene}_quiz`,
    ]),
    "houkoku_kiku_test",
  ]);
  // 報告の ステージからは 外れて いる（2つの ステージに 同じ 教材を 並べない）
  const houkoku = refs("houkoku");
  for (const scene of SCENES) {
    expect(houkoku).not.toContain(`houkoku_${scene}_listening`);
    expect(houkoku).not.toContain(`houkoku_${scene}_quiz`);
  }
});

test("報告の ステージに あった ころの URL は、新しい ステージへ 送られる", async ({ page }) => {
  await page.goto("/houkoku/listening-houkoku_kanryou_listening");
  await expect(page).toHaveURL(new RegExp(`/${STAGE}/listening-houkoku_kanryou_listening$`));
});

test("障害の 報告: 「10時」を じゅうじ・10時・十時 の どれで 打っても 原稿が ひらく", async ({
  page,
  context,
}) => {
  const listening = "houkoku_shougai_listening";
  await seedCompleted(context, before(listening));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/${STAGE}/listening-${listening}`);
  await page.getByRole("button", { name: "はじめる" }).click();

  const script = page.locator('[aria-label="原稿"]');
  await expect(script).toBeVisible();
  await expect(script).not.toContainText("10時");

  await type(page, "じゅうじ");
  await expect(script).toContainText("10時");

  // 英語の 語も かなで（API は 字母読み）・漢字の 語も かなで
  await type(page, "えーぴーあい");
  await expect(script).toContainText("API");
  await type(page, "よやく");
  await expect(script).toContainText("予約");

  await script.scrollIntoViewIfNeeded();
  await shot(page, "listening-houkoku-shougai-kana-390");
});

test("調査の 報告: 360円・100GB・S3・GitHub を かなで 打って 当たる", async ({ page, context }) => {
  const listening = "houkoku_chousa_listening";
  await seedCompleted(context, before(listening));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/${STAGE}/listening-${listening}`);
  await page.getByRole("button", { name: "はじめる" }).click();

  const script = page.locator('[aria-label="原稿"]');
  for (const [typed, shown] of [
    ["さんびゃくろくじゅうえん", "360円"],
    ["ひゃくぎがばいと", "100GB"],
    ["えすすりー", "S3"],
    ["ギットハブ", "GitHub"],
  ] as const) {
    await expect(script, shown).not.toContainText(shown);
    await type(page, typed);
    await expect(script, `${typed} → ${shown}`).toContainText(shown);
  }
  await script.scrollIntoViewIfNeeded();
  await shot(page, "listening-houkoku-chousa-kana-390");
});

test("朝礼: 80％ は はちじっぱーせんと（聞こえかたの ゆれ）でも 当たる", async ({
  page,
  context,
}) => {
  const listening = "houkoku_chourei_listening";
  await seedCompleted(context, before(listening));
  await page.goto(`/${STAGE}/listening-${listening}`);
  await page.getByRole("button", { name: "はじめる" }).click();

  const script = page.locator('[aria-label="原稿"]');
  await expect(script).not.toContainText("80％");
  await type(page, "はちじっぱーせんと");
  await expect(script).toContainText("80％");
});

for (const scene of SCENES) {
  test(`${scene}: もんだいが 5問 あり、ページが 開く`, async ({ page, context }) => {
    const quiz = `houkoku_${scene}_quiz`;
    await seedCompleted(context, before(quiz));
    await page.goto(`/${STAGE}/quiz-${quiz}`);
    await page.getByRole("button", { name: "はじめる" }).click();
    await expect(page.getByText("もんだい 1 / 5", { exact: true })).toBeVisible();
  });
}
