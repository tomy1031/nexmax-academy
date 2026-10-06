/**
 * タイピングの お手本の 文だけの 音を、リスニングの 音の ひとまとまりから 切り出す（鍵は 要らない）
 *
 * ## なにを 直すための ものか（2026-10-06 の 指定）
 * リスニングの 音は「短い 文は 同じ 人の となりの 文と 1つの 音に する」（2026-09-29 の 指定）ので、
 * タイピングの お手本「パソコンと…確認しました。」の 音は「はい。パソコンと…」の 1つに 入って いる。
 * そのままだと 🔊 で 前の「はい。」まで 鳴る。お手本と ぴったり 同じ 音に する。
 *
 * ## 作り直さずに 切り出す わけ
 * - **「Issue」の 発音は 耳で 選んだ 1本**（docs/constraints.md）。作り直すと 選び直しに なる
 * - 同じ 音から 切れば、**リスニングで 聞いた 声と 同じ 声**で 聞ける
 *
 * ## 何を するか
 * `content/typing/*.json` の お手本の 文ごとに、`listeningRef` の リスニングの どの 音の どこに
 * あたるかを 調べ（`locateSentence`・画面と 同じ 当てかた）、**ひとまとまりの 一部**に あたる
 * 文だけ、文と 文の あいだの 間で 切って `public/audio/listening/<ID>/<番号>_<何文目>.wav` に 置く
 *（`sentencePartFileName`）。画面は その 音が あれば それを 鳴らす。
 * どこで 切ったか（秒・見積もりとの ずれ・話す 速さ）を 表で 出す。見積もりから 離れすぎた 所では 切らない。
 *
 * リスニングの 音を 作り直すと フォルダごと 消える ので、そのあと もう一度 これを 回す
 *（`tests/typing_sentence_audio.test.ts` が「切り出しが 無い」で 知らせる）。
 *
 * 使い方:
 *   `node --import tsx scripts/cut_sentence_parts.ts`         … 切って 置く
 *   `node --import tsx scripts/cut_sentence_parts.ts --dry`   … どこで 切るかだけ 見る
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_RATE } from "../src/lib/audio/wav";
import { buildFuriganaIndex } from "../src/lib/text/furigana";
import { buildSoundsIndex } from "../src/components/listening/listening-checks";
import { soundsLikeOf } from "../src/content/listening-sounds";
import { audioUnitsOf } from "../src/content/listening-audio";
import {
  locateSentence,
  scriptSentences,
  sentenceFileName,
  sentencePartFileName,
  splitSentences,
} from "../src/lib/audio/sentences";
import { toWav } from "./lib/live_tts";
import { scriptReading } from "./lib/speech_reading";
import { cutPart, innerPauses, pickBoundaries, wavToPcm } from "./lib/sentence_parts";

const dry = process.argv.includes("--dry");
const seconds = (samples: number) => (samples / SAMPLE_RATE).toFixed(2);

interface ScriptLine {
  speaker: string;
  text: string;
}

let failed = false;
let made = 0;
const done = new Set<string>();

for (const name of readdirSync(join("content", "typing")).sort()) {
  if (!name.endsWith(".json")) continue;
  const typing = JSON.parse(readFileSync(join("content", "typing", name), "utf8"));
  if (!typing.listeningRef) continue;
  const listening = JSON.parse(
    readFileSync(join("content", "listening", `${typing.listeningRef}.json`), "utf8"),
  ) as { id: string; script: ScriptLine[]; furigana?: [string, string][] };
  const dir = join("public", "audio", "listening", listening.id);
  const units = scriptSentences(listening.script, audioUnitsOf(listening.id)).map(
    (one) => one.text,
  );
  const furigana = buildFuriganaIndex(listening.furigana ?? []);
  const sounds = buildSoundsIndex(soundsLikeOf(listening.id));
  const reading = (text: string) => scriptReading(text, furigana, sounds).length;

  console.log(`\n■ ${typing.id}（${listening.id}）`);
  for (const sentence of typing.sentences as { text: string }[]) {
    const part = locateSentence(units, sentence.text, (index) =>
      existsSync(join(dir, sentenceFileName(index))),
    );
    if (!part) {
      console.log(`  ✗ 音が 見つからない: ${sentence.text}`);
      failed = true;
      continue;
    }
    if (part.from === 1 && part.to === part.count) continue;

    const out = sentencePartFileName(part);
    if (done.has(join(dir, out))) continue;
    done.add(join(dir, out));
    const pcm = wavToPcm(new Uint8Array(readFileSync(join(dir, sentenceFileName(part.unit)))));
    const parts = splitSentences(units[part.unit]!);
    const weights = parts.map(reading);
    const { pauses, voiceStart, voiceEnd } = innerPauses(pcm);
    const picked = pickBoundaries(pauses, voiceStart, voiceEnd, weights);
    if (!picked) {
      console.log(`  ✗ 文の 切れ目の 間が 見つからない（切らない）: ${out} ${units[part.unit]}`);
      failed = true;
      continue;
    }
    const cut = cutPart(
      pcm,
      picked.map((one) => one.pause),
      part.from,
      part.to,
    );

    // 話す 速さ（読みの 字 ÷ 秒）。切り出しが ひとまとまりと 大きく ちがえば 切り所が おかしい
    const unitRate = weights.reduce((a, b) => a + b, 0) / ((voiceEnd - voiceStart) / SAMPLE_RATE);
    const cutWeight = weights.slice(part.from - 1, part.to).reduce((a, b) => a + b, 0);
    const cutVoice = innerPauses(cut);
    const cutRate = cutWeight / ((cutVoice.voiceEnd - cutVoice.voiceStart) / SAMPLE_RATE);
    const used = [part.from > 1 ? picked[part.from - 2] : null, picked[part.to - 1] ?? null]
      .filter((one) => one !== null && one !== undefined)
      .map(
        (one) =>
          `間 ${seconds(one!.pause.start)}〜${seconds(one!.pause.end)}秒で 切る（見積もりとの ずれ ${one!.drift.toFixed(2)}秒）`,
      );
    console.log(
      `  ✂ ${out}  ${parts.slice(part.from - 1, part.to).join("")}\n` +
        `      元 ${sentenceFileName(part.unit)}「${units[part.unit]}」\n` +
        `      ${used.join("・")}\n` +
        `      できた 長さ ${seconds(cut.byteLength / 2)}秒・速さ ${cutRate.toFixed(1)}字/秒（元 ${unitRate.toFixed(1)}字/秒）`,
    );
    if (!dry) writeFileSync(join(dir, out), toWav(cut));
    made += 1;
  }
}

console.log(`\n${dry ? "（--dry）" : ""}切り出し ${made}本`);
if (failed) process.exit(1);
