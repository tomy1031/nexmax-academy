import { expect, test } from "@playwright/test";
import { bareKanjiTexts, shot } from "./helpers";

/**
 * せっていの画面（`/map/settings`）— あとから じぶんの じょうほうを 直す
 *
 * 見るのは3つ:
 *  1. はじめの せっていと**同じ 4枚の カード**が そろっているか
 *     （なまえ・がっこう・せいべつ・APIキー。`learner-fields.tsx` を 両画面で 共有している）
 *  2. **20問の 診断が 出てこない**か（ここは 保存だけの 画面）
 *  3. ルビの 外に 裸の漢字が 無いか（規律2）
 *
 * 鍵ゼロのデモモードでは ログインが 無いので、保存の ボタンは 押せない状態で 出る。
 * 「何が 足りないか」を 学習者に 伝えているところまでを ここで 見る。
 */

test("せっていの画面に、はじめの せっていと 同じ 欄が そろっている", async ({ page }) => {
  await page.goto("/map/settings");

  await expect(page.getByRole("heading", { name: "⭐ せってい ⭐" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /なまえ/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /がっこう/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /性別/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Gemini/ })).toBeVisible();

  // なまえ3欄・学校・期生・せいべつ・APIキーが さわれる状態で 出ている。
  await expect(page.getByPlaceholder("れい：ソク")).toBeVisible();
  await expect(page.getByPlaceholder("れい：ソピア")).toBeVisible();
  await expect(page.getByPlaceholder("れい：ピア")).toBeVisible();
  await expect(page.getByRole("button", { name: "🎓 AUPP" })).toBeVisible();
  await expect(page.getByLabel("Google Gemini APIキー")).toBeVisible();

  // マップへ もどる道が ある（行き止まりに しない）。
  await expect(page.getByRole("link", { name: "← マップに もどる" })).toHaveAttribute(
    "href",
    "/map",
  );

  await shot(page, "settei");
});

test("せっていの画面では 性格診断を しない（20問が 出てこない）", async ({ page }) => {
  await page.goto("/map/settings");

  await expect(page.getByText("しんだんは しません")).toBeVisible();
  await expect(page.getByText("20もんの うち")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /結果を/ })).toHaveCount(0);
  // 「ほぞんする」では 診断の結果に 触らないことを、画面の言葉でも 伝えている。
  await expect(
    page.getByText("「ほぞんする」では、せいかくしんだんの けっかは かわりません。"),
  ).toBeVisible();
});

test("やり直したい人は、せっていから 診断へ 行ける（20問は /welcome が 受け持つ）", async ({
  page,
}) => {
  await page.goto("/map/settings");

  await expect(page.getByRole("link", { name: /せいかくしんだんを もういちど/ })).toHaveAttribute(
    "href",
    "/welcome?retake=1",
  );
  // 打ちかけを 消さないよう、先に 保存するよう 伝えている。
  await expect(page.getByText(/さきに「ほぞんする」を おしてね/)).toBeVisible();
});

test("ログインが 無いあいだは、足りない ものを 伝えて 保存を 待つ", async ({ page }) => {
  await page.goto("/map/settings");

  const save = page.getByRole("button", { name: "⭐ ほぞんする ⭐" });
  await expect(save).toBeDisabled();
  await expect(page.getByText(/を おねがいね$/)).toBeVisible();
});

test("ルビの 外に 裸の漢字が 無い — せってい", async ({ page }) => {
  await page.goto("/map/settings");

  expect(await bareKanjiTexts(page)).toEqual([]);
});
