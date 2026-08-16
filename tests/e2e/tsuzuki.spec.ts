import { expect, test } from "@playwright/test";
import {
  expectQuizCorrect,
  fillWordBank,
  goNextQuestion,
  itemsBefore,
  KAISHA,
  seedCompleted,
  shot,
} from "./helpers";

/**
 * 途中で 離れても、つづきから — もんだい（quizset）の しおり
 *
 * 授業の チャイムで 中断した 班が、次に 開くと また 1問目から だった
 * （`src/lib/quiz/resume.ts` の 経緯）。**直った ことでは なく、直った ままである ことを**
 * 機械が 見張る。教材の 並びを 1つ 足しただけで しおりの 前提は 崩れうる。
 */

test("2問 答えて 離れ、もどると「つづきから」が 出る", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(3));

  await page.goto(KAISHA.quiz2.path);
  await page.getByRole("button", { name: "はじめる" }).click();

  await fillWordBank(page, ["ホームページや アプリ"]);
  await expectQuizCorrect(page);
  await goNextQuestion(page);
  await fillWordBank(page, ["大阪", "東京"]);
  await expectQuizCorrect(page);
  await goNextQuestion(page);
  await expect(page.getByText("もんだい 3 / 9")).toBeVisible();

  // ステージへ 離脱（進み具合には「とちゅう」として 出る）
  await page.goto("/kaisha");
  await expect(page.getByText("6つ の うち 3つ おわりました")).toBeVisible();
  await expect(page.locator("ol > li").nth(3)).toContainText("とちゅう");

  // もどると ロビーで 分かれ道を 見せる（つづきから／はじめから）
  await page.goto(KAISHA.quiz2.path);
  await expect(page.getByText("まえの つづきから はじめます")).toBeVisible();
  await expect(page.getByText("2もん こたえました")).toBeVisible();
  await shot(page, "21-quiz-resume");

  await page.getByRole("button", { name: "つづきから" }).click();
  await expect(page.getByText("もんだい 3 / 9")).toBeVisible();
});

test("「はじめから やる」を えらべば 1問目に もどる", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(3));

  await page.goto(KAISHA.quiz2.path);
  await page.getByRole("button", { name: "はじめる" }).click();
  await fillWordBank(page, ["ホームページや アプリ"]);
  await expectQuizCorrect(page);
  await goNextQuestion(page);

  await page.goto(KAISHA.quiz2.path);
  await page.getByRole("button", { name: "はじめから やる" }).click();
  await expect(page.getByText("もんだい 1 / 9")).toBeVisible();
});
