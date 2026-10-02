import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { seedCompleted } from "./helpers";

/**
 * リスニングの 再生の つまみ：**動かした 位置から 鳴る**（2026-09-30 の 指定）
 *
 * 指定は「再生中に 動かせない・止めて 動かしても 反映されない」。
 * 本番の 配信元（Cloudflare Workers の 静的ファイル）は「途中から 送って」（`Range`）と
 * 頼まれても **全体を 200 で 返す**（`206` も `Accept-Ranges` も 無い）。Chrome は
 * これを「位置を 動かせない 音」と みなし、`seekable` が `[0,0]` に なって、
 * `currentTime` を 変えても **0秒に 戻される**。
 *
 * 手もとの サーバ（`next start`）は `Range` に ちゃんと 答えるので、そのままでは
 * この 不具合が 再現しない。だから ここでは **本番と 同じ 答え方**（`Range` を
 * 無視して 全体を 200 で 返す）を `page.route` で 作る。
 *
 * 1. 鳴らしながら 30秒へ 動かすと、30秒の あたりから 続く
 * 2. 止めてから 60秒へ 動かすと、位置が 60秒に なり、また 鳴らすと 60秒から 続く
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

test("リスニング：再生の つまみを 動かすと、その 位置から 鳴る（Range に 答えない 配信元）", async ({
  page,
  context,
}) => {
  await seedCompleted(context, before());

  // 通しの 音だけを 本番と 同じ 答え方に する。文ごとの 音（houkoku_listening/ の 下）は 別の 名前
  const wav = readFileSync(join("public", "audio", "listening", `${LISTENING}.wav`));
  let served = 0;
  await page.route(/\/audio\/listening\/houkoku_listening\.wav/, (route) => {
    served += 1;
    return route.fulfill({ status: 200, body: wav, headers: { "content-type": "audio/wav" } });
  });

  await page.goto(`/${STAGE}/listening`);
  // 「はじめる」を 押す 前は 音を 取らない（教室の 細い 回線を 食わない）
  await page.waitForLoadState("load");
  expect(served, "まえおきの 画面で もう 音を 取って いる").toBe(0);
  await page.getByRole("button", { name: "はじめる" }).click();

  const audio = page.locator("section", { has: page.locator("audio") }).locator("audio");
  await expect(audio).toBeVisible();

  // 音の 長さが 分かる ところまで 待つ（手もとに 取る 実装でも、取り終わると 読み込まれる）
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState >= 1 && el.duration > 60), {
      message: "音の 長さが 分からない（読み込めて いない）",
    })
    .toBe(true);
  expect(served, "通しの 音の 取得が 上の route を 通って いない").toBeGreaterThan(0);

  // 1. 鳴らしながら 動かす
  const playing = await audio.evaluate(async (el: HTMLAudioElement) => {
    el.muted = true;
    await el.play();
    const done = new Promise<void>((resolve) => {
      // 動かせない 音では seeked が 来ない ことも ある。待ちぼうけに せず 位置を 返す
      const timer = setTimeout(resolve, 5000);
      el.addEventListener(
        "seeked",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    el.currentTime = 30;
    await done;
    return el.currentTime;
  });
  expect(playing, "鳴らしながら 30秒へ 動かしたのに 位置が 戻された").toBeGreaterThan(29);

  // 2. 止めてから 動かす
  const paused = await audio.evaluate(async (el: HTMLAudioElement) => {
    el.pause();
    const done = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      el.addEventListener(
        "seeked",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    el.currentTime = 60;
    await done;
    return el.currentTime;
  });
  expect(paused, "止めてから 60秒へ 動かしたのに 位置が 戻された").toBeGreaterThan(59);

  // 動かした 位置から 続きが 鳴る（0秒から やり直しに ならない）
  const resumed = await audio.evaluate(async (el: HTMLAudioElement) => {
    await el.play();
    await new Promise((resolve) => setTimeout(resolve, 800));
    return el.currentTime;
  });
  expect(resumed, "動かした 位置から 続かず、頭から 鳴り直した").toBeGreaterThan(59);
});
