import { expect, test } from "@playwright/test";
import {
  answerKeyword,
  expectQuizCorrect,
  fillWordBank,
  goNextQuestion,
  itemsBefore,
  KAISHA,
  readTestResult,
  seedCompleted,
  seedQuizBookmark,
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

/**
 * しおりだけが 残って いた ときの 回（`resume.ts` の 規則5）。
 *
 * 内訳が 無くても 位置は 戻す——中断した 人を 1問目に 戻さない ため。ただし その回は
 * **見て いない 問題を 残した まま 最後に 着く**ので、2問 答えただけで「全問正解・合格」が
 * 成績に 固まって いた（成績は 初回だけが 正式＝あとから 直せない）。位置は 戻す・点は
 * 数えない、を 機械が 見張る。
 */
test("しおりだけで 途中から 始めた 回は、最後まで 行っても 成績に しない", async ({
  page,
  context,
}) => {
  await seedCompleted(context, itemsBefore(3));
  // 9問の 教材の 8問目に しおりだけが 残って いる（答えの 内訳は 無い）
  await page.goto("/kaisha");
  await seedQuizBookmark(page, KAISHA.quiz2.id, 7);

  await page.goto(KAISHA.quiz2.path);
  // 内訳が 無いので「0もん こたえました」とは 言わない
  await expect(page.getByText("8もんめ から はじめます")).toBeVisible();
  await page.getByRole("button", { name: "つづきから" }).click();
  await expect(page.getByText("もんだい 8 / 9")).toBeVisible();

  await answerKeyword(page, "ぶんかです");
  await expectQuizCorrect(page);
  await goNextQuestion(page);
  await answerKeyword(page, "ほうこくします");
  await expectQuizCorrect(page);
  await goNextQuestion(page);

  // 2問 とも 正解でも、9問の 教材を 通した ことには しない
  await expect(page.getByText("2 / 2 もん")).toBeVisible();
  await expect(page.getByText("まだ やって いない もんだいが 7もん あります")).toBeVisible();
  // 「合格！ つぎの ステージへ」とは 言わない（残りが ある のに 済んだ 顔を しない）
  await expect(page.getByText("ここまで すすんだね")).toBeVisible();
  await expect(page.getByText("合格！")).toHaveCount(0);
  await shot(page, "22-quiz-bookmark-run");
  expect(await readTestResult(page, KAISHA.quiz2.id)).toBeNull();

  // ステージの 進み具合も「おわった」に しない（3つ のまま・その教材は とちゅう）
  await page.goto("/kaisha");
  await expect(page.getByText("6つ の うち 3つ おわりました")).toBeVisible();
  await expect(page.locator("ol > li").nth(3)).toContainText("とちゅう");
});

test("そこから「もう一度」で 1問目から 通せば、成績に 残る", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(3));
  await page.goto("/kaisha");
  await seedQuizBookmark(page, KAISHA.quiz2.id, 7);

  await page.goto(KAISHA.quiz2.path);
  await page.getByRole("button", { name: "つづきから" }).click();
  await answerKeyword(page, "ぶんかです");
  await goNextQuestion(page);
  await answerKeyword(page, "ほうこくします");
  await goNextQuestion(page);

  // けっかの 画面から 1問目へ 帰る（誘い文の とおりに 押せる）
  await page.getByRole("button", { name: "もう一度" }).click();
  await expect(page.getByText("もんだい 1 / 9")).toBeVisible();

  for (const words of [
    ["ホームページや アプリ"],
    ["大阪", "東京"],
    ["2018"],
    ["受託開発"],
    ["エンジニア"],
  ]) {
    await fillWordBank(page, words);
    await goNextQuestion(page);
  }
  for (const written of [
    "くるまの かいしゃです",
    "にほんごの きょういく",
    "ぶんかです",
    "ほうこくします",
  ]) {
    await answerKeyword(page, written);
    await goNextQuestion(page);
  }

  await expect(page.getByText("9 / 9 もん")).toBeVisible();
  expect(await readTestResult(page, KAISHA.quiz2.id)).toMatchObject({
    stageId: KAISHA.quiz2.id,
    total: 9,
    passed: true,
  });

  await page.goto("/kaisha");
  await expect(page.getByText("6つ の うち 4つ おわりました")).toBeVisible();
});
