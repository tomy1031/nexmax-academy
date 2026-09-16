/**
 * 声の 見本を 作る（スタジオ「登場人物」の「▶ 声を ためす」で 鳴らす 音）
 *
 * ## なぜ 作り置きに するか（2026-09-16 の 指定）
 * 前は ボタンを 押す たびに Live へ つないで 1文 作って いた。先生の キーが 要り、
 * 1回 数秒 待たされ、30種を 聞きくらべる ほど 枠を 食う。**全部の 声で 同じ 文を 先に
 * 作って おけば**、キーなしで すぐ 鳴り、同じ 文どうしで 聞きくらべられる。
 *
 * ## 何を するか
 * `src/lib/audio/voices.ts` の `LIVE_VOICES` を 1つずつ、`VOICE_SAMPLE_TEXT` で 読ませて
 * `public/audio/voices/<声の名前>.wav` に 置く。
 * 読み上げの 道は ミーティング・リスニングと **同じ**（`scripts/lib/live_tts.ts`）——
 * 文字起こしを 台本と 見くらべ、**台本どおりに 読めなかった ものは 書かない**。
 * だから 見本が ある ＝ その 声で Live から 音が 返った 証拠に なる
 *（`tests/voice_samples.test.ts` が 見本の 無い 声を 落とす）。
 *
 * ## 鍵
 * 鍵の ある ワークフロー「教材の 音声づくり」から 回す（`make_meeting_audio.ts` が
 * `voices` を ここへ 振り分ける）:
 *   gh workflow run meeting-audio.yml --ref <ブランチ> -f meeting=voices
 *
 * 使い方: `GEMINI_API_KEY=… node --import tsx scripts/make_voice_samples.ts [--force] [--only Puck,Kore] [--list]`
 * すでに ある 見本は 飛ばす（`--force` で 作り直す）。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE_VOICES, VOICE_SAMPLE_TEXT } from "../src/lib/audio/voices";
import { OUT_RATE, synthesizeWithFallback, toWav } from "./lib/live_tts";

const force: boolean = process.argv.includes("--force");
const listOnly: boolean = process.argv.includes("--list");
/** 作る 声を しぼる（`--only Puck,Kore`）。 */
const only: readonly string[] = (() => {
  const at = process.argv.indexOf("--only");
  return at >= 0 ? (process.argv[at + 1] ?? "").split(",").filter((name) => name.length > 0) : [];
})();
const apiKey: string = process.env.GEMINI_API_KEY ?? "";
if (!apiKey && !listOnly) {
  console.error("GEMINI_API_KEY が ありません（GitHub の Environment「Preview」に あります）");
  process.exit(1);
}

const targets = LIVE_VOICES.filter((voice) => only.length === 0 || only.includes(voice.name));

/** 本体。トップレベルの await を 使わない（`make_meeting_audio.ts` の 覚書と 同じ）。 */
async function main(): Promise<void> {
  if (listOnly) {
    for (const voice of targets) console.log(`${voice.name}\t${voice.gender}\t${voice.style}`);
    console.log(`合計 ${targets.length}本 「${VOICE_SAMPLE_TEXT}」`);
    return;
  }
  const outDir = join("public", "audio", "voices");
  mkdirSync(outDir, { recursive: true });

  const failed: string[] = [];
  let made = 0;
  for (const [index, voice] of targets.entries()) {
    const file = join(outDir, `${voice.name}.wav`);
    const head = `(${index + 1}/${targets.length}) ${voice.name}`;
    if (existsSync(file) && !force) {
      console.log(`${head} … すでに あります`);
      made += 1;
      continue;
    }
    process.stdout.write(`${head} … `);
    try {
      const spoken = await synthesizeWithFallback(VOICE_SAMPLE_TEXT, {
        apiKey,
        voice: voice.name,
      });
      writeFileSync(file, toWav(spoken.pcm));
      made += 1;
      const seconds = (spoken.pcm.byteLength / OUT_RATE / 2).toFixed(1);
      // 読み上げた 中身を 残す。ログだけで 台本と 見くらべられる
      console.log(`${seconds}秒 「${spoken.transcript.trim()}」`);
    } catch (error) {
      // 1つ 作れなくても 全部を 捨てない。もう一度 走らせれば 足りない ぶんだけ 作る
      console.log("できませんでした");
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      failed.push(voice.name);
    }
  }

  console.log(`声の 見本: ${made}/${targets.length}`);
  if (failed.length > 0) {
    console.warn(
      `⚠ 作れなかった 声: ${failed.join(" ")}（もう一度 走らせると 足りない ぶんだけ 作ります）`,
    );
  }
  if (made === 0) {
    console.error("1つも 作れませんでした");
    process.exit(1);
  }
}

// Live の つなぎが 残って node が 終わらない ので、書き終えたら 自分で 終わる
//（`make_meeting_audio.ts` の 覚書。Actions の 30分 上限まで 居座る）
void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
