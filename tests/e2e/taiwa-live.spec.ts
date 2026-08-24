import { expect, test } from "@playwright/test";
import { KAISHA, itemsBefore, readOn, seedCompleted, seedGeminiKey, shot } from "./helpers";

/**
 * 対話ゲームの **AIが 効いて いる ところ**を 1往復だけ 見る（願い #177）
 *
 * 鍵の 無い 道（端末の 規則）は `toshi` の 通しで 毎回 見て いる。こちらは
 * **鍵が あるときだけ** 走らせて、規則では 出せない 2つを 確かめる:
 *
 * 1. 「会社の ことが 入って いる」が 立つ（規則ベースは いつも 立てない）
 * 2. 出だしの 2つを 過ぎたら、**その場で 作った 深掘りの しつもん**に なる
 *
 * 鍵の 渡し方・トレースを 切る 理由は `judge.spec.ts` と 同じ（鍵が 記録に 残らない ように）。
 */
test.use({ trace: "off", video: "off" });

test.describe("対話ゲームの AI（鍵が あるときだけ）", () => {
  test("会社の ことを 話すと 観点が 立ち、そのあとは AIが 深掘りする", async ({
    page,
    context,
  }) => {
    const key = process.env.GEMINI_API_KEY ?? "";
    test.skip(
      key === "",
      "GEMINI_API_KEY が 無いので とばしました（鍵なしの道は toshi で 見ています）",
    );

    await seedGeminiKey(context, key);
    await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
    await page.goto(KAISHA.meetingMatsui.path);
    await page.getByRole("button", { name: "はじめる ▶" }).click();
    await readOn(page);

    const fellBack = page.getByText("AIの みかたが いま つかえません");
    /** 答える 直前に 出て いた しつもん（あとで 深掘りと 見くらべる）。 */
    const asks: string[] = [];
    const answer = async (text: string) => {
      asks.push((await page.locator("[data-ask]").innerText()).trim());
      await page.getByLabel("文字で 答える").fill(text);
      await page.getByRole("button", { name: "おくる" }).click();
      await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });
    };

    await answer("カンボジアの プログラムが おもしろかったです。");
    if ((await fellBack.count()) > 0) {
      /*
       * AIに 通せない ことは 仕様の うち（鍵切れ・混雑）。**緑で 通して 黙って 消さず**、
       * とばした ことが 分かる ように 残す（judge.spec.ts と 同じ 決まり）。
       */
      console.log("[taiwa] AIに 通せませんでした（鍵切れ・混雑）");
      test.skip(true, "AIに 通せませんでした");
    }

    /*
     * ①会社の 中身を 言えたので、規則では 立たない 観点が 立つ。
     * 字では 探さない——画面の 見出しには **ふりがなが 合成されて いる**
     *（「会社かいしゃの ことが…」に なる）。目印の `data-kanten` で 引く。
     */
    await expect(page.locator('[data-kanten="concrete"]')).toHaveAttribute("data-on", "true");
    await page.waitForTimeout(700);
    await shot(page, "24-taiwa-live-feedback");

    /*
     * ②見つけた「おもしろい」が 1つ 開く。
     * 板が 出て いる あいだ 札は しまわれる ので、板の 中の ひとことで 見て、
     * 数は 板を 閉じてから 見る（2026-08-24 の 検収指摘 #9 の あとの 見え方）。
     */
    await expect(page.getByText(/を みつけました！/)).toBeVisible();
    await page.getByRole("button", { name: "つぎへ ▶" }).click();
    await expect(page.getByText("おもしろい 1 / 5")).toBeVisible();
    await readOn(page);
    await answer("NMClaw は、はなすだけで まとまるから すごいと 思いました。");
    await page.getByRole("button", { name: "つぎへ ▶" }).click();
    await readOn(page);

    /*
     * ③3つめの しつもんは 教材に 書いて いない（＝その場で 作られた）。
     * 文字の 一致で 見ないのは、画面の 字に **ふりがなが 合成されて いる**ため。
     * 出だしの 2つと ちがう ことと、しつもんの 形に なって いる ことで 見る。
     */
    const third = (await page.locator("[data-ask]").innerText()).trim();
    expect(third).not.toBe(asks[0]);
    expect(third).not.toBe(asks[1]);
    expect(third.length).toBeGreaterThan(4);
    /* 板が 出きって から 撮る（半透明の 写真では 読めるか 判断できない）。 */
    await page.waitForTimeout(700);
    await shot(page, "24-taiwa-live-deepdive");
  });
});
