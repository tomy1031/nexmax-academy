import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { seedCompleted, shot } from "./helpers";

/**
 * リスニングの こたえあわせでも 音を 鳴らせる（2026-09-16 の 指定）
 *
 * 前は こたえあわせに 入ると プレイヤーが 消え、聞き直すには「もういちど 聞く」で
 * 入力の 画面へ 戻るしか なかった。原稿を 読みながら その場で 聞き直せる ことを 見る。
 *
 * 1. 「きく」と 同じ 音が 出て、再生の つまみが ある
 * 2. はやさの ボタンが **こたえあわせの 音に** 効く
 * 3. げんこう・タイピングの 切り替えは 出ない（押しても 何も 変わらない ため）
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

for (const width of [390, 1280]) {
  test(`リスニング：こたえあわせでも 音を 鳴らせる（幅 ${width}px）`, async ({ page, context }) => {
    await seedCompleted(context, before());
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${STAGE}/listening`);
    await page.getByRole("button", { name: "はじめる" }).click();

    // 1語 入れて、先生の あいことばで 関所を 開ける（表示率を ためる のは この テストの 目的では ない）
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

    // 1. 「きく」と 同じ 音
    const audio = review.locator("audio");
    await expect(audio).toBeVisible();
    await expect(audio).toHaveAttribute("controls", "");
    await expect(audio).toHaveAttribute("src", /\/audio\/hourensou\/houkoku\.wav/);

    // 2. はやさが こたえあわせの 音に 効く
    await review.getByRole("button", { name: "ゆっくり", exact: true }).click();
    await expect(review.getByRole("button", { name: "ゆっくり", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await audio.evaluate((el: HTMLAudioElement) => el.playbackRate)).toBe(0.7);

    // 3. 切り替えは 出ない
    await expect(page.getByRole("button", { name: /げんこう (ON|OFF)/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /タイピング (ON|OFF)/ })).toHaveCount(0);

    // 原稿の ページ送りは 前の まま
    await expect(review.getByText(/^1 \/ \d+$/)).toBeVisible();

    await review.scrollIntoViewIfNeeded();
    await shot(page, `listening-kotaeawase-${width}`);
  });
}
