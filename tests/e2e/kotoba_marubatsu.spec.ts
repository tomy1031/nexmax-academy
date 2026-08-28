import { expect, test, type Page } from "@playwright/test";

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

/**
 * 解説カードを 押して つぎの 問題へ。**押せなくても 進む**。
 *
 * この 画面には **自動送り**が あり、押すのと 競走して いる。自動送りが
 * 先に 動くと、押そうと して いた カードが その場で DOM から 消える
 *（Playwright の ログでは `element was detached from the DOM` と 出る。
 * その 前後には 覆いの `absolute inset-0` が クリックを 遮る 瞬間も ある）。
 *
 * 3回に 1回ほど ここで 落ちて いた——**画面の 不具合では なく、押し方の 問題**。
 * どちらの 道でも 次の 問題へ 進むので、押せなかった ときは 自動送りに まかせる。
 * 進んだ ことは、呼ぶ 側が「つぎの 問題が 出たか」で 確かめる。
 */
async function advance(page: Page): Promise<void> {
  await page
    .getByText(/せいかい|ちがう/)
    .first()
    .click({ timeout: 3_000 })
    .catch(() => {});
}

test("よみを 外すと 入力欄が 空に なり、正しく 打てるまで 何度でも やり直せる", async ({
  page,
}) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /れんしゅう/ }).click();

  const input = page.getByRole("textbox", { name: "よみを ひらがなで 入力する" });
  await expect(input).toBeVisible({ timeout: 20_000 });

  // 1回目の 打ちまちがい。合図は **❌ の しるしだけ**（文は 出さない）
  await input.fill("ぜんぜんちがうよみ");
  await input.press("Enter");
  await expect(page.getByLabel("ちがう")).toBeVisible();
  await expect(input).toHaveValue(""); // 入力した 字は 消える
  await expect(input).toBeVisible(); // **まだ 読みの 番**（4択に 進んで いない）
  await expect(page.getByText("英語の 意味を えらぼう！")).toHaveCount(0);

  // 2回目の 打ちまちがいでも 同じ。番は 終わらない
  await input.fill("これもちがう");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(page.getByText("英語の 意味を えらぼう！")).toHaveCount(0);
});

test("こたえた あと、**正しい こたえ**が ⭕ つきで 出る", async ({ page }) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /もんだいだけ/ }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });

  const choices = page.getByRole("group", { name: "いみの こたえ" }).getByRole("button");

  /*
   * 解説カードには **自動送り**（2.8秒）が ある ので、押した 直後に 見る。
   * どれが 正解かは 乱数で 決まる ので、**外れるまで 何問か 進める**——
   * ただし 見たい ことは 両方に 共通で、「正しい こたえが ⭕ つきで 出る」こと。
   */
  for (let i = 0; i < 6; i += 1) {
    await choices.first().click();
    await expect(page.getByText(/^⭕/).first()).toBeVisible({ timeout: 3_000 });

    // 外した ときだけ、えらんだ こたえが 小さく 添う（（Sport）の ような 形）
    if (
      await page
        .getByText(/^（.+）$/)
        .isVisible()
        .catch(() => false)
    ) {
      // ここまで 来れば 見たい ことは 出て いる（⭕ の 正解＋えらんだ こたえ）。
      // 見出しの ❌ を さらに 待たない——カードは 2.8秒で 自動送りされる ので、
      // 待つ ほど 落ちやすく なるだけで、確かめる 中身は 増えない。
      return;
    }
    await advance(page);
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
      await advance(page);
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
