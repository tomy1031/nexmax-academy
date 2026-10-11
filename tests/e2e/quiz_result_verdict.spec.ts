import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  bareKanjiTexts,
  choiceButtons,
  goNext,
  goToConfirm,
  seedCompleted,
  shot,
  submitAnswers,
} from "./helpers";

/**
 * もんだい（quizset）の けっか画面は **合格か 不合格かを 先に、はっきり 出す**（規律1・台帳 #381）。
 *
 * 前は 合格ラインに 届いても 届かなくても 見出しが「よく できました！」／「ここまで すすんだね」で、
 * 合否を 言って いなかった（`passRate` を 見て いなかった）。単語テストの けっか
 *（`kotoba_marubatsu.spec.ts`）と 同じ 出しかたに そろえる:
 *
 *  1. 見出しは ⭕ 合格 ／ ❌ 不合格（記号と ことばの 両方）
 *  2. 合格ライン（何もん・何%）を 隠さない。不合格なら「あと Nもん」
 *  3. 次の 一手を 1つ（合格→ つぎへ／不合格→「もう一度 やる」で 直す）
 *  4. **関門は 変えない**——不合格でも 枠の「つぎは」は 出る（変えるかは tomy に A/B で 聞いて いる）
 *
 * 教材は 報告（リスニング）の「完了の 報告」の もんだい（4択 5問・合格 60%・まとめて 出す）。
 */

const STAGE = "houkoku-kiku";
const QUIZ = "houkoku_kanryou_quiz";

const quiz: { passRate: number; questions: { answer: number; options: string[] }[] } = JSON.parse(
  readFileSync(join("content", "quizsets", `${QUIZ}.json`), "utf8"),
);
const TOTAL = quiz.questions.length;
const ANSWERS = quiz.questions.map((q) => q.answer);
/** わざと 外す ときの 選択肢（正解の となり）。 */
const WRONG = quiz.questions.map((q) => (q.answer + 1) % q.options.length);

async function seedBefore(context: BrowserContext) {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  const refs = stage.contents.map((item) => item.ref);
  await seedCompleted(context, refs.slice(0, refs.indexOf(QUIZ)));
}

/** 1問ずつ えらんで（まとめて 出す）、さいごに 出す。 */
async function answerQuiz(page: Page, picks: readonly number[]) {
  for (const [i, at] of picks.entries()) {
    await choiceButtons(page).nth(at).click();
    if (i < picks.length - 1) await goNext(page);
    else await goToConfirm(page);
  }
  await submitAnswers(page);
}

async function open(page: Page, context: BrowserContext) {
  await page.setViewportSize({ width: 390, height: 900 });
  await seedBefore(context);
  await page.goto(`/${STAGE}/quiz-${QUIZ}`);
  await page.getByRole("button", { name: "はじめる" }).click();
}

/** 枠（ContentFrame）の「つぎは …」。 */
function frameNext(page: Page) {
  return page.locator("a.btn-game").filter({ hasText: "つぎは" });
}

test("全問 正解で 出すと ⭕ 合格。合格ラインと「つぎへ」が 出る", async ({ page, context }) => {
  await open(page, context);
  await answerQuiz(page, ANSWERS);
  await expect(page.getByText(`${TOTAL} / ${TOTAL} もん`)).toBeVisible();
  await shot(page, "quiz-verdict-pass-390");

  // ルビが 語の 中に 入る（合格ごうかく）ので、見出しは aria-label の 名前で 引く
  await expect(page.getByRole("heading", { name: "合格", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "不合格" })).toHaveCount(0);
  await expect(page.locator('[data-quiz-verdict="pass"]')).toBeVisible();
  await expect(page.getByText(/ライン 3もん（60%）/)).toBeVisible();
  await expect(page.getByText(/もん せいかいで/)).toHaveCount(0);
  // 次の 一手は 1つ（つぎへ）
  // 札の 文には ルビ（下した）が 混ざる ので、かなの 続く ところで 見る
  await expect(page.getByRole("status")).toContainText("ボタンで つぎへ");
  // 中身の ない ことばは 出さない（規律1・2026-09-10）
  await expect(page.getByText("よく できました")).toHaveCount(0);
  await expect(page.getByText("ここまで すすんだね")).toHaveCount(0);
  await expect(page.getByText("よく がんばったね")).toHaveCount(0);

  expect(await bareKanjiTexts(page)).toEqual([]);
});

test("全問 外して 出すと ❌ 不合格。あと 何もんかと「もう一度 やる」が 出て、関門は 変えない", async ({
  page,
  context,
}) => {
  await open(page, context);
  await answerQuiz(page, WRONG);
  await expect(page.getByText(`0 / ${TOTAL} もん`)).toBeVisible();
  await shot(page, "quiz-verdict-fail-390");

  await expect(page.getByRole("heading", { name: "不合格", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "合格", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-quiz-verdict="fail"]')).toBeVisible();
  await expect(page.getByText(/ライン 3もん（60%）/)).toBeVisible();
  await expect(page.getByText(/あと 3もん せいかいで/)).toBeVisible();
  // 次の 一手は「もう一度 やる」で 直す
  await expect(page.getByRole("status")).toContainText("もう一度");
  await expect(page.getByRole("button", { name: "もう一度 やる" })).toBeVisible();
  await expect(page.getByText("ここまで すすんだね")).toHaveCount(0);

  /*
   * **関門は 変えて いない**（不合格でも この 教材は「おわった」に なり、枠の「つぎは」が 出る）。
   * 合否に 合わせて 止めるかは 学習者が 先へ 進めなく なる 影響が 大きいので、tomy に 聞いて いる。
   */
  await expect(frameNext(page)).toBeVisible();

  expect(await bareKanjiTexts(page)).toEqual([]);
});

test("ちょうど 合格ライン（5問中 3問）は ⭕ 合格", async ({ page, context }) => {
  await open(page, context);
  // 先頭 2問だけ 外す → 3 / 5 = 60%
  await answerQuiz(page, [...WRONG.slice(0, 2), ...ANSWERS.slice(2)]);
  await expect(page.getByText(`3 / ${TOTAL} もん`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "合格", exact: true })).toBeVisible();
  await expect(page.getByText(/もん せいかいで/)).toHaveCount(0);
});
