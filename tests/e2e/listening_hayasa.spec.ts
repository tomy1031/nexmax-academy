import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator } from "@playwright/test";
import { seedCompleted } from "./helpers";

/**
 * リスニングの はやさ：**押す 前から** 札どおりの 速さで 鳴る
 *
 * 「すこし ゆっくり」は 開いた ときから 押された 札（`aria-pressed`）で 出るのに、
 * 速さを かけるのは ボタンを 押した ときだけ だった。`<audio>` の 既定は 1 なので、
 * 学習者は 画面が「すこし ゆっくり」と 言う まま **ふつうの 速さ**を 聞いて いた
 * （設計01 P10 の「既定は 遅め」が 効いて いない）。
 *
 * 1. 「きく」で、何も 押さずに 0.85
 * 2. 音を 読み直しても 0.85 のまま（`load()` は `defaultPlaybackRate` へ 戻す）
 * 3. 「こたえあわせ」の 音も、何も 押さずに 0.85
 * 4. 「もういちど 聞く」で 戻った 音も 0.85（部品が 作り直される）
 */

const STAGE = "houkoku";
const LISTENING = "houkoku_listening";

/** 順番の 関門を 出さない ために、この リスニングより 前の 教材を 済みに する。 */
function before(): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  const refs = stage.contents.map((item) => item.ref);
  return refs.slice(0, refs.indexOf(LISTENING));
}

/** 札が「すこし ゆっくり」で、音も 0.85 で ある こと。 */
async function expectSlightlySlow(scope: Locator) {
  await expect(scope.getByRole("button", { name: "すこし ゆっくり", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const audio = scope.locator("audio");
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.playbackRate)).toBe(0.85);
}

test("リスニング：はやさは 押す 前から「すこし ゆっくり」で 鳴る", async ({ page, context }) => {
  await seedCompleted(context, before());
  await page.goto(`/${STAGE}/listening`);
  await page.getByRole("button", { name: "はじめる" }).click();

  // 1. 「きく」
  const listen = page.locator("section", { has: page.locator("audio") });
  await expectSlightlySlow(listen);

  // 2. 読み直しても 戻らない
  const reloaded = await listen.locator("audio").evaluate((el: HTMLAudioElement) => {
    el.load();
    return el.playbackRate;
  });
  expect(reloaded, "load() で ふつうの 速さに 戻った").toBe(0.85);

  // 3. 「こたえあわせ」（関所は 先生の あいことばで 開ける。表示率は この テストの 目的では ない）
  const input = page.getByLabel("聞こえた ことばを 入力する");
  await input.fill("報告");
  await input.press("Enter");
  await page.getByText("どうしても すすめない ときは").click();
  await page.getByLabel("あいことば").fill("きいた");
  await page.getByRole("button", { name: "ひらく" }).click();
  await page.getByRole("button", { name: "こたえあわせに すすむ" }).click();

  const review = page.locator("section", {
    has: page.getByRole("heading", { name: "こたえあわせ" }),
  });
  await expect(review).toBeVisible();
  await expectSlightlySlow(review);

  // 4. 「もういちど 聞く」で 戻った 音
  await review.getByRole("button", { name: "もういちど 聞く" }).click();
  await expect(page.getByLabel("聞こえた ことばを 入力する")).toBeVisible();
  await expectSlightlySlow(page.locator("section", { has: page.locator("audio") }));
});
