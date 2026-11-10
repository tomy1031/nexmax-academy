import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * 連絡の リスニングの タイピング（2026-11-10 の 指定「連絡の リスニングの あとに、作業完了の 報告と
 * 同じ 原理で リスニング内容の タイピング問題を。修了証を 発行する ように」）
 *
 * 1. ステージの 並びで リスニングの すぐ あと・もんだいの 前に ある
 * 2. お手本の 文を ぜんぶ 打つと、その 瞬間に 修了証（デモでは 見本）が 出る
 */

const STAGE = "renraku";
const TYPING = "renraku_typing";

function stageRefs(): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  return stage.contents.map((item) => item.ref);
}

function sentences(): { text: string; en: string }[] {
  return JSON.parse(readFileSync(join("content", "typing", `${TYPING}.json`), "utf8")).sentences;
}

async function typeAndJudge(page: Page, text: string) {
  await page.getByLabel("お手本と 同じ 文を 入力する").fill(text);
  await page.getByRole("button", { name: "判定", exact: true }).click();
}

test("連絡: タイピングは リスニングの すぐ あと・もんだいの 前", () => {
  const refs = stageRefs();
  expect(refs.indexOf(TYPING)).toBe(refs.indexOf("renraku_listening") + 1);
  expect(refs.indexOf("renraku_quiz")).toBe(refs.indexOf(TYPING) + 1);
});

test("連絡: タイピングを 最後まで 打つと 修了証が 出る", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const refs = stageRefs();
  await seedCompleted(context, refs.slice(0, refs.indexOf(TYPING)));
  await page.goto(`/${STAGE}/typing`);

  const list = sentences();
  await expect(page.locator('[data-typing="progress"]')).toHaveText(`1 / ${list.length}`);
  await shot(page, "typing-renraku-first-390");

  for (const [i, sentence] of list.entries()) {
    await typeAndJudge(page, sentence.text);
    await expect(page.locator('[data-typing="verdict"]')).toHaveAttribute("data-ok", "true");
    await expect(page.locator('[data-typing="translation"]')).toContainText(sentence.en);
    if (i < list.length - 1) await page.getByRole("button", { name: "つぎの 文へ" }).click();
  }

  await expect(page.locator('[data-typing="finished"]')).toBeVisible();
  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-perfect", "true");
  await expect(page.locator('[data-certificate="badge"]')).toHaveText("★ PERFECT");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "typing-renraku-certificate-390");
});
