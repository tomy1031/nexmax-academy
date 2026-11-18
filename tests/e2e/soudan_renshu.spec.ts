import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * 相談の 練習問題（public/tools/hourensou/soudan_renshu.html・2026-11-17 の 依頼）
 *
 * 見張るのは:
 *  1. はじめに → レベル1 → 絵の 説明 → 伝える こと → 席の 絵（3秒ごと）→ 相談 → 結果 が 最後まで 通る
 *  2. 席の 絵が 大丈夫そうで ない ときに 押すと ✖ と 理由（何中か）が 出る
 *  3. 足りない ときは ✖ もう 一度・足りない 要素・ヘンディさんの 反応。合格すると 星と 加点
 *  4. ヒントを うめた だけ（自分で 足して いない）の 人には「こう 言うと もっと 伝わります」
 *  5. ヘンディさんの 答えは 学生が 選んだ 方法に 合わせる
 *  6. ステージの 中で 開くと、進み具合が アプリの 学習の 記録（→ Supabase）に 入る
 *
 * Google へは 1本も 出さない。判定の 返事は にせもの（決まった JSON）を 返す。
 * マイクは 使わず「文を 書いて 送る」で 進める（判定の 道は 同じ）。
 */

const PAGE = "/tools/hourensou/soudan_renshu.html";
const GEMINI = "https://generativelanguage.googleapis.com/**";
const BEFORE = ["soudan_lecture", "soudan_skit", "soudan_listening", "soudan_quiz"];

type Reply = Record<string, unknown>;

const ALL = { jokyo: true, mondai: true, kakunin: false, kangae: true, soudan: true };
const FLAGS = { decided_alone: false, off_topic: false, unclear: false };

/** 判定の 返事を 順に 返す（足りなく なったら 最後の ものを くり返す）。 */
async function stubJudge(page: Page, replies: Reply[]): Promise<void> {
  await page.route(GEMINI, async (route) => {
    const next = replies.length > 1 ? replies.shift() : replies[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(next) }] } }],
      }),
    });
  });
}

async function seedKey(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem("nexmax.geminiKey", "e2e-dummy-key"));
}

async function next(page: Page | FrameLocator): Promise<void> {
  await page.locator('.caption [data-act="next"]').click();
}

test("レベル1を 最後まで: 席の 絵を 見て 話しかけ、相談して、ヘンディさんの 答えを 聞く", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedKey(page);
  await stubJudge(page, [
    { ...ALL, soudan: false, own_words: false, bonus: [], choice: "none", ...FLAGS },
    { ...ALL, own_words: false, bonus: ["deadline"], choice: "B", ...FLAGS },
  ]);
  await page.goto(PAGE);

  /* はじめに（4枚）。ふりがなの ない 漢字が 1つも ない */
  for (let i = 0; i < 4; i += 1) {
    expect(await bareKanjiTexts(page), `はじめに ${i + 1}`).toEqual([]);
    if (i === 1) await shot(page, "soudan-renshu-01-parts");
    if (i === 2) await shot(page, "soudan-renshu-02-desk-guide");
    await next(page);
  }

  /* タイトル → レベル1 */
  await page.getByTestId("level-1").click();
  for (let i = 0; i < 5; i += 1) {
    expect(await bareKanjiTexts(page), `レベル1 ${i}`).toEqual([]);
    await next(page);
  }
  /* 伝える こと（3つ） */
  await expect(page.locator(".check")).toHaveCount(3);
  await shot(page, "soudan-renshu-03-checklist");
  await next(page);

  /* 席の 絵: はじめは かならず 大丈夫そうで ない。押すと ✖ と 何中か */
  const call = page.getByTestId("desk-call");
  await expect(call).toBeEnabled({ timeout: 20_000 });
  await expect(call).not.toHaveAttribute("data-desk-state", "ok");
  await call.click();
  await expect(page.locator("#deskWrong")).toBeVisible();
  await shot(page, "soudan-renshu-04-desk-wrong");
  /* 3秒ごとに 変わる。大丈夫そうに なったら 押す */
  await expect(call).toHaveAttribute("data-desk-state", "ok", { timeout: 20_000 });
  await call.click();

  /* 相談 */
  const consult = page.getByTestId("consult");
  await expect(consult).toHaveAttribute("data-phase", "ready");
  await page.getByTestId("hint-btn").click();
  await expect(page.getByTestId("hints")).toBeVisible();
  await page.locator('[data-act="typemode"]').click();
  await page
    .getByTestId("typed")
    .fill("おみせの いちらんがめんを つくって います。しゃしんが ありません。");
  await page.getByTestId("send-typed").click();

  /* 足りない（相談したい こと）→ ✖ と ヘンディさんの 反応 */
  await expect(page.getByTestId("verdict-retry")).toBeVisible();
  await expect(page.locator(".check.miss")).toHaveCount(1);
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "soudan-renshu-05-retry");

  /* 2回目は 合格（ヒントを うめた だけ）→ 星・加点・もっと 伝わる 言い方。書く 欄は 出た まま */
  await page
    .getByTestId("typed")
    .fill(
      "おみせの いちらんがめんを つくって います。しゃしんが ありません。かりの しゃしんを つかっても いいですか。",
    );
  await page.getByTestId("send-typed").click();
  await expect(page.getByTestId("verdict-pass")).toBeVisible();
  await expect(page.getByTestId("bonus")).toBeVisible();
  await expect(page.getByTestId("better")).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "soudan-renshu-06-pass");

  const saved = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("nexmax:soudan_renshu:v1") ?? "null"),
  );
  expect(saved.levels.l1).toMatchObject({ stars: 2, bonus: 1, choice: "B" });

  /* ヘンディさんの 答え（B を 選んだ）→ つぎの レベルが 開く */
  await page.getByTestId("to-reply").click();
  await expect(page.locator(".reply")).toContainText("進すすめて");
  await expect(page.getByTestId("next-level")).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "soudan-renshu-07-reply");
});

test("勝手に 決めて 言うと やり直し（許可を 聞く ことを 教える）", async ({ page }) => {
  await seedKey(page);
  await stubJudge(page, [
    { ...ALL, own_words: true, bonus: [], choice: "B", ...FLAGS, decided_alone: true },
  ]);
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "nexmax:soudan_renshu:v1",
      JSON.stringify({
        v: 1,
        introSeen: true,
        levels: {},
        worksheet: { cells: {}, thoughts: {} },
        at: { level: 0, page: 7 },
      }),
    ),
  );
  await page.goto(PAGE);
  /* 相談の 途中から 開き直すと、席の 絵から やり直す */
  const call = page.getByTestId("desk-call");
  await expect(call).toHaveAttribute("data-desk-state", "ok", { timeout: 20_000 });
  await call.click();
  await page.locator('[data-act="typemode"]').click();
  await page.getByTestId("typed").fill("かりの しゃしんで すすめます。");
  await page.getByTestId("send-typed").click();
  await expect(page.getByTestId("verdict-retry")).toBeVisible();
  await expect(page.locator(".bubble")).toContainText("待まって");
});

test("ステージの 中で 開くと、進み具合が 学習の 記録に 入る（Supabase へ 送る 元）", async ({
  page,
  context,
}) => {
  await seedCompleted(context, BEFORE);
  await page.goto("/soudan/link");
  await page
    .getByRole("button", { name: /ひらく/ })
    .first()
    .click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".caption")).toBeVisible();
  for (let i = 0; i < 4; i += 1) await next(frame);
  await expect(frame.getByTestId("level-1")).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() =>
        JSON.parse(window.localStorage.getItem("nexmax:v1:content:soudan_renshu") ?? "null"),
      ),
    )
    .toMatchObject({ status: "started", position: { intro: 1, open: 1 } });
});
