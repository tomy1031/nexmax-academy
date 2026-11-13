"use client";

/**
 * 相談の 練習の 効果音（気づいた・合格・もう一度）。
 *
 * 音の ファイルは 持たない——ブラウザの 音の 部品（Web Audio）で 短い 音を 作る。
 * 3つとも 1秒に 満たない ので、ファイルを 足して Worker や 回線を 重く する ほどでは ない。
 * BGM（朝・作業中・成功）は 素材が まだ 無い（仕様書 v4 §10 の 確認したい こと）。
 *
 * 音が 鳴らせない 端末（自動再生の 制限・古い ブラウザ）では 黙る。学習は 止めない。
 */

export type NovelSe = "notice" | "pass" | "retry";

const NOTES: Record<NovelSe, readonly { freq: number; at: number; length: number }[]> = {
  // 気づいた: 短く 2つ 上がる
  notice: [
    { freq: 880, at: 0, length: 0.12 },
    { freq: 1318.5, at: 0.1, length: 0.2 },
  ],
  // 合格: ド・ミ・ソ・ド
  pass: [
    { freq: 523.25, at: 0, length: 0.14 },
    { freq: 659.25, at: 0.12, length: 0.14 },
    { freq: 783.99, at: 0.24, length: 0.14 },
    { freq: 1046.5, at: 0.36, length: 0.32 },
  ],
  // もう一度: やわらかく 2つ 下がる（しかる 音に しない）
  retry: [
    { freq: 587.33, at: 0, length: 0.16 },
    { freq: 493.88, at: 0.16, length: 0.24 },
  ],
};

let shared: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    shared ??= new AudioContext();
    if (shared.state === "suspended") void shared.resume();
    return shared;
  } catch {
    return null;
  }
}

export function playNovelSe(kind: NovelSe, volume: number): void {
  if (volume <= 0) return;
  const ctx = context();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + 0.01;
    for (const note of NOTES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = note.freq;
      const peak = 0.18 * Math.min(1, Math.max(0, volume));
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(peak, start + note.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + note.at);
      osc.stop(start + note.at + note.length + 0.05);
    }
  } catch {
    // 鳴らせない ときは 黙る
  }
}
