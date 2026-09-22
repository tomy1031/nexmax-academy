import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { rescueWord, seedCompleted, shot } from "./helpers";

/**
 * こたえあわせで **1文ずつ** 音を 鳴らせる（2026-09-16 の 指定「個々の 音声を 答え合わせに 貼る」）
 *
 * 報告の リスニングは 音を 1文ずつ 作って 残して ある（public/audio/listening/houkoku_listening/）。
 * 原稿の 文の うしろの ▶ で その 文の 音だけが 鳴る ことを 見る。
 */

const STAGE = "houkoku";
const LISTENING = "houkoku_listening";

function before(): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  const refs = stage.contents.map((item) => item.ref);
  return refs.slice(0, refs.indexOf(LISTENING));
}

for (const width of [390, 1280]) {
  test(`リスニング：こたえあわせで 1文ずつ 聞ける（幅 ${width}px）`, async ({ page, context }) => {
    await seedCompleted(context, before());
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${STAGE}/listening`);
    await page.getByRole("button", { name: "はじめる" }).click();

    const input = page.getByLabel("聞こえた ことばを 入力する");
    await input.fill("報告");
    await input.press("Enter");
    await page.getByText("どうしても すすめない ときは").click();
    await page.getByLabel("あいことば").fill(rescueWord("houkoku_listening"));
    await page.getByRole("button", { name: "ひらく" }).click();
    await page.getByRole("button", { name: "こたえあわせに すすむ" }).click();

    const review = page.locator("section", {
      has: page.getByRole("heading", { name: "こたえあわせ" }),
    });
    await expect(review).toBeVisible();

    // 1行目は 1文 → ▶ が 1つ。押すと 01.wav が 鳴る
    const lines = review.locator("ol > li");
    await expect(lines.nth(0).getByRole("button", { name: /文目を 聞く$/ })).toHaveCount(1);
    await lines.nth(0).getByRole("button", { name: "1文目を 聞く" }).click();
    const clip = page.locator("audio[data-sentence-clip]");
    await expect(clip).toHaveAttribute("src", /\/audio\/listening\/houkoku_listening\/01\.wav/);
    await expect(lines.nth(0).getByRole("button", { name: "1文目を 聞く" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 8行目（ヘンディさん・3文）まで 進めると ▶ が 3つ。2文目は 通し番号で 10.wav
    for (let i = 0; i < 7; i += 1) await review.getByRole("button", { name: "つぎ →" }).click();
    const eighth = lines.nth(7);
    await expect(eighth.getByRole("button", { name: /文目を 聞く$/ })).toHaveCount(3);
    await eighth.getByRole("button", { name: "2文目を 聞く" }).click();
    await expect(clip).toHaveAttribute("src", /\/audio\/listening\/houkoku_listening\/10\.wav/);

    // 文の 音も 上で えらんだ 速さ（既定 すこし ゆっくり）で 鳴る
    expect(await clip.evaluate((el: HTMLAudioElement) => el.playbackRate)).toBe(0.85);

    await eighth.scrollIntoViewIfNeeded();
    await shot(page, `listening-sentence-clips-${width}`);
  });
}
