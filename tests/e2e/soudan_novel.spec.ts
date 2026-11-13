import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { bareKanjiTexts, seedAdmin, seedCompleted, seedGeminiKey, shot } from "./helpers";

/**
 * 相談の 練習（サウンドノベル・仕様書 v4）の 通し — **390px の 実機幅**
 *
 * 5日・相談 7件を 最初から 最後まで 進める。相談は 先生用の「合格に する」
 *（③の 札を 3秒 押しつづける）で 進める——AI の 返事は ここでは 見ない
 *（鍵ありの 1往復は `soudan_novel.ai.spec.ts`）。
 *
 * 気づき・相手えらび・自分で 直す は **教材の データの 正解**を 押して 進める。
 * 途中の 画面で、ルビの 付いて いない 漢字が 無いかも 数える（規律2）。
 */

const PHONE = { width: 390, height: 844 };
const PATH = "/soudan/meeting-soudan_novel";

interface NovelScene {
  id: string;
  type: string;
  answer?: unknown;
}

const MEETING = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "content", "meetings", "soudan_novel.json"), "utf8"),
) as { novel: { days: { id: string; scenes: NovelScene[] }[] } };

const BEFORE = ["soudan_lecture", "soudan_skit", "soudan_listening", "soudan_quiz"];

function sceneById(id: string): NovelScene | undefined {
  for (const day of MEETING.novel.days) {
    const scene = day.scenes.find((one) => one.id === id);
    if (scene) return scene;
  }
  return undefined;
}

/** Google へは 1本も 出さない（にせの キーで 通行証を 取りに 行かない）。 */
async function blockGoogle(page: Page): Promise<void> {
  await page.route("https://generativelanguage.googleapis.com/**", (route) => route.abort());
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/u, (ws) => ws.close());
}

/** 先生用の「合格に する」（相談の 札を 3秒 押しつづける。先生の 端末だけ）。 */
async function teacherPass(page: Page): Promise<void> {
  const chip = page.getByTestId("novel-teacher-pass");
  /* 札は パネルの 中で スクロールして 隠れる ことが ある（枠の 中だけ 動く） */
  await chip.scrollIntoViewIfNeeded();
  const box = await chip.boundingBox();
  if (!box) throw new Error("③の 札が 見えない");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await expect(page.getByTestId("novel-passed")).toBeVisible();
}

/**
 * 話しかける タイミング（要望 #723）: 席の 絵が「大丈夫そう」に なるのを 待って 押す。
 * 絵は 4枚 読みこめて から 5秒ごとに 切りかわり、大丈夫そうに なるのは 5〜15秒後（`deskCycle`）。
 */
async function approach(page: Page): Promise<void> {
  const desk = page.getByTestId("novel-desk");
  await expect(desk).toHaveAttribute("data-desk-state", "ok", { timeout: 30_000 });
  await desk.click();
  await expect(page.getByTestId("novel-approach-ok")).toBeVisible();
}

/** いまの 場面を 1つ 進める（場面の 種類ごとに 正しい 操作を する）。 */
async function step(page: Page): Promise<"ending" | "next"> {
  if (await page.getByTestId("novel-ending").count()) return "ending";

  const notice = page.getByTestId("novel-notice");
  if (await notice.count()) {
    const card = page.getByTestId("novel-notice-card");
    if (!(await card.count())) {
      const id = await page.getByTestId("novel-player").getAttribute("data-scene");
      const scene = sceneById(id ?? "");
      const [left, right] = (scene?.answer as [string, string] | undefined) ?? ["", ""];
      await page.locator(`[data-line="left:${left}"]`).click();
      await page.locator(`[data-line="right:${right}"]`).click();
      /* 2つ そろうと 自動で くらべる（要望 #729） */
      await expect(card).toBeVisible();
    }
    await card.getByRole("button").first().click();
    return "next";
  }

  const choose = page.getByTestId("novel-choose");
  if (await choose.count()) {
    const id = await page.getByTestId("novel-player").getAttribute("data-scene");
    const answer = sceneById(id ?? "")?.answer as string;
    await page.locator(`[data-person="${answer}"]`).click();
    return "next";
  }

  const fix = page.getByTestId("novel-selffix-button");
  if (await fix.count()) {
    await fix.click();
    await fix.click();
    return "next";
  }

  if (await page.getByTestId("novel-consult").count()) {
    if (!(await page.getByTestId("novel-passed").count())) await teacherPass(page);
    await page.getByTestId("novel-passed").getByRole("button").first().click();
    return "next";
  }

  // 文の 場面: 1回目で 全文、2回目で つぎへ
  const next = page.getByTestId("novel-next");
  await next.click();
  if (await next.count()) await next.click();
  return "next";
}

test.describe("相談の 練習（サウンドノベル）", () => {
  test.use({ viewport: PHONE });

  test("5日・相談 7件を 最後まで 通せて、まとめに 星が 7つ 並ぶ", async ({ page, context }) => {
    test.setTimeout(240_000);
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, "e2e-dummy-key");
    await seedAdmin(context);
    await blockGoogle(page);
    await page.goto(PATH);

    await expect(page.getByTestId("novel-title")).toBeVisible();
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-01-title");
    await page.getByTestId("novel-start").click();
    await expect(page.getByTestId("novel-player")).toBeVisible();

    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const id = (await page.getByTestId("novel-player").getAttribute("data-scene")) ?? "";
      if (!seen.has(id)) {
        seen.add(id);
        /* 代表の 場面で ルビの 漏れを 数える（気づき・相談・結果の 画面・ポイント） */
        if (["n_mon", "c_mon", "m20", "m22", "c_thu", "f21"].includes(id)) {
          /* 相談は 合格の 画面で 見る（タイミングの 段では 気づきカードを 隠す ため） */
          if (id.startsWith("c_")) await teacherPass(page);
          await page.waitForTimeout(400);
          expect(await bareKanjiTexts(page), `場面 ${id}`).toEqual([]);
          await shot(page, `novel-${id}`);
        }
      }
      if ((await step(page)) === "ending") break;
    }

    const ending = page.getByTestId("novel-ending");
    await expect(ending).toBeVisible();
    await expect(ending.locator("li")).toHaveCount(7);
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-99-ending");
    /* 5日 すべての 相談を 通った */
    for (const id of ["c_mon", "c_tue1", "c_tue2", "c_wed", "c_thu", "c_fri1", "c_fri2"]) {
      expect(seen.has(id), id).toBe(true);
    }
  });

  test("もどるで 前の 場面に もどり、表示（目的カード）も その 時点に もどる", async ({
    page,
    context,
  }) => {
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, "e2e-dummy-key");
    await blockGoogle(page);
    await page.goto(PATH);
    await page.getByTestId("novel-start").click();
    // 目的カードが 出る まで 進める
    for (let i = 0; i < 30 && !(await page.getByTestId("novel-goal").count()); i += 1) {
      await step(page);
    }
    await expect(page.getByTestId("novel-goal")).toBeVisible();
    // 目的の 場面より 前へ もどると、目的カードは 消える
    for (let i = 0; i < 6; i += 1) await page.getByTestId("novel-back").click();
    await expect(page.getByTestId("novel-goal")).toHaveCount(0);
    // ログから 行を 選ぶと、その 行に もどる
    await page.getByTestId("novel-log-button").click();
    await expect(page.getByTestId("novel-log")).toBeVisible();
    await page.getByTestId("novel-log").locator("li button").first().click();
    await expect(page.getByTestId("novel-player")).toHaveAttribute("data-scene", "m01");
  });

  test("マイクが 使えない ときは、文を 書いて 送る 欄が 出る", async ({ page, context }) => {
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, "e2e-dummy-key");
    await blockGoogle(page);
    /* マイクの 許可を 断られた 端末 */
    await context.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: () => Promise.reject(new DOMException("blocked", "NotAllowedError")),
      });
    });
    await page.goto(PATH);
    await page.getByTestId("novel-start").click();
    for (let i = 0; i < 80 && !(await page.getByTestId("novel-consult").count()); i += 1) {
      await step(page);
    }
    await approach(page);
    await page.getByTestId("novel-mic-connect").click();
    await expect(page.getByTestId("novel-text")).toBeVisible({ timeout: 30_000 });
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-text-mode");
  });

  test("キーが 無くても 始められ、お手本を 書けば 合格（星 1つ）に なる", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await seedCompleted(context, BEFORE);
    await blockGoogle(page);
    await page.goto(PATH);
    await expect(page.getByTestId("novel-key")).toBeVisible();
    await page.getByTestId("novel-start").click();
    for (let i = 0; i < 80 && !(await page.getByTestId("novel-consult").count()); i += 1) {
      await step(page);
    }
    await approach(page);
    /* 先生用の 合格は 学生の 端末では 押せない */
    await expect(page.getByTestId("novel-teacher-pass")).not.toHaveAttribute("data-teacher", "1");
    await expect(page.getByTestId("novel-text")).toBeVisible();
    await page.getByTestId("novel-text-input").fill("ヘンディさん、今、お時間よろしいですか。");
    await page.getByTestId("novel-text-send").click();
    await page.getByTestId("novel-to-talk").click();
    /* AI が 使えない ことと、お手本を 読めば 進める ことが 出る */
    await expect(page.getByTestId("novel-error")).toHaveAttribute("data-reason", "noKey");
    await expect(page.getByTestId("novel-hint")).toBeVisible();
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-nokey-model");
    await page
      .getByTestId("novel-text-input")
      .fill(
        "仕様書では、出す商品は2つです。でも、商品データにはキーボードもあります。キーボードも出しますか。",
      );
    await page.getByTestId("novel-text-send").click();
    await expect(page.getByTestId("novel-passed")).toHaveAttribute("data-stars", "1");
  });

  test("AI の 判定（にせの Gemini）: やり直し → 反応と ヒント → 2回目で 合格（星 2つ）", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, "e2e-dummy-key");
    await context.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: () => Promise.reject(new DOMException("blocked", "NotAllowedError")),
      });
    });
    /* 通行証と Live の つなぎを にせものに する。判定は 1回目 やり直し、2回目 合格 */
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ name: "auth_tokens/e2e-stub" }),
      });
    });
    let asked = 0;
    await page.routeWebSocket(/generativelanguage\.googleapis\.com/u, (ws) => {
      ws.onMessage((message) => {
        const text = typeof message === "string" ? message : message.toString();
        if (text.includes('"setup"')) {
          ws.send(JSON.stringify({ setupComplete: {} }));
          return;
        }
        if (!text.includes("clientContent")) return;
        asked += 1;
        const pass = asked >= 2;
        ws.send(
          JSON.stringify({
            toolCall: {
              functionCalls: [
                {
                  id: `call-${asked}`,
                  name: "report_judgment",
                  args: {
                    result: pass ? "pass" : "retry",
                    has_context: pass,
                    has_problem: true,
                    has_ask: true,
                    failure_type: pass ? "none" : "vague",
                    heard: "e2e",
                  },
                },
              ],
            },
          }),
        );
      });
    });
    await page.goto(PATH);
    await page.getByTestId("novel-start").click();
    for (let i = 0; i < 80 && !(await page.getByTestId("novel-consult").count()); i += 1) {
      await step(page);
    }
    await approach(page);
    await page.getByTestId("novel-mic-connect").click();
    await expect(page.getByTestId("novel-text")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("novel-text-input").fill("ヘンディさん、今、お時間よろしいですか。");
    await page.getByTestId("novel-text-send").click();
    await page.getByTestId("novel-to-talk").click();
    await page.getByTestId("novel-text-input").fill("キーボードも出しますか。");
    await page.getByTestId("novel-text-send").click();
    const react = page.getByTestId("novel-react");
    await expect(react).toHaveAttribute("data-type", "vague", { timeout: 30_000 });
    await expect(page.getByTestId("novel-not-yet")).toBeVisible();
    /* 足りない ①が 光る */
    await expect(page.getByTestId("novel-card").locator("[data-glow='1']")).toHaveCount(1);
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-react");
    await page.getByTestId("novel-again").click();
    await page
      .getByTestId("novel-text-input")
      .fill("仕様書では商品は2つです。でもデータにはキーボードがあります。出しますか。");
    await page.getByTestId("novel-text-send").click();
    await expect(page.getByTestId("novel-passed")).toHaveAttribute("data-stars", "2", {
      timeout: 30_000,
    });
  });

  test("話しかける タイミング: 大丈夫そうで ない ときに 押すと 待つ 理由が 出て、大丈夫そうな ときに 押すと 声かけへ 進む", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, "e2e-dummy-key");
    await blockGoogle(page);
    await page.goto(PATH);
    await page.getByTestId("novel-start").click();
    for (let i = 0; i < 80 && !(await page.getByTestId("novel-consult").count()); i += 1) {
      await step(page);
    }
    /* 席の 絵を 見て いる あいだは 舞台（立ち絵）を 隠す */
    await expect(page.getByTestId("novel-approach")).toBeVisible();
    await expect(page.getByTestId("novel-stage")).toBeHidden();
    /* はじめは かならず 話しかけては いけない 状態（絵が 読みこめて から 動く） */
    const desk = page.getByTestId("novel-desk");
    await expect(desk).toHaveAttribute("data-desk-state", /^(phone|busy|talking)$/u, {
      timeout: 15_000,
    });
    const first = await desk.getAttribute("data-desk-state");
    await desk.click();
    const wrong = page.getByTestId("novel-approach-wrong");
    await expect(wrong).toBeVisible();
    await expect(page.getByTestId("novel-consult")).toHaveAttribute("data-phase", "approach");
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-approach-wrong");
    /* 押した あと 5秒で 絵が 切りかわり、✖ の 文も 消える（今の 絵と 食い違わない） */
    await expect(desk).not.toHaveAttribute("data-desk-state", first ?? "", { timeout: 7_000 });
    await expect(wrong).toHaveCount(0);
    await approach(page);
    await expect(page.getByTestId("novel-consult")).toHaveAttribute("data-phase", "call");
    await expect(page.getByTestId("novel-stage")).toBeVisible();
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-approach-ok");

    /* 合格の あとの「もう 一度 練習する」は タイミングから */
    await seedAdmin(context);
    await page.reload();
    await page.getByTestId("novel-continue").click();
    await teacherPass(page);
    await page.getByTestId("novel-passed").getByRole("button").nth(1).click();
    await expect(page.getByTestId("novel-approach")).toBeVisible();
    /* 合格した 相談に もどって 来た ときは タイミングを 出さない */
    await page.reload();
    await page.getByTestId("novel-continue").click();
    await expect(page.getByTestId("novel-passed")).toBeVisible();
    await expect(page.getByTestId("novel-approach")).toHaveCount(0);
  });

  test("くらべる 画面: 片方だけ 正しい・両方 ちがう を はっきり 言い、正解の カードが 見える 所に 出る", async ({
    page,
    context,
  }) => {
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, "e2e-dummy-key");
    await blockGoogle(page);
    await page.goto(PATH);
    await page.getByTestId("novel-start").click();
    for (let i = 0; i < 40 && !(await page.getByTestId("novel-notice").count()); i += 1) {
      await step(page);
    }
    const scene = sceneById("n_mon");
    const [left, right] = scene?.answer as [string, string];
    const wrongRight = right === "d1" ? "d2" : "d1";
    const wrongLeft = left === "s2" ? "s3" : "s2";
    /* はじめは ① 左の 資料が 光る */
    await expect(page.locator('[data-doc="left"]')).toHaveAttribute("data-active", "1");
    /* 左は 正しい・右が ちがう → 左を 残して 右を 選び直す */
    await page.locator(`[data-line="left:${left}"]`).click();
    await expect(page.locator('[data-doc="right"]')).toHaveAttribute("data-active", "1");
    await page.locator(`[data-line="right:${wrongRight}"]`).click();
    const wrong = page.getByTestId("novel-notice-wrong");
    /* 文は ルビで 割れるので、判定の 種類で 見る */
    await expect(wrong).toHaveAttribute("data-verdict", "leftOk");
    await expect(page.locator('[data-slot="left"]')).toContainText("✔");
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-notice-partial");
    /* 両方 ちがう → ①から */
    await page.locator('[data-slot="left"]').click();
    await page.locator(`[data-line="left:${wrongLeft}"]`).click();
    await page.locator(`[data-line="right:${wrongRight}"]`).click();
    await expect(wrong).toHaveAttribute("data-verdict", "none");
    /* 正解 → カードと「つぎへ」が パネルの 中で 見える */
    await page.locator(`[data-line="left:${left}"]`).click();
    await page.locator(`[data-line="right:${right}"]`).click();
    const card = page.getByTestId("novel-notice-card");
    await expect(card.getByRole("button").first()).toBeInViewport();
  });

  test("全画面: 入ると 枠が 画面いっぱい・横長の 並べ方に なり、出ると 元に 戻る", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, "e2e-dummy-key");
    await blockGoogle(page);
    await page.goto(PATH);
    const frame = page.getByTestId("novel-frame");
    await page.getByTestId("novel-full-title").click();
    await expect(frame).toHaveAttribute("data-full", "1");
    await expect(frame).toHaveAttribute("data-layout", "wide");
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    await page.getByTestId("novel-start").click();
    for (let i = 0; i < 40 && !(await page.getByTestId("novel-notice").count()); i += 1) {
      await step(page);
    }
    /* 横長では 絵が 左の 列に なる */
    await expect(page.getByTestId("novel-stage")).toHaveAttribute("data-kind", "side");
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-full-wide");
    await page.getByTestId("novel-full").click();
    await expect(frame).not.toHaveAttribute("data-full", "1");
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });

  test("短い URL（/soudan/meeting）は 前と 同じ ミーティングを 開く", async ({ page }) => {
    await page.goto("/soudan/meeting");
    await expect(page).toHaveURL(/\/soudan\/meeting-soudan_meeting$/u);
  });

  test("読み込み直しても「つづきから」で 同じ 場面に もどる", async ({ page, context }) => {
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, "e2e-dummy-key");
    await blockGoogle(page);
    await page.goto(PATH);
    await page.getByTestId("novel-start").click();
    for (let i = 0; i < 5; i += 1) await step(page);
    const at = await page.getByTestId("novel-player").getAttribute("data-scene");
    await page.reload();
    await page.getByTestId("novel-continue").click();
    await expect(page.getByTestId("novel-player")).toHaveAttribute("data-scene", at ?? "");
  });
});
