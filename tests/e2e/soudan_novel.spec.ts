import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { bareKanjiTexts, seedCompleted, seedGeminiKey, shot } from "./helpers";

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

/** 先生用の「合格に する」（③の 札を 3秒 押しつづける）。 */
async function teacherPass(page: Page): Promise<void> {
  const chip = page.getByTestId("novel-teacher-pass");
  const box = await chip.boundingBox();
  if (!box) throw new Error("③の 札が 見えない");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await expect(page.getByTestId("novel-passed")).toBeVisible();
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
      await page.getByTestId("novel-compare").click();
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
    await page.getByTestId("novel-mic-connect").click();
    await expect(page.getByTestId("novel-text")).toBeVisible({ timeout: 30_000 });
    expect(await bareKanjiTexts(page)).toEqual([]);
    await shot(page, "novel-text-mode");
  });
});
