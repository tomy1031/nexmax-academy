import { describe, expect, it } from "vitest";
import { bytesToSeconds, DEFAULT_GAP_MS, joinPcm, SAMPLE_RATE } from "../src/lib/audio/wav";

/**
 * 台本の音声づくりの土台。
 *
 * ここがずれると、字幕（script[].at）と音がずれて、学習者は聞こえている行と
 * 違う行を見ながら聞くことになる。聞き取りの練習として成立しなくなる。
 */

/** 秒数ぶんの 16bit モノラルPCM（中身は無音でよい。長さだけが意味を持つ）。 */
const pcmOfSeconds = (seconds: number) => new Uint8Array(Math.round(SAMPLE_RATE * 2 * seconds));

describe("joinPcm", () => {
  it("1行目は0秒から始まる", () => {
    const { startSeconds } = joinPcm([pcmOfSeconds(1)]);
    expect(startSeconds).toEqual([0]);
  });

  it("2行目の開始は「1行目の長さ＋あいだの無音」になる", () => {
    const { startSeconds } = joinPcm([pcmOfSeconds(2), pcmOfSeconds(1)]);
    expect(startSeconds[0]).toBe(0);
    expect(startSeconds[1]).toBeCloseTo(2 + DEFAULT_GAP_MS / 1000, 2);
  });

  it("開始秒は行の数だけ返る（字幕と1対1で対応させるため）", () => {
    const { startSeconds } = joinPcm([pcmOfSeconds(1), pcmOfSeconds(1), pcmOfSeconds(1)]);
    expect(startSeconds).toHaveLength(3);
  });

  it("開始秒は必ず前の行より後ろになる（逆順だと字幕が戻る）", () => {
    const { startSeconds } = joinPcm([0.4, 1.2, 0.8, 2].map(pcmOfSeconds));
    for (let i = 1; i < startSeconds.length; i += 1) {
      expect(startSeconds[i]!).toBeGreaterThan(startSeconds[i - 1]!);
    }
  });

  it("つないだ長さは「全部の行＋あいだの無音」と一致する", () => {
    const gapBytes = Math.round((SAMPLE_RATE * DEFAULT_GAP_MS) / 1000) * 2;
    const { pcm } = joinPcm([pcmOfSeconds(1), pcmOfSeconds(1)]);
    expect(pcm.length).toBe(pcmOfSeconds(1).length * 2 + gapBytes);
  });

  it("行が1つも無くても落ちない（台本を書く前に押されても壊れない）", () => {
    const { pcm, startSeconds } = joinPcm([]);
    expect(pcm.length).toBe(0);
    expect(startSeconds).toEqual([]);
  });

  it("あいだの無音は0にもできる（詰めたいときのため）", () => {
    const { startSeconds } = joinPcm([pcmOfSeconds(1), pcmOfSeconds(1)], 0);
    expect(startSeconds[1]).toBe(1);
  });
});

describe("bytesToSeconds", () => {
  it("24kHz・16bit・モノラルとして数える（ここを取り違えると倍速・半速になる）", () => {
    expect(bytesToSeconds(SAMPLE_RATE * 2)).toBe(1);
    expect(bytesToSeconds(0)).toBe(0);
  });

  it("小数第2位まで（字幕の追従はこの粗さで足りる）", () => {
    expect(bytesToSeconds(SAMPLE_RATE * 2 * 1.239)).toBe(1.24);
  });
});
