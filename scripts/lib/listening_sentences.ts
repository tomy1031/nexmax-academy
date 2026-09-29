/**
 * リスニングの 原稿を 1文ずつに 割る・文の 音の 前後の 無音を 切る（鍵の 要らない 純粋な 関数）。
 *
 * `scripts/make_listening_audio.ts` の 1文ずつ 作る 道（`listening_audio_plans.ts`）で 使う。
 */

import { SAMPLE_RATE } from "../../src/lib/audio/wav";

// 文の 割りかたは 画面（こたえあわせの 文ごとの 音）と 共用する（ずらさない ため）
export {
  scriptSentences,
  sentenceFileName,
  splitSentences,
  type SpeakerSentence,
} from "../../src/lib/audio/sentences";

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

/**
 * 音の 頭と おしりを ごく 短く（10ミリ秒）ふわっと 入れて 消す。
 * 切った ところの 小さな 雑音から 無音（0）へ 急に 変わると、そこが 小さく 鳴る。
 * Live も 無音なしで いきなり 声から 始まる 音を 返す ことが ある（2026-09-29 の ①で 4本）。
 */
export function fadeEdges(pcm: Uint8Array, ms = 10): Uint8Array {
  const out = new Uint8Array(pcm);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const samples = Math.floor(out.byteLength / 2);
  const span = Math.min(Math.round((SAMPLE_RATE * ms) / 1000), Math.floor(samples / 2));
  for (let i = 0; i < span; i += 1) {
    const gain = 0.5 - 0.5 * Math.cos((Math.PI * i) / span);
    view.setInt16(i * 2, Math.round(view.getInt16(i * 2, true) * gain), true);
    const j = samples - 1 - i;
    view.setInt16(j * 2, Math.round(view.getInt16(j * 2, true) * gain), true);
  }
  return out;
}
