import { expect, test, type Locator } from "@playwright/test";

/**
 * 前の 画面へ 戻る 道（導線）— 行き止まりを 作らない
 *
 * 2026-08-21 の 指定「すべてのページにおいて、導線設計が不足しております。本来どの
 * ページに遷移すべきかを考慮して…全般的には『前の画面に戻る』導線が不足している箇所が
 * 多いです」（docs/constraints.md）。
 *
 * 見張るのは **札の字ではなく 行き先**。この3つが 実在した:
 *  - 見つからない URL に 行き先が 1つも 無い（英語の 404 に 落ちる）
 *  - 「← まなびマップ」の 札が `/`（タイトル画面）を 指す
 *  - ことばアーケードが、ステージから 来た 人も いつも マップへ 出す
 *
 * 見るのは **リンクの 行き先（href）**。押した あとの URL では 見張れない——
 * この検証は 鍵ゼロの デモモードで 走るので、`/map` は 中身を 出す 前に
 * はじめの せってい（`/welcome`）へ 送り返す（map-shell.tsx — Supabase が
 * 無ければ プロフィールを 引けない）。押して 待つと、マップを 通り抜けた あとの
 * `/welcome` を 見て しまい、**行き先が `/` に 戻っても 気づけない**。
 * 行き先が それ自体で 落ち着く ところ（ステージ・タイトル画面）だけ、押して 確かめる。
 */

/** 「まなびマップへ」の 札が **`/map`** を 指しているか（`/` を 指していた）。 */
async function expectMapLink(link: Locator) {
  await expect(link).toHaveAttribute("href", "/map");
}

test("見つからない URL からも 出られる（まなびマップ／さいしょの 画面）", async ({ page }) => {
  const res = await page.goto("/kore-wa-nai-page");
  expect(res?.status()).toBe(404);

  await expect(page.getByRole("heading", { name: "この ページは ありません" })).toBeVisible();

  await expectMapLink(page.getByRole("link", { name: /まなびマップへ もどる/ }));

  // タイトル画面は それ自体で 落ち着くので、こちらは 押して 確かめる
  await page.getByRole("link", { name: /さいしょの/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

/**
 * 一覧の「← まなびマップ」は **マップ**へ。
 * 3つとも `/` を 指していて、押すと ログイン直後の タイトル画面まで 放り出されていた。
 */
for (const path of ["/quiz", "/listening", "/talk"]) {
  test(`${path} の「← まなびマップ」は マップを 指す`, async ({ page }) => {
    await page.goto(path);
    await expectMapLink(page.getByRole("link", { name: "← まなびマップ" }));
  });
}

/**
 * ステージの 枠の 外で 開く スライドにも 戻る 道を 置く。
 * ここは **どの ステージにも 入って いない スライド**だけが 来る（入って いれば
 * 本来の URL へ 送り返される）ので、戻り先は マップ。
 */
test("ステージに 入って いない スライドにも 戻る 道が ある", async ({ page }) => {
  await page.goto("/slides/sample_slides");
  await expectMapLink(page.getByRole("link", { name: "← まなびマップ" }));
});

/**
 * ことばアーケードは ステージから 直行できる（`/[stage]` の「さいしょに ことばを
 * おぼえる」）。そこから 来た 人を マップへ 出すと、つづきの 教材が ある ステージを
 * 地図の 上から 探し直す ことに なる。
 */
test("ステージから 入った ことばアーケードは、その ステージへ もどる", async ({ page }) => {
  await page.goto("/arcade/hajimari_kotoba");

  const back = page.getByRole("button", { name: /もどる/ });
  await back.scrollIntoViewIfNeeded();
  // 札に ステージの 名前が 出る（「マップに もどる」では ない）
  await expect(back).toContainText("はじまり");

  await back.click();
  await expect(page).toHaveURL(/\/hajimari$/);
});

/**
 * 単独で 開いた ときは これまでどおり。ぜんぶの ことばを 見たい 人の 入口を
 * 塞がない（ステージから 来た ときだけ 行き先が 変わる）。
 */
test("ことばだけで 開いた ときは、これまでどおり グループ選びに もどる", async ({ page }) => {
  await page.goto("/arcade");
  await page
    .getByRole("button", { name: /はじまり/ })
    .first()
    .click();

  const back = page.getByRole("button", { name: /グループを えらびなおす/ });
  await back.scrollIntoViewIfNeeded();
  await back.click();

  await expect(page.getByRole("button", { name: /はじまり/ }).first()).toBeVisible();
});

/**
 * 診断の やり直しは **やめられる**。タイトル画面と せっていの 両方に
 * 「せいかくしんだんを もういちど」が あるのに、押した あと 戻る 道が 無かった。
 */
test("診断の やり直しは やめられる（はじめての 人には 出さない）", async ({ page }) => {
  await page.goto("/welcome?retake=1");
  const cancel = page.getByRole("link", { name: "やめて まなびマップへ もどる" });
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeVisible();
  await expectMapLink(cancel);

  // はじめての ときは 通り抜けて もらう（まだ 中に 入れて いない）
  await page.goto("/welcome");
  await expect(page.getByRole("link", { name: "やめて まなびマップへ もどる" })).toHaveCount(0);
});
