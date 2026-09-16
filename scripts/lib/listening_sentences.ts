/**
 * リスニングの 原稿を 1文ずつに 割る・文の 音の 前後の 無音を 切る（鍵の 要らない 純粋な 関数）。
 *
 * `scripts/make_listening_audio.ts` の 1文ずつ 作る 道（`listening_audio_plans.ts`）で 使う。
 */

import { SAMPLE_RATE } from "../../src/lib/audio/wav";

/** 文の おわりの 記号。 */
const SENTENCE_END = /[。？！?!]/;
/** かっこの 開き と 閉じ。かっこの 中の「。」では 割らない。 */
const OPEN = /[「『（(]/;
const CLOSE = /[」』）)]/;

/**
 * 1行を 文に 割る。
 *
 * - 「。」「？」「！」の あとで 割る。
 * - **かっこの 中では 割らない**（「きょうは 休みです。」と 言った——を 2つに しない）。
 * - 文の おわりに 続く 閉じかっこは 前の 文に 付ける。
 * - 前後の 空白は 落とす（分かち書きの 空白が 頭に 残らない ように）。
 */
export function splitSentences(text: string): string[] {
  const chars = [...text];
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    if (OPEN.test(ch)) depth += 1;
    else if (CLOSE.test(ch)) depth = Math.max(0, depth - 1);
    if (depth > 0 || !SENTENCE_END.test(ch)) continue;
    let end = i + 1;
    while (end < chars.length && SENTENCE_END.test(chars[end]!)) end += 1;
    out.push(chars.slice(start, end).join("").trim());
    start = end;
    i = end - 1;
  }
  out.push(chars.slice(start).join("").trim());
  return out.filter((sentence) => sentence.length > 0);
}

/** 話す人つきの 1文。 */
export interface SpeakerSentence {
  readonly speaker: string;
  readonly text: string;
}

/** 原稿（行の 並び）を、話す人つきの 文の 並びに する。 */
export function scriptSentences(
  script: readonly { readonly speaker: string; readonly text: string }[],
): SpeakerSentence[] {
  return script.flatMap((line) =>
    splitSentences(line.text).map((text) => ({ speaker: line.speaker, text })),
  );
}

/** 文ごとの wav の ファイル名（`01.wav` から）。並び順が そのまま つなぐ 順。 */
export function sentenceFileName(index: number): string {
  return `${String(index + 1).padStart(2, "0")}.wav`;
}

const BYTES_PER_SAMPLE = 2;
/** 無音か どうかを 見る 窓（10ミリ秒）。 */
const WINDOW = Math.round(SAMPLE_RATE / 100);

/**
 * 声の 前後の 無音を 切る（16bit・モノラルの 生PCM）。
 *
 * ## なぜ 切るか
 * 文と 文の あいだを **指定の 秒に そろえる** ため。Live の 音は 頭と おしりに
 * 少し 無音が 付く ことが あり、そのまま つなぐと 文ごとに 間が ばらつく。
 *
 * ## 切りすぎない
 * 文の おわりの「す」は 声が 出ない 息の 音で、小さい。だから
 * - しきいは 10ミリ秒の 平均の 大きさ（RMS）で **60**（声は 5000前後、無音は 0〜30。
 *   2026-09-16 に `kaisha_shugyo_keitai_listening.wav` で 測った）
 * - 見つけた 声の 前に 60ミリ秒、後ろに 120ミリ秒 の のりしろを 残す。
 * 声が 見つからない（全部 無音）ときは そのまま 返す——空に しない。
 */
export function trimSilence(
  pcm: Uint8Array,
  { threshold = 60, headMs = 60, tailMs = 120 } = {},
): Uint8Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = Math.floor(pcm.byteLength / BYTES_PER_SAMPLE);
  const loud: number[] = [];
  for (let at = 0; at + WINDOW <= samples; at += WINDOW) {
    let sum = 0;
    for (let k = 0; k < WINDOW; k += 1) {
      const value = view.getInt16((at + k) * BYTES_PER_SAMPLE, true);
      sum += value * value;
    }
    if (Math.sqrt(sum / WINDOW) > threshold) loud.push(at);
  }
  if (loud.length === 0) return pcm;
  const head = Math.round((SAMPLE_RATE * headMs) / 1000);
  const tail = Math.round((SAMPLE_RATE * tailMs) / 1000);
  const from = Math.max(0, loud[0]! - head);
  const to = Math.min(samples, loud[loud.length - 1]! + WINDOW + tail);
  return pcm.slice(from * BYTES_PER_SAMPLE, to * BYTES_PER_SAMPLE);
}

/**
 * 声の 中で いちばん 長い「間」（秒）。頭と おしりの 無音は 数えない。
 *
 * 2026-09-16 に 同じ 文が 前の 回の 倍の 長さ（4.0秒 → 8.6秒）で 返って きた。
 * 文字起こしは 原稿どおり なので 読みの 照合では 気づけない——文の 途中に
 * 長い 間が 入った 音は 学習者には「止まった」と 聞こえる。長さで 見る。
 */
export function longestInnerPause(pcm: Uint8Array, { threshold = 60 } = {}): number {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = Math.floor(pcm.byteLength / BYTES_PER_SAMPLE);
  const loud: boolean[] = [];
  for (let at = 0; at + WINDOW <= samples; at += WINDOW) {
    let sum = 0;
    for (let k = 0; k < WINDOW; k += 1) {
      const value = view.getInt16((at + k) * BYTES_PER_SAMPLE, true);
      sum += value * value;
    }
    loud.push(Math.sqrt(sum / WINDOW) > threshold);
  }
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  let longest = 0;
  let run = 0;
  for (let i = first; first >= 0 && i <= last; i += 1) {
    run = loud[i] ? 0 : run + 1;
    longest = Math.max(longest, run);
  }
  return (longest * WINDOW) / SAMPLE_RATE;
}
