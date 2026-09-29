/**
 * 音の 速さを 変える（scripts/lib/tempo.ts）。2026-09-29 の 指定「スピードは 1.25」。
 * CI の 実行環境に ffmpeg が 無かった ので 自前で 変える——**長さは 1/tempo、音程は そのまま**を 見る。
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_RATE } from "../src/lib/audio/wav";
import { timeStretch } from "../scripts/lib/tempo";

/** 周波数 hz の 正弦波（16bit）。 */
function sine(hz: number, seconds: number): Uint8Array {
  const n = Math.round(SAMPLE_RATE * seconds);
  const view = new DataView(new ArrayBuffer(n * 2));
  for (let i = 0; i < n; i += 1) {
    view.setInt16(i * 2, Math.round(8000 * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE)), true);
  }
  return new Uint8Array(view.buffer);
}

/** 0 を よこぎる 回数から 周波数を 見つもる（真ん中の 部分だけ 見る）。 */
function frequency(pcm: Uint8Array): number {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const n = pcm.byteLength / 2;
  const from = Math.floor(n * 0.2);
  const to = Math.floor(n * 0.8);
  let crossings = 0;
  for (let i = from + 1; i < to; i += 1) {
    const a = view.getInt16((i - 1) * 2, true);
    const b = view.getInt16(i * 2, true);
    if ((a < 0 && b >= 0) || (a >= 0 && b < 0)) crossings += 1;
  }
  return crossings / 2 / ((to - from) / SAMPLE_RATE);
}

describe("音の 速さを 変える（WSOLA）", () => {
  it("1.25倍に すると 長さは 0.8倍", () => {
    const out = timeStretch(sine(220, 2), 1.25);
    expect(out.byteLength / 2 / SAMPLE_RATE).toBeCloseTo(1.6, 1);
  });

  it("音程（周波数）は 変わらない", () => {
    for (const hz of [150, 220, 330]) {
      const out = timeStretch(sine(hz, 2), 1.25);
      expect(Math.abs(frequency(out) - hz) / hz, `${hz}Hz`).toBeLessThan(0.03);
    }
  });

  it("音の 大きさも 変わらない（重ね合わせで 大きく／小さく ならない）", () => {
    const out = timeStretch(sine(220, 2), 1.25);
    const view = new DataView(out.buffer);
    let peak = 0;
    for (let i = 4800; i < out.byteLength / 2 - 4800; i += 1) {
      peak = Math.max(peak, Math.abs(view.getInt16(i * 2, true)));
    }
    expect(peak).toBeGreaterThan(7200);
    expect(peak).toBeLessThan(8800);
  });

  it("1 なら そのまま", () => {
    const input = sine(220, 0.5);
    expect([...timeStretch(input, 1)]).toEqual([...input]);
  });
});
