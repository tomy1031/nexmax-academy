import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { seedCompleted, shot } from "./helpers";

/**
 * 穴うめの 答え合わせ — **どこを どう まちがえたかが 画面に 出る**
 *
 * 2026-09-11 の 指定「答えが 出るだけで、どこを どう 間違えたか わかりません。
 * 構造的に 直せそうでしょうか？」。
 *
 * 部品ひとつの テスト（`tests/wordbank_review.test.tsx`）とは 別に、**学習者と
 * 同じ 道**で 見る。部品が 正しくても、けっかの 画面に つなぎ忘れれば 学習者には
 * 何も 変わらない——実際、つなぎ口は 2つ ある（1問ずつ の `AnswerPair` と、
 * まとめて 出した あとの `ReviewRow`）。
 *
 * 端末の 幅は **390px**（学習者の 電話）。ここで 折り返しが 崩れると、
 * 文の 中の あなが 読めなく なる。
 */

test.use({ viewport: { width: 390, height: 900 } });

const QUIZ = "/houkoku/quiz-houkoku_quiz";

/** わざと 2つ まちがえる（（1）と（4））。 */
const FILL = ["お名前", "問題", "バグ", "会議", "正直", "予定"];

test("穴うめの 答え合わせ: まちがえた あなの となりに 正しい ことばが 出る", async ({
  page,
  context,
}) => {
  const stage = JSON.parse(readFileSync(join("content", "stages", "houkoku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  await seedCompleted(
    context,
    stage.contents
      .slice(
        0,
        stage.contents.findIndex((content) => content.ref === "houkoku_quiz"),
      )
      .map((content) => content.ref),
  );

  await page.goto(QUIZ);
  await page.getByRole("button", { name: /はじめる/ }).click();
  // 1問目は 飛ばして、2問目（ヘンディさんと 藤木さんの 会話）を 書く
  await page.getByRole("button", { name: /つぎ/ }).click();
  for (const word of FILL) {
    await page
      .getByRole("button", { name: new RegExp(word) })
      .last()
      .click();
  }
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: /つぎ/ }).click();
  await page.getByRole("button", { name: /さいごに/ }).click();
  await page.getByRole("button", { name: /こたえを/ }).click();
  await page.getByRole("button", { name: /はい、/ }).click();

  const row = page.locator("li", { hasText: "ヘンディさんと" }).first();
  await expect(row).toBeVisible();

  /*
   * 合って いた あなは ✓、まちがえた あなは ✗ の となりに 正しい ことば。
   * 「（1）お名前 ✗ → お時間」の 並びを、文の 中で 見る。
   */
  await expect(row).toContainText("✓");
  await expect(row).toContainText("✗");
  const text = (await row.innerText()).replace(/\s/g, "");
  expect(text.indexOf("お名前")).toBeLessThan(text.indexOf("お時間"));
  expect(text.indexOf("会議")).toBeLessThan(text.indexOf("設定"));

  // 合って いた 数から 言う（手ぶらで 帰さない）
  await expect(row).toContainText("4つ");

  await row.scrollIntoViewIfNeeded();
  await shot(page, "wordbank-review-390");
});
