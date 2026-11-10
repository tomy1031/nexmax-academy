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

/**
 * 作った 音が 無い 文は 機械の 読み上げ（2026-11-10 の 指定「音声データが ない 場合は 機械の
 * 読み上げを」）。連絡の リスニングは 文ごとの 音が 無いので、どの 文も 読み上げに なる。
 * 端末の 読み上げは テストでは 鳴らせないので、何を 読ませたかを 記録する 偽物に 差しかえて 見る。
 */
test("連絡: 音が 無い 文は 🔊 で 機械の 読み上げが その 文を 読む", async ({ page, context }) => {
  await page.addInitScript(() => {
    const record = window as unknown as { spoken: { text: string; lang: string }[] };
    record.spoken = [];
    const fake = {
      speaking: false,
      cancel() {},
      speak(utterance: SpeechSynthesisUtterance) {
        record.spoken.push({ text: utterance.text, lang: utterance.lang });
      },
      getVoices: () => [],
    };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const refs = stageRefs();
  await seedCompleted(context, refs.slice(0, refs.indexOf(TYPING)));
  await page.goto(`/${STAGE}/typing`);

  const listen = page.getByRole("button", { name: "お手本の 文を 聞く" });
  await expect(listen).toBeVisible();
  await expect(listen).toHaveAttribute("data-voice", "speech");
  await expect(page.locator('audio[data-typing="audio"]')).toHaveCount(0);

  // 文の 横に 並ぶ（下に 落ちない）
  const model = await page.locator('[data-typing="sentence"]').boundingBox();
  const button = await listen.boundingBox();
  expect(button!.x).toBeGreaterThan(model!.x + model!.width - 1);
  expect(button!.y).toBeLessThan(model!.y + model!.height);

  const spoken = () =>
    page.evaluate(() => (window as unknown as { spoken: { text: string; lang: string }[] }).spoken);
  const list = sentences();
  const input = page.getByLabel("お手本と 同じ 文を 入力する");
  await input.focus();
  await listen.click();
  await expect(listen).toHaveAttribute("aria-pressed", "true");
  await expect(input).toBeFocused();
  expect(await spoken()).toEqual([{ text: list[0]!.text, lang: "ja-JP" }]);
  await shot(page, "typing-renraku-speech-390");
  // もう一度 押すと 止まる
  await listen.click();
  await expect(listen).toHaveAttribute("aria-pressed", "false");

  // 文を 進めると、その 文を 読む
  await typeAndJudge(page, list[0]!.text);
  await page.getByRole("button", { name: "つぎの 文へ" }).click();
  await listen.click();
  expect((await spoken()).at(-1)).toEqual({ text: list[1]!.text, lang: "ja-JP" });
  expect(await bareKanjiTexts(page)).toEqual([]);
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
