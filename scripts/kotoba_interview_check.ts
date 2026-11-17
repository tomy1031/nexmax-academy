/**
 * Kotoba Town の 面接の 判定を 本物の API で 確かめる（Gemini Live Extended Thinking）。
 *
 * 1. 4つの 答えを Live TTS で 声に する（外国の なまりの ある 日本語で）
 * 2. lab の `kotoba-town/js/talk/brain.js` に 1つの つなぎで 順に 流す（ヘッドセットと 同じ 形）
 * 3. 答えごとの 判定（基準・改善点・言い直し）と 返事までの 時間、最後の 面接の 評価を 記録する
 *
 * 結果: kotoba-town/out/interview_check.json
 * 使い方: GEMINI_API_KEY=… node --import tsx scripts/kotoba_interview_check.ts [LOW|MEDIUM|HIGH]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_RATE, synthesizeWithFallback } from "./lib/live_tts";

const apiKey = process.env.GEMINI_API_KEY ?? "";
// FAST = the conversation on gemini-3.8-live (default in the game); THINK-LOW / THINK-MEDIUM = Live Extended Thinking
const mode = (process.argv[2] || "FAST").toUpperCase();
const level = mode.startsWith("THINK") ? mode.split("-")[1] || "LOW" : "LOW";
const ROOT = "kotoba-town";
const fx = JSON.parse(readFileSync(join(ROOT, "interview_check.json"), "utf8"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hasKana = (s: string) => /[぀-ヿ]/.test(s);

async function main(): Promise<void> {
  if (!apiKey) throw new Error("GEMINI_API_KEY が ありません");
  const { LiveBrain } = await import("../kotoba-town/js/talk/brain.js");
  const { turnNote, endNote } = await import("../kotoba-town/js/talk/judge.js");
  const { resample, floatToPcm16, bytesToBase64, LIVE_MODELS, THINKING_MODEL } = await import("../kotoba-town/js/talk/live.js");
  const { reviewInterview } = await import("../kotoba-town/js/talk/review.js");

  // 1) the learner's voice for every answer (made first, so the session is not kept waiting)
  const voices: Float32Array[] = [];
  for (const t of fx.turns as { say: string }[]) {
    const spoken = await synthesizeWithFallback(t.say, { apiKey, voice: "Puck", instruction: `\n話し方の 指示（読み上げる 文には 入れない）: ${fx.learnerStyle}`, quoteOnRetry: true });
    const view = new DataView(spoken.pcm.buffer, spoken.pcm.byteOffset, spoken.pcm.byteLength);
    const f32 = new Float32Array(spoken.pcm.byteLength >> 1);
    for (let i = 0; i < f32.length; i += 1) f32[i] = view.getInt16(i * 2, true) / 0x8000;
    voices.push(resample(f32, OUT_RATE, 16_000));
    await sleep(3_000);
  }

  // 2) one session, like the game
  const trace: string[] = [];
  let status = "";
  let verdict: Record<string, unknown> | null = null;
  let asr = "";
  const brain = new LiveBrain({
    apiKey,
    trace,
    lesson: fx.lesson,
    variant: fx.variant,
    character: fx.character,
    learnerName: "リン",
    silenceMs: 1600,
    models: mode.startsWith("THINK") ? [THINKING_MODEL, ...LIVE_MODELS] : LIVE_MODELS,
    thinkingLevel: level,
    traceRaw: true,
    on: {
      status: (s: string, d: string) => { status += `${s}${d ? `(${d})` : ""} `; },
      heard: (t: string) => { asr = t; },
      judge: (r: Record<string, unknown>) => { verdict = r; return "nothing"; },
      error: (reason: string, tried: string[]) => { status += `error:${reason} ${JSON.stringify(tried)} `; },
    },
  });
  const started = Date.now();
  const ok = await brain.connect();
  const rows: unknown[] = [];
  const turns: Record<string, unknown>[] = [];
  if (ok) {
    for (const [k, t] of (fx.turns as Record<string, any>[]).entries()) {
      verdict = null; asr = "";
      brain.setTurn(
        turnNote({ k: k + 1, character: fx.character, npcLines: t.npcLines, listen: t.listen, grammar: fx.lesson.grammar }),
        t.listen.branches.map((b: { id: string }) => b.id),
      );
      await sleep(700);
      const mic = voices[k];
      const CH = 1600;
      for (let i = 0; i < mic.length; i += CH) {
        brain.audio(bytesToBase64(new Uint8Array(floatToPcm16(mic.subarray(i, i + CH)).buffer)));
        await sleep(100);
      }
      const spokeEnd = Date.now();
      const silence = bytesToBase64(new Uint8Array(CH * 2));
      for (let i = 0; i < 30 && !verdict; i += 1) { brain.audio(silence); await sleep(100); }
      for (let i = 0; i < 400 && !verdict; i += 1) await sleep(100); // up to 40 s for a thinking model
      const v = verdict as Record<string, any> | null;
      const missed: string[] = v?.criteriaMissed ?? [];
      const row = {
        say: t.say,
        asr,
        asrIsJapanese: hasKana(asr),
        verdict: v,
        msAfterSpeech: v ? Date.now() - spokeEnd : null,
        branchOk: !!v && t.expectBranch.includes(v.branch),
        missedOk: (t.expectMissed as string[]).every((c) => missed.includes(c)),
      };
      rows.push(row);
      console.log(JSON.stringify(row, null, 1));
      turns.push({
        questionJa: t.npcLines.map((l: { ja: string }) => l.ja).join(" "), promptEn: t.listen.promptEn, heard: v?.heard ?? asr, score: v?.score ?? 0,
        criteria: t.listen.criteria, criteriaMet: v?.criteriaMet ?? [], criteriaMissed: missed, lookForEn: t.listen.lookForEn,
      });
      await sleep(1_500);
    }
  }
  // 3) the interview evaluation
  const r0 = Date.now();
  const report = ok ? await brain.report(endNote({ turns, rubric: fx.lesson.rubric }), 60_000) : null;
  const reportMs = Date.now() - r0;
  const model = brain.model;
  brain.close();
  // 4) the considered evaluation by a thinking model (what the game shows at the end)
  const reviewLog: string[] = [];
  const v0 = Date.now();
  const review = await reviewInterview({ apiKey, lesson: fx.lesson, variant: fx.variant, turns, level: "HIGH", timeoutMs: 90_000, log: (m: string) => reviewLog.push(m) });
  const reviewMs = Date.now() - v0;
  console.log("REVIEW", reviewMs, "ms", JSON.stringify(reviewLog));
  console.log(JSON.stringify(review, null, 1));
  const out = {
    at: new Date().toISOString(),
    thinkingLevel: level,
    model,
    status: status.trim(),
    turns: rows,
    report,
    reportMs,
    review,
    reviewMs,
    reviewLog,
    totalMs: Date.now() - started,
    trace: trace.slice(-200),
  };
  mkdirSync(join(ROOT, "out"), { recursive: true });
  writeFileSync(join(ROOT, "out", "interview_check.json"), JSON.stringify(out, null, 1) + "\n");
  const okTurns = rows.filter((r) => (r as { branchOk: boolean }).branchOk).length;
  console.log(`status: ${out.status}`);
  for (const line of out.trace) console.log(`trace ${line}`);
  console.log(`INTERVIEW mode=${mode} model=${model} branches ${okTurns}/${rows.length} live-report=${report ? "yes" : "no"} (${reportMs} ms) review=${review ? `${(review as { model?: string }).model} ${(review as { verdict?: string }).verdict}` : "no"} (${reviewMs} ms)`);
}

void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
