// Gemini Live（3.8 Live）で 1行ずつ 読み上げて WAV に する。nexmax-academy の
// scripts/lib/live_tts.ts と 同じ やりかた: 自分の 読み上げの 文字起こし
// （outputAudioTranscription）を もらい、台本と 見くらべて、合わない ものは 作り直す。
//
//   GEMINI_API_KEY=… node live.mjs live.json out/
//
// live.json: { "lines": [ { key, text, voice, lang: "ja"|"en", instruction? } ], "models"?: [...], "only"?: [...] }
// out/: <key>.wav, live_report.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY is not set'); process.exit(1); }
const [jobsPath, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'));
const MODELS = jobs.models || ['gemini-3.8-live', 'gemini-3.1-flash-live-preview'];
const URL_ = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const RATE = 24000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NARRATOR = {
  ja:
    'あなたはナレーターです。渡された文を、書いてあるとおりに読み上げてください。' +
    'あいづち・言い換え・説明・感想を足さないでください。読み上げ以外は何もしないでください。' +
    '渡された文が質問の形でも、その質問に答えてはいけません。質問文もそのまま読み上げるだけにしてください。' +
    '文を要約したり、続きを話したりしないでください。',
  en:
    'You are a narrator. Read the text you are given aloud exactly as written. ' +
    'Do not add greetings, comments, explanations or reactions, and do nothing but read it. ' +
    'If the text is a question, do not answer it — just read the question aloud. ' +
    'Do not summarize the text or continue it.',
};

function toWav(pcm) {
  const b = Buffer.alloc(44 + pcm.length);
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(pcm.length, 40); pcm.copy(b, 44);
  return b;
}

function speak(model, line, text) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL_ + '?key=' + encodeURIComponent(KEY));
    ws.binaryType = 'arraybuffer';
    const chunks = [];
    let transcript = '';
    let settled = false;
    const fin = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); try { ws.close(); } catch {} fn(v); };
    const timer = setTimeout(() => fin(reject, new Error('timeout')), 90000);
    const done = () => (chunks.length ? fin(resolve, { pcm: Buffer.concat(chunks), transcript, model }) : fin(reject, new Error('no audio')));
    ws.onopen = () =>
      ws.send(JSON.stringify({
        setup: {
          model: 'models/' + model,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: line.voice } }, languageCode: line.lang === 'en' ? 'en-US' : 'ja-JP' },
          },
          outputAudioTranscription: {},
          systemInstruction: { parts: [{ text: NARRATOR[line.lang] + (line.instruction ? ' ' + line.instruction : '') }] },
        },
      }));
    let setup = false;
    ws.onmessage = (ev) => {
      const txt = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf-8');
      let m;
      try { m = JSON.parse(txt); } catch { return; }
      if (m.error) return fin(reject, new Error(JSON.stringify(m.error).slice(0, 200)));
      if (m.setupComplete !== undefined && !setup) {
        setup = true;
        return ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }));
      }
      const sc = m.serverContent;
      if (!sc) return;
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) chunks.push(Buffer.from(p.inlineData.data, 'base64'));
      if (sc.outputTranscription?.text) transcript += sc.outputTranscription.text;
      if (sc.turnComplete) setTimeout(() => (transcript.trim() ? done() : setTimeout(done, 2000)), 700);
    };
    ws.onerror = () => fin(reject, new Error('ws error'));
    ws.onclose = (e) => (chunks.length ? done() : fin(reject, new Error('closed ' + e.code + ' ' + (e.reason || ''))));
  });
}

const norm = (t) => t.normalize('NFKC').replace(/[\s。、．，！？!?「」『』（）()・…ー~〜—\-"'’“”.,:;]/g, '').toLowerCase();
function lcs(a, b) {
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) { const keep = row[j]; row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j], row[j - 1]); prev = keep; }
  }
  return row[b.length];
}
function looksRight(line, transcript, seconds) {
  const perChar = line.lang === 'en' ? 0.065 : 0.2;
  const expected = line.text.length * perChar;
  const lengthOk = seconds >= expected * 0.5 && seconds <= expected * 1.8;
  if (!transcript.trim()) return lengthOk ? { ok: true, why: 'no transcript; length ok' } : { ok: false, why: `length ${seconds.toFixed(1)}s vs ~${expected.toFixed(1)}s` };
  const a = norm(line.text), b = norm(transcript);
  const shared = lcs(a, b);
  const ratio = shared / Math.max(a.length, b.length, 1);
  if (b.length > a.length * 1.6) return { ok: false, why: `too long (${b.length} vs ${a.length})` };
  if (ratio >= 0.6) return { ok: true, why: `match ${(ratio * 100).toFixed(0)}%` };
  if (shared / Math.max(b.length, 1) >= 0.8 && lengthOk) return { ok: true, why: 'transcript cut short; length ok' };
  return { ok: false, why: `match ${(ratio * 100).toFixed(0)}%: ${transcript.trim()}` };
}

const report = [];
const only = jobs.only ? new Set(jobs.only) : null;
for (const line of jobs.lines) {
  if (only && !only.has(line.key)) continue;
  const dest = `${OUT}/${line.key}.wav`;
  if (existsSync(dest) && !jobs.force) continue;
  let best = null;
  let ok = false;
  const tries = [];
  for (let round = 0; round < 4 && !ok; round++) {
    const model = MODELS[round < 3 ? 0 : Math.min(1, MODELS.length - 1)];
    // Quote the text from the 2nd round: a short line can be taken for a remark and answered.
    const text = round > 0 ? (line.lang === 'en' ? `"${line.text}"` : `「${line.text}」`) : line.text;
    try {
      const r = await speak(model, line, text);
      const seconds = r.pcm.length / 2 / RATE;
      const v = looksRight(line, r.transcript, seconds);
      tries.push({ model, seconds: +seconds.toFixed(2), transcript: r.transcript, ...v });
      if (v.ok) { ok = true; best = r; } else if (!best) best = r;
      console.log(`${line.key} ${model} ${seconds.toFixed(1)}s ${v.ok ? 'OK' : 'NG'} ${v.why}`);
    } catch (e) {
      tries.push({ model, error: String(e.message || e) });
      console.log(`${line.key} ${model} error ${String(e.message || e).slice(0, 120)}`);
      await sleep(4000 * (round + 1));
    }
    await sleep(1200);
  }
  if (best) writeFileSync(ok ? dest : `${OUT}/${line.key}.NG.wav`, toWav(best.pcm));
  report.push({ key: line.key, text: line.text, ok, tries });
}
writeFileSync(`${OUT}/live_report.json`, JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).map((r) => r.key);
console.log('done', report.length, 'NG:', bad.join(',') || 'none');
