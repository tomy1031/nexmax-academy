import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * タイピングの お手本の 文の 横に 🔊（2026-10-06 の 指定「お手本の 文の 音声って ちゃんと
 * 対応しますか？ 対応して いるので あれば 音声再生の ボタンを テキストの 横に」）
 *
 * 鳴らすのは リスニングの 文ごとの 音（public/audio/listening/<ID>/NN.wav）。
 * 文を 進めると、その 文の 音に 変わる。
 */

const STAGE = "houkoku-kiku";
const TYPING = "houkoku_kanryou_typing";
const PATH = `/${STAGE}/typing-${TYPING}`;

function stageRefs(): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  return stage.contents.map((item) => item.ref);
}

function sentences(): { text: string }[] {
  return JSON.parse(readFileSync(join("content", "typing", `${TYPING}.json`), "utf8")).sentences;
}

async function open(page: Page, context: Parameters<typeof seedCompleted>[0]) {
  const all = stageRefs();
  await seedCompleted(context, all.slice(0, all.indexOf(TYPING)));
  await page.goto(PATH);
  await expect(page.locator('[data-typing="model"]')).toBeVisible();
}

async function solveAndNext(page: Page, text: string) {
  await page.getByLabel("お手本と 同じ 文を 入力する").fill(text);
  await page.getByRole("button", { name: "判定", exact: true }).click();
  await expect(page.locator('[data-typing="verdict"]')).toHaveAttribute("data-ok", "true");
  await page.getByRole("button", { name: "つぎの 文へ" }).click();
}

for (const width of [390, 1280]) {
  test(`お手本の 文の 横の 🔊 で その 文の 音が 鳴る（幅 ${width}px）`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, context);

    const listen = page.getByRole("button", { name: "お手本の 文を 聞く" });
    const audio = page.locator('audio[data-typing="audio"]');
    await expect(listen).toBeVisible();
    await expect(audio).toHaveAttribute(
      "src",
      /\/audio\/listening\/houkoku_kanryou_listening\/01\.wav/,
    );

    // 文の 横に 並ぶ（下に 落ちない）
    const model = await page.locator('[data-typing="sentence"]').boundingBox();
    const button = await listen.boundingBox();
    expect(button!.x).toBeGreaterThan(model!.x + model!.width - 1);
    expect(button!.y).toBeLessThan(model!.y + model!.height);

    // 押すと 鳴る（もう一度 押すと 止まる）。入力欄の カーソルは 奪わない
    const input = page.getByLabel("お手本と 同じ 文を 入力する");
    await input.focus();
    await listen.click();
    await expect(listen).toHaveAttribute("aria-pressed", "true");
    await expect(input).toBeFocused();
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(0);
    await shot(page, `typing-audio-playing-${width}`);
    await listen.click();
    await expect(listen).toHaveAttribute("aria-pressed", "false");
    expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
    expect(await bareKanjiTexts(page)).toEqual([]);
  });
}

test("文を 進めると、その 文の 音に 変わる（短い 文と 1つの 音からは 切り出した 音）", async ({
  page,
  context,
}) => {
  await open(page, context);
  const list = sentences();
  const audio = page.locator('audio[data-typing="audio"]');
  // 2文目（担当して いた…）は 03.wav——リスニングの 2行目（高橋さん）を とばす
  await solveAndNext(page, list[0]!.text);
  await expect(audio).toHaveAttribute("src", /houkoku_kanryou_listening\/03\.wav/);
  // 5文目「パソコンと…確認しました。」は「はい。パソコンと…」（10.wav）から 切り出した 10_2.wav
  for (const index of [1, 2, 3]) await solveAndNext(page, list[index]!.text);
  await expect(page.locator('[data-typing="progress"]')).toHaveText(`5 / ${list.length}`);
  await expect(audio).toHaveAttribute("src", /houkoku_kanryou_listening\/10_2\.wav/);
});
