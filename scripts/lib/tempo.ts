/**
 * 音の 速さを 変える（**音程は 変えない**）— WSOLA（波形の 重ね合わせ）
 *
 * ## なぜ 自前で 書くか（2026-09-29）
 * はじめは ffmpeg の atempo を 呼んで いたが、**GitHub Actions の 実行環境に ffmpeg が 無かった**
 *（`spawnSync ffmpeg ENOENT`。手もとの Mac には あったので 気づかなかった）。
 * 音づくりは 鍵の ある CI でしか 走らない ので、外の 道具に 頼らず ここで 変える。
 *
 * ## やりかた
 * 20ミリ秒の 窓で 音を 少しずつ 取り出し、半分ずつ 重ねて 並べ直す。取り出す 間隔を
 * 置く 間隔の `tempo` 倍に すると、全体が `1 / tempo` の 長さに なる。そのまま 重ねると
 * 波の 山と 谷が ずれて にごるので、**前の 窓の 続きに いちばん よく 合う 位置**を
 * ±6ミリ秒の 中から 探して 取り出す（似ぐあいは 4つおきの 標本で 見る——速さの ため）。
 */

import { SAMPLE_RATE } from "../../src/lib/audio/wav";

/** 窓の 長さ（20ミリ秒）。 */
const FRAME = Math.round(SAMPLE_RATE * 0.02);
/** 置く 間隔（窓の 半分）。ハン窓を 半分ずつ 重ねると 足して 1 に なる。 */
const HOP = FRAME / 2;
/** 合う 位置を 探す はば（±6ミリ秒）。 */
const SEEK = Math.round(SAMPLE_RATE * 0.006);
/** 似ぐあいを 見る ときに 飛ばす 標本の 数。 */
const DECIMATE = 4;

/** 16bit モノラルの PCM を `tempo` 倍の 速さに する（1.25 なら 長さは 0.8倍）。 */
export function timeStretch(pcm: Uint8Array, tempo: number): Uint8Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const n = Math.floor(pcm.byteLength / 2);
  if (tempo === 1 || n < FRAME * 2) return new Uint8Array(pcm);
  const input = new Float32Array(n);
  for (let i = 0; i < n; i += 1) input[i] = view.getInt16(i * 2, true);

  const window = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME);

  const outLength = Math.ceil(n / tempo) + FRAME;
  const out = new Float32Array(outLength);
  const weight = new Float32Array(outLength);
  const analysisHop = HOP * tempo;

  let previous = 0;
  for (let k = 0; ; k += 1) {
    const at = k * HOP;
    const nominal = Math.round(k * analysisHop);
    if (nominal + FRAME >= n || at + FRAME >= outLength) break;
    let pick = nominal;
    if (k > 0) {
      // 前の 窓の「自然な 続き」に いちばん 似た ところを 探す
      const natural = previous + HOP;
      let best = -Infinity;
      const from = Math.max(0, nominal - SEEK);
      const to = Math.min(n - FRAME, nominal + SEEK);
      for (let candidate = from; candidate <= to; candidate += 1) {
        let score = 0;
        for (let i = 0; i < FRAME; i += DECIMATE) {
          const a = input[candidate + i]!;
          const b = natural + i < n ? input[natural + i]! : 0;
          score += a * b;
        }
        if (score > best) {
          best = score;
          pick = candidate;
        }
      }
    }
    for (let i = 0; i < FRAME; i += 1) {
      out[at + i]! += input[pick + i]! * window[i]!;
      weight[at + i]! += window[i]!;
    }
    previous = pick;
  }

  const length = Math.min(outLength, Math.round(n / tempo));
  const result = new Uint8Array(length * 2);
  const outView = new DataView(result.buffer);
  for (let i = 0; i < length; i += 1) {
    const w = weight[i]!;
    const value = w > 1e-3 ? out[i]! / w : 0;
    outView.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(value))), true);
  }
  return result;
}
