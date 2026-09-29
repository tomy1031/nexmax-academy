/**
 * まとめて 読んだ 会話の 音を、**文と 文の あいだの 間**で 1文ずつに 切る
 *
 * ## なぜ 要るか（2026-09-28 の 指定「会話の 合間を 切り取って、一人一人の セリフ再生の 時に 分割」）
 * TTS は 会話を 1本の 音で 返す（`gemini_tts.ts`）。画面の「1行ずつ ▶」（`lineSentenceClips`）は
 * 文ごとの wav（`01.wav`…）を 鳴らすので、1本を 文の 数に 切り分ける。
 *
 * ## 切りかた
 * 1. 10ミリ秒ごとの 音の 大きさで **間**（無音の つづき）を 全部 拾う
 * 2. 文の 数 − 1 本の 間を **動的計画法で** えらぶ（`minBoundarySeconds` より 短い 間は 候補に しない）。よい 切れ目は
 *    - 間が 長い（文の おわりや 話す人の 交代は、読点より 長く 間が あく）
 *    - 切った 1文の 長さが、その 文の 読み（かなの 数）から 見こむ 長さに 近い
 *    の 2つを 合わせた 点で 決める。長さだけ・間だけの どちらか 一方だと、
 *    読点の 間を 文の 切れ目と 取りちがえたり、短い 返事（「はい。」）を 飛ばしたり する。
 * 3. 切った あと、1文ずつ 長さが 見こみから 大きく 外れて いないか 確かめる（`plausibleSplit`）。
 *    外れて いたら 使わない（呼ぶ 側が 作り直す）。
 *
 * 純関数のみ（鍵も ファイルも 使わない）。tests/split_dialogue.test.ts が 見張る。
 */

import { SAMPLE_RATE } from "../../src/lib/audio/wav";

const BYTES_PER_SAMPLE = 2;
/** 無音か どうかを 見る 窓（10ミリ秒）。 */
const WINDOW = Math.round(SAMPLE_RATE / 100);

/** 1つの 間（サンプル位置）。 */
export interface Pause {
  readonly start: number;
  readonly end: number;
}

/** 窓ごとの 音の 大きさ（RMS）。 */
function windowLevels(pcm: Uint8Array): number[] {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = Math.floor(pcm.byteLength / BYTES_PER_SAMPLE);
  const levels: number[] = [];
  for (let at = 0; at + WINDOW <= samples; at += WINDOW) {
    let sum = 0;
    for (let k = 0; k < WINDOW; k += 1) {
      const value = view.getInt16((at + k) * BYTES_PER_SAMPLE, true);
      sum += value * value;
    }
    levels.push(Math.sqrt(sum / WINDOW));
  }
  return levels;
}

/**
 * 声の あいだの 間を 全部 拾う（頭と おしりの 無音は 数えない）。
 * `minMs` より 短い 無音は 間と みなさない（子音の すきまを 拾わない）。
 */
export function findPauses(
  pcm: Uint8Array,
  { threshold = 60, minMs = 120 } = {},
): { pauses: Pause[]; speechStart: number; speechEnd: number } {
  const levels = windowLevels(pcm);
  const loud = levels.map((level) => level > threshold);
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  if (first < 0) return { pauses: [], speechStart: 0, speechEnd: 0 };
  const minWindows = Math.max(1, Math.round(minMs / 10));
  const pauses: Pause[] = [];
  let run = 0;
  for (let w = first; w <= last + 1; w += 1) {
    if (w <= last && !loud[w]) {
      run += 1;
      continue;
    }
    if (run >= minWindows) pauses.push({ start: (w - run) * WINDOW, end: w * WINDOW });
    run = 0;
  }
  return { pauses, speechStart: first * WINDOW, speechEnd: (last + 1) * WINDOW };
}

/** 切れ目の 点の 重み（`chooseCuts`）。 */
const LENGTH_PENALTY = 0.35;

/**
 * 文の 数に 切る 位置（サンプル）を えらぶ。えらべなければ `null`。
 *
 * `weights` は 文ごとの 見こみの 長さ（かなの 数 など。単位は 何でも よい——比だけ 使う）。
 * 点は「えらんだ 間の 長さ（秒）の 合計 − 0.35 × Σ|log(実際の 長さ ÷ 見こみ)|」。
 * log に するのは、長い 文の 1秒と 短い 文の 1秒の ずれを 同じに 数えない ため。
 */
export function chooseCuts(
  allPauses: readonly Pause[],
  speechStart: number,
  speechEnd: number,
  weights: readonly number[],
  { minBoundarySeconds = 0 } = {},
): number[] | null {
  const n = weights.length;
  if (n <= 1) return [];
  // 切れ目に なれる のは 長い 間だけ（`<long pause>` の 札を 置いた 切れ目）
  const pauses = allPauses.filter((p) => (p.end - p.start) / SAMPLE_RATE >= minBoundarySeconds);
  if (pauses.length < n - 1) return null;
  const total = weights.reduce((sum, w) => sum + Math.max(w, 0.5), 0);
  const span = speechEnd - speechStart;
  const expected = weights.map((w) => (span * Math.max(w, 0.5)) / total);
  const centers = pauses.map((p) => (p.start + p.end) / 2);
  const lengths = pauses.map((p) => Math.min((p.end - p.start) / SAMPLE_RATE, 1.5));
  const cost = (duration: number, want: number) =>
    duration <= 0 ? Number.POSITIVE_INFINITY : LENGTH_PENALTY * Math.abs(Math.log(duration / want));

  const m = pauses.length;
  // best[k][j] = 切れ目 k（0始まり）を 間 j に 置いた ときの 最高点
  const best: number[][] = Array.from({ length: n - 1 }, () =>
    new Array<number>(m).fill(-Infinity),
  );
  const from: number[][] = Array.from({ length: n - 1 }, () => new Array<number>(m).fill(-1));
  for (let j = 0; j < m; j += 1) {
    best[0]![j] = lengths[j]! - cost(centers[j]! - speechStart, expected[0]!);
  }
  for (let k = 1; k < n - 1; k += 1) {
    for (let j = k; j < m; j += 1) {
      for (let i = k - 1; i < j; i += 1) {
        const prev = best[k - 1]![i]!;
        if (prev === -Infinity) continue;
        const score = prev + lengths[j]! - cost(centers[j]! - centers[i]!, expected[k]!);
        if (score > best[k]![j]!) {
          best[k]![j] = score;
          from[k]![j] = i;
        }
      }
    }
  }
  let end = -1;
  let top = -Infinity;
  for (let j = n - 2; j < m; j += 1) {
    const score = best[n - 2]![j]! - cost(speechEnd - centers[j]!, expected[n - 1]!);
    if (score > top) {
      top = score;
      end = j;
    }
  }
  if (end < 0 || top === -Infinity) return null;
  const picked: number[] = [];
  for (let k = n - 2, j = end; k >= 0; k -= 1) {
    picked.unshift(j);
    j = from[k]![j]!;
  }
  return picked.map((j) => Math.round(centers[j]!));
}

/** 切る 位置で 分ける（位置は サンプル）。 */
export function splitAt(pcm: Uint8Array, cuts: readonly number[]): Uint8Array[] {
  const bounds = [0, ...cuts.map((c) => c * BYTES_PER_SAMPLE), pcm.byteLength];
  const out: Uint8Array[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) out.push(pcm.slice(bounds[i]!, bounds[i + 1]!));
  return out;
}

/**
 * 切った 1文ずつの 長さが、見こみから 大きく 外れて いないか。
 * 見こみは「その 文の 重み × 全体の 1あたりの 秒」。短い 返事（「はい。」）は 間の 分だけ
 * 長く 出るので、足し算の ゆとり（+1.0秒）も 持たせる。
 */
export function plausibleSplit(
  secondsEach: readonly number[],
  weights: readonly number[],
): { ok: boolean; why: string } {
  const total = weights.reduce((sum, w) => sum + Math.max(w, 0.5), 0);
  const span = secondsEach.reduce((sum, s) => sum + s, 0);
  for (let i = 0; i < secondsEach.length; i += 1) {
    const want = (span * Math.max(weights[i]!, 0.5)) / total;
    const got = secondsEach[i]!;
    if (got < want * 0.35 - 0.3 || got > want * 2.2 + 1.0) {
      return {
        ok: false,
        why: `${i + 1}文目の 長さが 見こみと 合いません（${got.toFixed(1)}秒／見こみ ${want.toFixed(1)}秒）`,
      };
    }
  }
  return { ok: true, why: "長さは どの 文も 見こみの 範囲" };
}
