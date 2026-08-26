import { expect, test, type Page } from "@playwright/test";
import { shot } from "./helpers";

/**
 * 決まりきった あとに 出る「入口」。
 *
 * 鍵の ある ビルドでは Google の ボタン、鍵ゼロの デモモードでは
 * 「じゅんびちゅう」の 案内に なる。どちらが 出るかは **ビルドに 焼かれた
 * `NEXT_PUBLIC_SUPABASE_*` 次第**なので、検査は どちらでも 通るようにする。
 */
function entryPoint(page: Page) {
  return page
    .getByRole("button", { name: /Google で ログイン/ })
    .or(page.getByText("ログインは いま じゅんびちゅう"));
}

/**
 * タイトル画面 — **全員が いちばん 最初に 開く 画面**
 *
 * 2026-08-26 に、ここを リクエストごとの サーバ描画（dynamic）から
 * **作りおきの 静的ページ**に 変えた。授業で 20人が 同時に 開くと、
 * 冷えた Worker が そのたび Next の サーバ本体を 読み込んで CPU 上限
 * （無料プラン 1リクエスト 10ms）を 超えて いたため（docs/deploy.md §0.10）。
 *
 * 引きかえに「ログインずみか」「どこへ 戻すか」の 判定が ブラウザへ 移った。
 * **移しても 画面が 同じに なる**ことを ここで 押さえる。
 *
 * 鍵ゼロのデモモードで 走るので、ログインの 関所そのものは 無い
 *（playwright.config.ts の 冒頭）。ここで 確かめられるのは
 * 「静的ページでも 出しわけが 決まりきる」ところまで。
 */
test.describe("タイトル画面", () => {
  test("作りおきの静的ページでも、出しわけがブラウザで決まりきる", async ({ page }) => {
    await page.goto("/");

    // 決まるまでの 場所取り。**必ず 消える**ことを 見る
    // （消えないと、学習者は ボタンの 無い 画面の 前で 止まる）。
    const placeholder = page.getByText("よみこんで います…");
    await expect(placeholder).toBeHidden({ timeout: 10_000 });

    // 場所取りの あとに **本物の 入口**が 出る。鍵の ある ビルドなら ログインの
    // ボタン、鍵ゼロのデモモードなら「じゅんびちゅう」の 案内。どちらでも
    // 「決まりきって 何かが 出る」ことが ここで 見たい こと。
    await expect(entryPoint(page)).toBeVisible();

    await shot(page, "title_static");
  });

  test("ミドルウェアが付けた `?next=` が付いていても、同じ画面が出る", async ({ page }) => {
    // 未ログインで /map を開くと `/?next=%2Fmap` へ返される（src/middleware.ts）。
    // 静的ページは クエリで 中身が 変わらないので、**読めるまま**であることを見る。
    await page.goto("/?next=%2Fmap");
    await expect(page.getByText("よみこんで います…")).toBeHidden({ timeout: 10_000 });
    await expect(entryPoint(page)).toBeVisible();
  });
});
