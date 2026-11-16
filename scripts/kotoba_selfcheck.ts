/**
 * Kotoba Town の 判定（Gemini Live）を 本物の API で 確かめる。
 *
 * 1. 学習者の 答えを Live TTS で 声に する（教材の 音声づくりと 同じ 道）
 * 2. lab の `kotoba-town/js/talk/brain.js`（ヘッドセットで 動く ものと 同じ コード）に、
 *    マイクと 同じ 形（16kHz PCM・100ms ずつ）で 流し込む
 * 3. `judge_reply` の 判定と、"react" の ときの 返事の 声を 記録する
 *
 * 結果: kotoba-town/out/selfcheck.json
 * 使い方: GEMINI_API_KEY=… node --import tsx scripts/kotoba_selfcheck.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_RATE, synthesizeWithFallback } from "./lib/live_tts";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const ROOT = "kotoba-town";
const fixture = JSON.parse(readFileSync(join(ROOT, "selfcheck.json"), "utf8"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (!apiKey) throw new Error("GEMINI_API_KEY が ありません");
  const { LiveBrain } = await import("../kotoba-town/js/talk/brain.js");
  const { turnNote, endNote } = await import("../kotoba-town/js/talk/judge.js");
  const { resample, floatToPcm16, bytesToBase64 } = await import("../kotoba-town/js/talk/live.js");

  const results: unknown[] = [];
  for (const [n, c] of (fixture.cases as { say: string; voice: string; expect: string[]; decide: string }[]).entries()) {
    const started = Date.now();
    // 1) learner voice
    const spoken = await synthesizeWithFallback(c.say, { apiKey, voice: c.voice, quoteOnRetry: true });
    const view = new DataView(spoken.pcm.buffer, spoken.pcm.byteOffset, spoken.pcm.byteLength);
    const f32 = new Float32Array(spoken.pcm.byteLength >> 1);
    for (let i = 0; i < f32.length; i += 1) f32[i] = view.getInt16(i * 2, true) / 0x8000;
    const mic = resample(f32, OUT_RATE, 16_000);

    // 2) brain
    let verdict: Record<string, unknown> | null = null;
    let npcAudioBytes = 0;
    let npcText = "";
    let status = "";
    let npcDone = false;
    const brain = new LiveBrain({
      apiKey,
      lesson: fixture.lesson,
      variant: fixture.variant,
      character: fixture.character,
      learnerName: "リン",
      on: {
        status: (s: string, d: string) => {
          status += `${s}${d ? `(${d})` : ""} `;
        },
        judge: (r: Record<string, unknown>) => {
          verdict = r;
          return c.decide;
        },
        npcAudio: (b64: string) => {
          npcAudioBytes += Buffer.from(b64, "base64").byteLength;
        },
        npcText: (t: string) => {
          npcText += t;
        },
        npcDone: () => {
          npcDone = true;
        },
        error: (reason: string, tried: string[]) => {
          status += `error:${reason} ${JSON.stringify(tried)} `;
        },
      },
    });
    const ok = await brain.connect();
    let report: unknown = null;
    if (ok) {
      const t = fixture.turn;
      brain.setTurn(
        turnNote({ k: 1, character: fixture.character, npcLines: t.npcLines, listen: t.listen, grammar: fixture.lesson.grammar }),
        t.listen.branches.map((b: { id: string }) => b.id),
      );
      await sleep(600);
      // stream like the headset: 100 ms chunks in real time, then silence so activity detection ends the turn
      const CH = 1600;
      for (let i = 0; i < mic.length; i += CH) {
        brain.audio(bytesToBase64(new Uint8Array(floatToPcm16(mic.subarray(i, i + CH)).buffer)));
        await sleep(100);
      }
      const silence = bytesToBase64(new Uint8Array(CH * 2));
      for (let i = 0; i < 25 && !verdict; i += 1) {
        brain.audio(silence);
        await sleep(100);
      }
      for (let i = 0; i < 150 && !verdict; i += 1) await sleep(100);
      if (c.decide !== "nothing") for (let i = 0; i < 120 && !npcDone; i += 1) await sleep(100);
      // final report on the last case
      if (n === fixture.cases.length - 1) {
        report = await brain.report(
          endNote({ turns: [{ promptEn: fixture.turn.listen.promptEn, heard: (verdict as { heard?: string } | null)?.heard ?? "", score: (verdict as { score?: number } | null)?.score ?? 0 }] }),
          20_000,
        );
      }
    }
    const branch = (verdict as { branch?: string } | null)?.branch ?? "(none)";
    const row = {
      say: c.say,
      model: brain.model,
      status: status.trim(),
      verdict,
      pass: c.expect.includes(branch),
      expect: c.expect,
      npcSpeechSeconds: Math.round((npcAudioBytes / 2 / 24_000) * 10) / 10,
      npcText,
      report,
      ms: Date.now() - started,
    };
    brain.close();
    results.push(row);
    console.log(JSON.stringify(row, null, 1));
    await sleep(4_000);
  }
  mkdirSync(join(ROOT, "out"), { recursive: true });
  writeFileSync(join(ROOT, "out", "selfcheck.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 1) + "\n");
  const passed = results.filter((r) => (r as { pass: boolean }).pass).length;
  console.log(`SELFCHECK ${passed}/${results.length}`);
}

void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
