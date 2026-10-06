/**
 * 音の ひとまとまり（短い 文を となりと 1つに した 音）から、一部の 文だけを 切り出す
 *（鍵の 要らない 純粋な 関数。`scripts/cut_sentence_parts.ts` で 使う）。
 *
 * ## どこで 切るか
 * ひとまとまりは Live が 1回で 読んだ 音なので、文と 文の あいだには 自然な 間（0.2〜0.6秒）が ある。
 * ただし「それでは、」の ような 読点の 間も ある。だから **原稿の 読みの 長さの 割合から
 * 文の 切れ目が 来る はずの 時刻を 見積もり、いちばん 近い 間で 切る**。
 * 見積もりと 間が 離れすぎて いたら 切らない（まちがった 所で 切った 音を 置かない）。
 */

import { SAMPLE_RATE } from "../../src/lib/audio/wav";
import { fadeEdges, trimSilence } from "./listening_sentences";

const BYTES_PER_SAMPLE = 2;
/** 無音か どうかを 見る 窓（10ミリ秒）。 */
const WINDOW = Math.round(SAMPLE_RATE / 100);

/** 声の あいだの 間（サンプルの 位置）。 */
export interface Pause {
  readonly start: number;
  readonly end: number;
}

/**
 * 声の あいだの 間を 並べる（頭と おしりの 無音は 数えない）。`minMs` より 短い 間は 数えない。
 *
 * しきいは 10ミリ秒の RMS で **330**（約 -40dBFS）。`trimSilence` の 60 は「文の おわりの 息の 音を
 * 切らない」ための 低い 値で、文と 文の あいだに 小さな 息が 入った 音（朝礼の 21.wav）では
 * 間が 1つも 見つからなかった。ここで 探すのは 声の 切れ目なので、息は 間に 数える。
 */
export function innerPauses(
  pcm: Uint8Array,
  { threshold = 330, minMs = 120 } = {},
): { pauses: Pause[]; voiceStart: number; voiceEnd: number } {
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
  if (first < 0) return { pauses: [], voiceStart: 0, voiceEnd: samples };
  const minWindows = Math.ceil(minMs / 10);
  const pauses: Pause[] = [];
  let runStart = -1;
  for (let i = first; i <= last; i += 1) {
    if (!loud[i]) {
      if (runStart < 0) runStart = i;
      continue;
    }
    if (runStart >= 0 && i - runStart >= minWindows) {
      pauses.push({ start: runStart * WINDOW, end: i * WINDOW });
    }
    runStart = -1;
  }
  return { pauses, voiceStart: first * WINDOW, voiceEnd: (last + 1) * WINDOW };
}

/** えらんだ 切れ目。`drift` は 見積もりとの ずれ（声の 秒）。 */
export interface Boundary {
  readonly pause: Pause;
  readonly drift: number;
}

/**
 * 文の 切れ目の 間を えらぶ。`weights` は 文ごとの 読みの 長さ（ひとまとまりの 文の 順）。
 *
 * **間を 除いた 声だけの 長さ**を 読みの 長さで 割り振り、切れ目 j（j 文目の あと）までに
 * 声が 出て いる はずの 長さに いちばん 近い 間を えらぶ（間は 読みを 運ばない ので、
 * 間ごと 割り振ると 長い 間の あとの 切れ目が 前に ずれる——朝礼の「はい。まだ…」で 実際に 外れた）。
 * 前の 切れ目より 後ろで なければ ならず、見積もりから `maxDriftSec` を 超えて 離れたら `null`。
 */
export function pickBoundaries(
  pauses: readonly Pause[],
  voiceStart: number,
  voiceEnd: number,
  weights: readonly number[],
  { maxDriftSec = 0.5 } = {},
): Boundary[] | null {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const silent = pauses.reduce((sum, pause) => sum + pause.end - pause.start, 0);
  const voiced = voiceEnd - voiceStart - silent;
  // 間ごとに「その 間の 前までに 声が 出て いた 長さ」
  let spent = 0;
  const spoken = pauses.map((pause) => {
    const before = pause.start - voiceStart - spent;
    spent += pause.end - pause.start;
    return before;
  });
  const picked: Boundary[] = [];
  let before = 0;
  let next = 0;
  for (let j = 0; j < weights.length - 1; j += 1) {
    before += weights[j]!;
    const expected = (voiced * before) / total;
    let best = -1;
    for (let i = next; i < pauses.length; i += 1) {
      if (best < 0 || Math.abs(spoken[i]! - expected) < Math.abs(spoken[best]! - expected)) {
        best = i;
      }
    }
    if (best < 0) return null;
    const drift = (spoken[best]! - expected) / SAMPLE_RATE;
    if (Math.abs(drift) > maxDriftSec) return null;
    picked.push({ pause: pauses[best]!, drift });
    next = best + 1;
  }
  return picked;
}

/** 間の 中に 残す のりしろ（秒）。前の 文の おわりの 息（「す」）と、次の 文の 出だしの 小さな 子音を 削らない。 */
const KEEP_AFTER_VOICE = 0.12;
const KEEP_BEFORE_VOICE = 0.08;

/**
 * `from` 文目から `to` 文目までを 切り出す（1から 数える）。
 *
 * 間の **境目ちょうど**では 切らない——間の しきい（約 -40dBFS）より 小さい 声（文の おわりの
 * 息・出だしの「す」「ち」）が 境目の 外に ある。間の 中に のりしろを 残して 切り
 *（間の 半分まで）、そのあと 文ごとの 音と 同じ のりしろ（`trimSilence`）と ふち（`fadeEdges`）に そろえる。
 */
export function cutPart(
  pcm: Uint8Array,
  boundaries: readonly Pause[],
  from: number,
  to: number,
): Uint8Array {
  const samples = Math.floor(pcm.byteLength / BYTES_PER_SAMPLE);
  const keep = (pause: Pause, sec: number) =>
    Math.min(Math.round(SAMPLE_RATE * sec), Math.floor((pause.end - pause.start) / 2));
  const head = from > 1 ? boundaries[from - 2]! : null;
  const tail = to <= boundaries.length ? boundaries[to - 1]! : null;
  const start = head ? head.end - keep(head, KEEP_BEFORE_VOICE) : 0;
  const end = tail ? tail.start + keep(tail, KEEP_AFTER_VOICE) : samples;
  const slice = pcm.slice(start * BYTES_PER_SAMPLE, end * BYTES_PER_SAMPLE);
  return fadeEdges(trimSilence(slice));
}

/** WAV（16bit・モノラル・24kHz）の 生PCM を 取り出す。形が ちがえば 止める。 */
export function wavToPcm(wav: Uint8Array): Uint8Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("WAV では ない");
  let at = 12;
  let format: { channels: number; rate: number; bits: number } | null = null;
  while (at + 8 <= wav.byteLength) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      format = {
        channels: view.getUint16(at + 10, true),
        rate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true),
      };
    }
    if (id === "data") {
      if (!format || format.channels !== 1 || format.rate !== SAMPLE_RATE || format.bits !== 16) {
        throw new Error(`16bit・モノラル・${SAMPLE_RATE}Hz では ない: ${JSON.stringify(format)}`);
      }
      return wav.slice(at + 8, at + 8 + size);
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("data が 無い");
}
