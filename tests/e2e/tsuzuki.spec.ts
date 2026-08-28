import { expect, test } from "@playwright/test";
import {
  writeIn,
  KAISHA,
  itemsBefore,
  placeWordsIn,
  progressText,
  seedCompleted,
  shot,
  writtenText,
} from "./helpers";

/**
 * 途中で 離れても、つづきから — もんだい（quizset）の しおり
 *
 * 授業の チャイムで 中断した 班が、次に 開くと また 1問目から だった
 * （`src/lib/quiz/resume.ts` の 経緯）。**直った ことでは なく、直った ままである ことを**
 * 機械が 見張る。教材の 並びを 1つ 足しただけで しおりの 前提は 崩れうる。
 *
 * やりかたの 既定は「まとめて 出す」（先生が 管理画面で 決める）。このモードでは
 * 採点まえの 下書きが 端末に 残るので、**書いた ものが 消えない ことが 生命線**になる。
 */

test("2問 書いて 離れ、もどると「つづきから」が 出る", async ({ page, context }) => {
  const before = itemsBefore(KAISHA.sheet).length;
  await seedCompleted(context, itemsBefore(KAISHA.sheet));

  await page.goto(KAISHA.sheet.path);
  await page.getByRole("button", { name: "はじめる" }).click();

  // ぜんぶ 1ページなので 進まずに 2問 書く（語群と 入力の 両方を またぐ）
  await placeWordsIn(page, "q5", ["観光DX"]);
  await writeIn(page, "q2", "まついさん");
  await expect(page.getByText(writtenText(2))).toBeVisible();

  // ステージへ 離脱（進み具合には「とちゅう」として 出る）
  await page.goto("/kaisha");
  await expect(page.getByText(progressText(before))).toBeVisible();
  await expect(page.locator("ol > li").nth(before)).toContainText("とちゅう");

  // もどると ロビーで 分かれ道を 見せる（つづきから／はじめから）
  await page.goto(KAISHA.sheet.path);
  await expect(page.getByText("まえの つづきから はじめます")).toBeVisible();
  await expect(page.getByText(/2もん/)).toBeVisible();
  await shot(page, "21-quiz-resume");

  await page.getByRole("button", { name: "つづきから" }).click();
  // 書いた ものが 戻って いる
  await expect(page.getByText(writtenText(2))).toBeVisible();
});

test("「はじめから やる」を えらべば 1問目に もどる", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.sheet));

  await page.goto(KAISHA.sheet.path);
  await page.getByRole("button", { name: "はじめる" }).click();
  await placeWordsIn(page, "q5", ["観光DX"]);

  await page.goto(KAISHA.sheet.path);
  await page.getByRole("button", { name: "はじめから やる" }).click();
  await expect(page.getByText(writtenText(0))).toBeVisible();
  await expect(page.getByRole("button", { name: "こたえを 出" })).toHaveCount(0);
});
