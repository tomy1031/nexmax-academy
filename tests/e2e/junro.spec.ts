import { expect, test } from "@playwright/test";
import { itemsBefore, KAISHA, seedCompleted, shot } from "./helpers";

/**
 * 順路（関門）— まだ 順番の 来ていない 教材は ひらかない
 *
 * 通しの検証（toshi.spec.ts）が 関門を 本物のまま 通るので、こちらでは
 * **止まるほうの 道**を 確かめる。止まらなくなったことに 誰も 気づかない、が
 * いちばん こわい（学習者は 6番目の 松井社長から 始めてしまう）。
 *
 * あわせて、**行き止まりを 作っていない**ことも 見る——直接URLで 来た人には
 * 「さきに どれを おわらせるか」と そこへの ボタン、それでも 見る 逃げ道がある。
 */

test("なにも おわっていない 端末では、6番目の ミーティングが ひらかない", async ({ page }) => {
  await page.goto(KAISHA.meetingMatsui.path);

  await expect(page.getByText("まだ この きょうざいの じゅんばんでは ありません")).toBeVisible();
  // 対話ゲームの ロビー（「はじめる」）は 出ていない
  await expect(page.getByRole("button", { name: "はじめる ▶" })).toHaveCount(0);
  await shot(page, "20-locked-notice");

  // 脇の並びでは、まだ ひらけない 教材に 🔒 が ついている
  await expect(page.locator("aside").getByText("🔒").first()).toBeVisible();

  // 行き止まりにしない: さきに おわらせる 教材へ 行ける
  await page.getByRole("link", { name: "を ひらく" }).click();
  await expect(page).toHaveURL(new RegExp(`${KAISHA.article1.path}$`));
});

test("それでも 見る を おせば、先生も 中身を たしかめられる", async ({ page }) => {
  await page.goto(KAISHA.meetingMatsui.path);
  await page.getByRole("button", { name: "それでも 見る" }).click();

  /*
   * 松井社長は **対話ゲーム**（願い #177）。Zoom の 入室では なく、
   * 舞台に 入る「はじめる」から 始まる。
   */
  await expect(page.getByRole("button", { name: "はじめる ▶" })).toBeVisible();
});

test("5番目まで おわった 端末では、5番目が ひらき、6番目は まだ ひらかない", async ({
  page,
  context,
}) => {
  await seedCompleted(context, itemsBefore(KAISHA.meetingHendy));

  await page.goto(KAISHA.meetingHendy.path);
  await expect(page.getByText("はなす まえに")).toBeVisible();

  await page.goto(KAISHA.meetingMatsui.path);
  await expect(page.getByText("まだ この きょうざいの じゅんばんでは ありません")).toBeVisible();
});
