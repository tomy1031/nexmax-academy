import { expect, test } from "@playwright/test";

/**
 * ことばアーケード — **⭕と ❌ が ひと目で 分かる**（2026-08-26 の 指摘2・3・5・6）
 *
 * ユーザーの ことば:
 *   「誤った語を入れても正解になってしまう」
 *   「正解と間違いの表示の違いがわかりにくい（色分けなどするか⭕️❌表示入れるなどして）」
 *   「最終結果で『合格』『不合格』を明確に記載して」
 *   「最終結果画面でゼロからやり直すボタンはなし」
 *
 * 点の 数え方は 前から 正しかった（`tests/arcade_reducer.test.ts` が 固定して いる）。
 * **同じ 顔で 次へ 進んで いた**のが 問題だったので、ここでは *画面* を 見る。
 * しるしは **記号と ことばの 両方**（色だけに たよらない。提出の 画面と 同じ 作法）。
 */

/** 8語の 小さな セット。1回の 通しが 短い。 */
const SET = "/arcade/hajimari_kotoba";

test("よみを 外すと ❌ と ただしい よみが 出る", async ({ page }) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /れんしゅう/ }).click();

  const input = page.getByRole("textbox", { name: "よみを ひらがなで 入力する" });
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill("ぜんぜんちがうよみ");
  await input.press("Enter");

  // 大きな しるし（記号＋ことば）
  await expect(page.getByText("おしい！")).toBeVisible();
  // 4択の あいだ、ただしい よみを ❌ と いっしょに 出しておく
  await expect(page.getByText(/❌ ただしい よみ:/)).toBeVisible();
});

test("いみを 外すと『ちがう こたえ』と えらんだ ものが 出る", async ({ page }) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /もんだいだけ/ }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });

  /*
   * どれが 正解かは 乱数で 決まる ので、**外れるまで 何問か 進める**。
   * 当たった ときは「せいかい」の カードが 出る ので、押して つぎへ。
   */
  for (let i = 0; i < 6; i += 1) {
    await page.getByRole("group", { name: "いみの こたえ" }).getByRole("button").first().click();

    /*
     * 4択には 持ち時間が ある。走らせ方に よっては 押す 前に 時間切れに なる ことも あるので、
     * **「えらんだ こたえ」が 出て いる ときだけ** 見る（時間切れは 別の テストの 受け持ち）。
     */
    const chosen = page.getByText(/❌ えらんだ こたえ:/);
    if (await chosen.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(page.getByText("ちがう こたえ")).toBeVisible();
      // 正しい こたえには ⭕ が 付く（どれが 正解だったかが その場で 分かる）
      await expect(page.getByText(/^⭕ /).first()).toBeVisible();
      return;
    }
    // 当たった／時間切れの ときは つぎの 問題へ
    await page
      .getByText(/せいかい|ちがう こたえ/)
      .first()
      .click();
    await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });
  }
  throw new Error("6問 つづけて 正解を 引いた — 乱数を 見直す");
});

test("さいごまで やると 合格か 不合格が はっきり 出て、ゼロからの やり直しは 無い", async ({
  page,
}) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /もんだいだけ/ }).click();

  const result = page.getByRole("heading", { name: /^(合格|不合格)$/ });
  const choices = page.getByRole("group", { name: "いみの こたえ" }).getByRole("button");

  // セットの ことばを **ぜんぶ** 出す ように したので、8問 とも 出る（8語の セット）
  for (let i = 0; i < 12; i += 1) {
    if (await result.isVisible().catch(() => false)) break;
    if (
      await choices
        .first()
        .isVisible({ timeout: 20_000 })
        .catch(() => false)
    ) {
      await choices.first().click();
      // 解説カードを 押して つぎへ（自動送りも あるが、押した ほうが 速い）
      await page
        .getByText(/せいかい|ちがう こたえ/)
        .first()
        .click();
    }
  }

  await expect(result).toBeVisible({ timeout: 20_000 });
  // 記号でも 出す（色だけに たよらない）
  await expect(page.getByText(/⭕|❌/).first()).toBeVisible();
  // 点・満点・合格ライン が 同じ 画面に ある
  await expect(page.getByText(/\d+ \/ \d+ 点/)).toBeVisible();
  await expect(page.getByText(/合格ライン \d+ 点/)).toBeVisible();
  // ゼロから やり直す 札は 置かない
  await expect(page.getByRole("button", { name: "もう一度" })).toHaveCount(0);
});

test("とちゅうで やめたら 合否は 出さない", async ({ page }) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /もんだいだけ/ }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "やめる" }).click();

  await expect(page.getByRole("heading", { name: "とちゅうまで" })).toBeVisible();
  await expect(page.getByText("さいごまで やると 合格か どうかが 出ます。")).toBeVisible();
});

test("あそぶ 前に ルールが 書いてある", async ({ page }) => {
  await page.goto(SET);
  // 「よみ」と「いみ」を 1つずつ 数える こと、何点で 合格かが 出て いる
  await expect(page.getByText(/よみ（ひらがな）と いみ（英語）/)).toBeVisible();
  await expect(page.getByText(/点で 合格です/)).toBeVisible();
});
