import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext } from "@playwright/test";
import { seedCompleted, shot, submitAnswers, writeIn } from "./helpers";

/**
 * 調査（リサーチ）：日本の 会社の 階級 — **いつもの もんだい（全問1ページ・まとめて 出す）**
 *
 * 2026-09-18 の 指定「別ウィンドウで表示する形式をやめて、いつものクイズ形式にする」
 * 「『問題』のコンポーネントに差し替えしてくださいね。全ページ表示・提出型です」。
 * それまでは 別ページ（静的HTML）を 全画面で 開き、こたえは postMessage で 親へ
 * 渡して いた——DB には 1件も 残って いなかった。元の 別ページは いったん 残して
 * ステージから 外した（同日「元のものはいったん残して非表示に」）。
 *
 * 見張るのは 4つ:
 *  1. 古い URL（`/houkoku/link`）が もんだいへ 送られる（配った リンクを 404 に しない）
 *  2. 別ページ（iframe）では なく、4問が 1ページに 並ぶ
 *  3. **ぜんぶ 書くまで 出せない。1文字でも 書けば うまった ことに なる**
 *     （同日「とりあえず埋めた時にまだ提出できないとなったりします」——前の 別ページは
 *      2文字 未満を「残って います」と 数えて いた）
 *  4. 出して はじめて 答え合わせの ページが 開く（関門）
 */

const QUIZ = "houkoku_search_quiz";
const PATH = `/houkoku/quiz-${QUIZ}`;
/** 答え合わせの ページ（関門の 向こう）。 */
const NEXT = "/houkoku/article-houkoku_hierarchy";

/** 学習者が 調べて 書く こと（1つだけ わざと 1文字 — 3 を 見る）。 */
const WRITTEN: readonly (readonly [string, string])[] = [
  ["kaikyuu_order", "1. 社長　2. 取締役　3. 部長　4. 課長　5. 社員"],
  ["kaikyuu", "In my country: CEO, manager, staff."],
  ["houkoku", "We report only when there is a problem."],
];
const LAST = "joushi";

async function seedUpToQuiz(context: BrowserContext) {
  const stage = JSON.parse(readFileSync(join("content", "stages", "houkoku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const at = stage.contents.findIndex((content) => content.ref === QUIZ);
  expect(at, "報告ステージに 調査の もんだいが 無い").toBeGreaterThan(0);
  await seedCompleted(
    context,
    stage.contents.slice(0, at).map((content) => content.ref),
  );
}

test("調査（リサーチ）: 古い 別ページの URL は もんだいへ 送る", async ({ page, context }) => {
  await seedUpToQuiz(context);
  for (const old of ["/houkoku/link", "/houkoku/link-houkoku_search"]) {
    await page.goto(old);
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  }
});

test("調査（リサーチ）: 4問が 1ページに 出て、ぜんぶ 書くと 出せて、つぎの ページが 開く", async ({
  page,
  context,
}) => {
  await seedUpToQuiz(context);

  /* 4. 出す 前は 答え合わせの ページが 閉じて いる。 */
  await page.goto(NEXT);
  await expect(page.getByText("じゅんばんでは ありません")).toBeVisible();

  await page.goto(PATH);
  await page.getByRole("button", { name: "はじめる" }).click();

  /* 2. 4問が 同時に 見えて いる。別ページ（iframe）は もう 無い。 */
  await expect(page.getByText("1/4", { exact: true })).toBeVisible();
  await expect(page.getByText("4/4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "つぎ →" })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);

  /* 3. ぜんぶ 書くまで「こたえを 出す」は 出ない。 */
  await expect(page.getByRole("button", { name: /こたえを 出/ })).toHaveCount(0);
  for (const [questionId, written] of WRITTEN) {
    await writeIn(page, questionId, written);
  }
  await expect(page.getByRole("button", { name: /こたえを 出/ })).toHaveCount(0);
  // 1文字でも 書けば うまった ことに なる
  await writeIn(page, LAST, "a");
  await expect(page.getByRole("button", { name: /こたえを 出/ })).toBeVisible();
  await shot(page, "houkoku-search-quiz-01-filled");

  await submitAnswers(page);
  // 正解の 無い もんだいなので 点では なく「いくつ 書けたか」を 出す（quiz-runner の freeOnly）
  await expect(page.getByText("4 / 4 つ")).toBeVisible();
  await shot(page, "houkoku-search-quiz-02-submitted");

  /* 4. 出したので、答え合わせの ページが 開く。 */
  await page.goto(NEXT);
  await expect(page.getByText("じゅんばんでは ありません")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
