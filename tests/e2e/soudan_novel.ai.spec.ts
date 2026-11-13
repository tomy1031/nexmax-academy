import { expect, test, type Page } from "@playwright/test";

import { seedCompleted, seedGeminiKey, shot } from "./helpers";

/**
 * 相談の 練習 — **鍵が あるときの 判定の 1往復**（Gemini Live の `report_judgment`）
 *
 * マイクは 断られた 端末に して、文を 書いて 送る 欄から 相談する
 *（にせの マイクの 音では ことばが 起こせない）。判定の つなぎは 声と 同じ Live。
 *
 * - お手本どおりの 相談 → 合格（⭕・星 3つ）
 * - 「おかしいです」だけ → やり直し（相手を せめる／あいまい）
 *
 * AI の 返事で 合否が 変わる ので、ふだんの CI では 走らない（`*.ai.spec.ts`）。
 */
test.use({ trace: "off", video: "off", viewport: { width: 390, height: 844 } });

const PATH = "/soudan/meeting-soudan_novel";
const BEFORE = ["soudan_lecture", "soudan_skit", "soudan_listening", "soudan_quiz"];

async function toMondayConsult(page: Page): Promise<void> {
  await page.getByTestId("novel-start").click();
  for (let i = 0; i < 120 && !(await page.getByTestId("novel-consult").count()); i += 1) {
    if (await page.getByTestId("novel-notice").count()) {
      if (!(await page.getByTestId("novel-notice-card").count())) {
        await page.locator('[data-line="left:s2"]').click();
        await page.locator('[data-line="right:d2"]').click();
        await page.getByTestId("novel-compare").click();
      }
      await page.getByTestId("novel-notice-card").getByRole("button").first().click();
      continue;
    }
    if (await page.getByTestId("novel-choose").count()) {
      await page.locator('[data-person="hendy"]').click();
      continue;
    }
    const next = page.getByTestId("novel-next");
    await next.click();
    if (await next.count()) await next.click();
  }
  // 話しかける タイミング（要望 #723）: 大丈夫そうに なるまで 待って 押す
  const desk = page.getByTestId("novel-desk");
  await expect(desk).toHaveAttribute("data-desk-state", "ok", { timeout: 20_000 });
  await desk.click();
  await page.getByTestId("novel-mic-connect").click();
  await expect(page.getByTestId("novel-text")).toBeVisible({ timeout: 30_000 });
  // 声かけ
  await page.getByTestId("novel-text-input").fill("ヘンディさん、今、お時間よろしいですか。");
  await page.getByTestId("novel-text-send").click();
  await page.getByTestId("novel-to-talk").click();
}

test.describe("相談の 判定（鍵が あるときだけ）", () => {
  test.beforeEach(async ({ context }) => {
    const key = process.env.GEMINI_API_KEY ?? "";
    test.skip(key === "", "GEMINI_API_KEY が 無いので とばしました");
    await seedCompleted(context, BEFORE);
    await seedGeminiKey(context, key);
    await context.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: () => Promise.reject(new DOMException("blocked", "NotAllowedError")),
      });
    });
  });

  test("①②③が そろった 相談は 合格に なる", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(PATH);
    await toMondayConsult(page);
    await page
      .getByTestId("novel-text-input")
      .fill(
        "仕様書では、1から5個注文できます。でも、USBライトの在庫は2個です。在庫より多い注文は、できないようにしますか。",
      );
    await page.getByTestId("novel-text-send").click();
    const consult = page.getByTestId("novel-consult");
    await expect(consult).toHaveAttribute("data-phase", /passed|react|error/, { timeout: 60_000 });
    await shot(page, "novel-ai-pass");
    const phase = await consult.getAttribute("data-phase");
    test.skip(phase === "error", "AI の 判定が 届きませんでした（つなぎ・混雑）");
    expect(phase).toBe("passed");
  });

  test("「おかしいです」だけの 相談は やり直しに なる", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(PATH);
    await toMondayConsult(page);
    await page.getByTestId("novel-text-input").fill("仕様書は おかしいです。");
    await page.getByTestId("novel-text-send").click();
    const consult = page.getByTestId("novel-consult");
    await expect(consult).toHaveAttribute("data-phase", /passed|react|error|whatif/, {
      timeout: 60_000,
    });
    await shot(page, "novel-ai-retry");
    const phase = await consult.getAttribute("data-phase");
    test.skip(phase === "error", "AI の 判定が 届きませんでした（つなぎ・混雑）");
    expect(phase).toBe("react");
    await expect(page.getByTestId("novel-react")).toHaveAttribute(
      "data-type",
      /blaming|vague|no_ask/,
    );
  });
});
