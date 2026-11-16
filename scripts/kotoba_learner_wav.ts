/**
 * Kotoba Town の 通し試験で 使う「学習者の 声」を 作る（Live TTS）。
 * 使い方: GEMINI_API_KEY=… node --import tsx scripts/kotoba_learner_wav.ts "<文>" [voice]
 * 出力: kotoba-town/e2e/learner.wav（あとに 2.5 秒の 無音を 足す。偽マイクで くり返し 流れる）
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { OUT_RATE, synthesizeWithFallback, toWav } from "./lib/live_tts";

async function main(): Promise<void> {
  const text = process.argv[2] ?? "はじめまして。リンです。ベトナムから きました。どうぞ よろしく おねがいします。";
  const voice = process.argv[3] ?? "Puck";
  const spoken = await synthesizeWithFallback(text, { apiKey: process.env.GEMINI_API_KEY ?? "", voice, quoteOnRetry: true });
  const pad = new Uint8Array(Math.round(OUT_RATE * 2.5) * 2);
  const pcm = new Uint8Array(pad.length * 2 + spoken.pcm.byteLength);
  pcm.set(pad, 0);
  pcm.set(spoken.pcm, pad.length);
  mkdirSync("kotoba-town/e2e", { recursive: true });
  writeFileSync("kotoba-town/e2e/learner.wav", toWav(pcm));
  console.log(`learner.wav: ${(pcm.byteLength / 2 / OUT_RATE).toFixed(1)}s (${spoken.model}) 「${spoken.transcript}」`);
}
void main().then(() => process.exit(0)).catch((e: unknown) => { console.error(e); process.exit(1); });
