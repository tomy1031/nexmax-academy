import { expect, test } from "@playwright/test";
import { choiceButtons, itemsBefore, KAISHA, seedCompleted, shot } from "./helpers";

/**
 * まとめて 出す（提出モード）— ぜんぶ 書いてから 1回だけ 採点する やりかた
 *
 * 見張るのは、このモードが 成り立つ ための 3つ。
 *  1. **途中で 正誤が 漏れない**（漏れたら テストの やりかたに ならない）
 *  2. **他の ページへ 行って 戻っても 書いた ものが 消えない**（保存が 生命線）
 *  3. 出した あとに **自分の こたえと 正解が 並んで 見える**
 *
 * ついでに、これまでの「1問ずつ」でも **自分が 何を えらんだか** が 出る ことを 見る
 * ——外した ときほど、自分の 選択が 画面に 残って いないと 直しようが ない。
 */

/** ふりがなが 合成されるので、名前は 部分一致で さがす（helpers 冒頭の 注意と 同じ）。 */
const START_SUBMIT = /まとめて/;
const SUBMIT_ANSWERS = /こたえを 出/;

test("まとめて 出す は 途中で 採点しない（えらんだ ところは 残る）", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(1));
  await page.goto(KAISHA.quiz1.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  await expect(page.getByText("もんだい 1 / 6")).toBeVisible();
  await choiceButtons(page).nth(0).click();

  // えらんだ ところは 押した ままに 見える（＝自分の こたえが 画面に 残る）
  await expect(choiceButtons(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  // 合って いるかは まだ 出さない
  await expect(page.getByText("よく できました")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "つぎへ" })).toHaveCount(0);
  await expect(page.getByText("こたえた 1 / 6")).toBeVisible();
  await shot(page, "23-quiz-submit-answering");

  // 行って 戻っても、えらんだ ところは そのまま
  await page.getByRole("button", { name: "つぎ →" }).click();
  await expect(page.getByText("もんだい 2 / 6")).toBeVisible();
  await page.getByRole("button", { name: "← まえの もんだい" }).click();
  await expect(choiceButtons(page).nth(0)).toHaveAttribute("aria-pressed", "true");
});

test("他の ページへ 行って 戻っても、書いた ものは 残る", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(3));
  await page.goto(KAISHA.quiz2.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 語群の あなを 埋める（「こたえる」ボタンは 無い ＝ 押した 瞬間に 採点しない）
  await page.getByRole("button", { name: "ホームページや アプリ" }).first().click();
  await expect(page.getByRole("button", { name: "こたえる" })).toHaveCount(0);
  await page.getByRole("button", { name: "つぎ →" }).click();
  await expect(page.getByText("もんだい 2 / 9")).toBeVisible();

  // ステージへ 離脱 → 戻る
  await page.goto("/kaisha");
  await page.goto(KAISHA.quiz2.path);
  await expect(page.getByText("まえの つづきから はじめます")).toBeVisible();
  await expect(page.getByText("1もん")).toBeVisible();
  await page.getByRole("button", { name: "つづきから" }).click();

  // 書いた ものも 見て いた ところも 戻って いる
  await expect(page.getByText("もんだい 2 / 9")).toBeVisible();
  await expect(page.getByText("こたえた 1 / 9")).toBeVisible();
});

test("出す まえに かくにんして、出すと 自分の こたえと 正解が 並ぶ", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(1));
  await page.goto(KAISHA.quiz1.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 1問目だけ わざと 外して、のこりは 書かずに 進む
  await choiceButtons(page).nth(2).click();
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole("button", { name: "つぎ →" }).click();
  }
  await page.getByRole("button", { name: "さいごに かくにん →" }).click();

  // 出す 前に「のこり」が 見える（書き忘れに 気づける 最後の 場所）
  await expect(page.getByText(/まえの かくにん/)).toBeVisible();
  await expect(page.getByText(/のこり 5もん/)).toBeVisible();
  await shot(page, "24-quiz-submit-confirm");

  await page.getByRole("button", { name: SUBMIT_ANSWERS }).click();

  // けっか: 自分の こたえと 正解が 並び、せつめいも 読める
  await expect(page.getByText("ぜんぶの こたえ")).toBeVisible();
  await expect(page.getByText("あなたの こたえ").first()).toBeVisible();
  // 1文字ずつ ルビが 入る 語（客きゃく先さき…）なので、あいだを 空けて さがす
  await expect(page.getByText(/客.*先.*常.*駐/).first()).toBeVisible();
  await expect(page.getByText(/正解/).first()).toBeVisible();
  // ルビが 合成されるので「書かいて」に なる。ふりがなの 入らない ところで さがす
  await expect(page.getByText(/いて いません/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "まちがえた もんだいだけ" })).toBeVisible();
  await shot(page, "25-quiz-submit-result");

  // まちがえた もんだいだけ を 押しても、やりかたは まとめて 出す のまま
  await page.getByRole("button", { name: "まちがえた もんだいだけ" }).click();
  await expect(page.getByText("もんだい 1 / 6")).toBeVisible();
  await expect(page.getByRole("button", { name: /つぎ →|さいごに かくにん →/ })).toBeVisible();
});

test("1問ずつ でも、自分が えらんだ ものが 見える", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(1));
  await page.goto(KAISHA.quiz1.path);
  await page.getByRole("button", { name: "はじめる" }).click();

  // 外した ときこそ、自分の こたえと 正解が 並んで いないと 直せない
  await choiceButtons(page).nth(2).click();
  await expect(page.getByText("あなたの こたえ")).toBeVisible();
  // 1文字ずつ ルビが 入る 語（客きゃく先さき…）なので、あいだを 空けて さがす
  await expect(page.getByText(/客.*先.*常.*駐/).first()).toBeVisible();
  await expect(page.getByText(/正解/).first()).toBeVisible();
  await expect(page.getByText("受託開発").first()).toBeVisible();
  await shot(page, "26-quiz-one-by-one-answer");
});
