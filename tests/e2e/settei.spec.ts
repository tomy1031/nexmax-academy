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
  await expect(page.getByRole("button", { name: /結果.*見/ })).toHaveCount(0);
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

/*
 * 「せつぞくを ためす」（2026-09-09）— 学習者が じぶんの キーを その場で 確かめる
 *
 * Google には つながず、`auth_tokens` の 返事を さしかえて 画面の 言葉を 見る。
 * 見本（`?keycheck=all`）は 出しうる 結果を ぜんぶ 並べるので、そこで 裸の 漢字も 数える。
 */
const AUTH_TOKENS = "**/v1beta/auth_tokens*";

test("キーが 空の まま ためすと、Google に 聞かずに「キーが まだ ありません」", async ({
  page,
}) => {
  let asked = 0;
  await page.route(AUTH_TOKENS, async (route) => {
    asked += 1;
    await route.fulfill({ status: 500, body: "{}" });
  });
  await page.goto("/map/settings");

  await page.getByRole("button", { name: "🔌 せつぞくを ためす" }).click();
  const result = page.getByRole("status").filter({ hasText: "reason: noKey" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("キーが まだ ありません");
  // 任意の 欄なので ❌ ではなく ⚠️。
  await expect(result).toContainText("⚠️");
  expect(asked).toBe(0);
});

test("Google が キーを 断ると、はっきり「うけとりませんでした」と 言い、つぎの 一手を 添える", async ({
  page,
}) => {
  await page.route(AUTH_TOKENS, (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] },
      }),
    }),
  );
  await page.goto("/map/settings");

  await page.getByLabel("Google Gemini APIキー").fill("AIzaNotARealKey");
  await page.getByRole("button", { name: "🔌 せつぞくを ためす" }).click();
  const result = page.getByRole("status").filter({ hasText: "reason: badKey" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("うけとりませんでした");
  // ルビが 読みを 差し込む（「かき直<rt>なお</rt>して」）ので、漢字の 無い ところで 見る。
  await expect(result).toContainText("もういちど コピーして");
  await shot(page, "settei-keycheck-badkey");
});

test("きっぷが 作れると「つながりました」", async ({ page }) => {
  await page.route(AUTH_TOKENS, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ name: "auth_tokens/e2e" }),
    }),
  );
  await page.goto("/map/settings");

  await page.getByLabel("Google Gemini APIキー").fill("AIzaLooksFine");
  await page.getByRole("button", { name: "🔌 せつぞくを ためす" }).click();
  const result = page.getByRole("status").filter({ hasText: "reason: ok" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("うけとって もらえました");
  // 押した 時点の キーが この きかいに 残る（「ほぞんする」を 忘れても 失わない）。
  expect(await page.evaluate(() => window.localStorage.getItem("nexmax.geminiKey"))).toBe(
    "AIzaLooksFine",
  );

  // キーを 書き換えたら、前の 判定は 消える（別の キーの 結果に 見えないように）。
  await page.getByLabel("Google Gemini APIキー").fill("AIzaAnotherOne");
  await expect(page.getByRole("status").filter({ hasText: "reason:" })).toHaveCount(0);
});

test("見本（?keycheck=all）で 全パターンが 並び、裸の漢字が 無い", async ({ page }) => {
  await page.goto("/map/settings?keycheck=all");

  const gallery = page.getByTestId("key-check-gallery");
  await expect(gallery).toBeVisible();
  // 見出しの 数と 箱の 数が 合う（数は 焼き込まない。台帳は src/lib/ai/key-check.ts）。
  const declared = Number(await page.getByTestId("key-check-gallery-count").innerText());
  expect(declared).toBeGreaterThanOrEqual(14);
  await expect(gallery.locator("[data-key-check]")).toHaveCount(declared);
  for (const reason of [
    "ok",
    "tokenRejected",
    "noKey",
    "badKey",
    "network",
    "locationNotSupported",
  ]) {
    await expect(gallery.locator(`[data-key-check="${reason}"]`)).toBeVisible();
  }
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "settei-keycheck-gallery");
});

test("見本は ふだんの せっていの 画面には 出ない", async ({ page }) => {
  await page.goto("/map/settings");
  await expect(page.getByTestId("key-check-gallery")).toHaveCount(0);
});

// 同じ カードは はじめの せってい（/welcome）にも 出る（learner-fields.tsx を 共有）。
test("はじめの せっていでも ためせて、見本も 出る", async ({ page }) => {
  await page.route(AUTH_TOKENS, (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/welcome?keycheck=all");

  await expect(page.getByRole("button", { name: "🔌 せつぞくを ためす" })).toBeVisible();
  await expect(page.getByTestId("key-check-gallery")).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);

  // 名前の 無い 400 は「きっぷだけ 作れない」＝ 注意で、しっぱいでは ない。
  await page.getByLabel("Google Gemini APIキー").fill("AQ.newStyleKey");
  await page.getByRole("button", { name: "🔌 せつぞくを ためす" }).click();
  const result = page.getByRole("status").filter({ hasText: "reason: tokenRejected" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("⚠️");
});
