// Gemini 3.8 Flash TTS: designed voices + per-line WAVs + a transcript check.
// Runs in GitHub Actions (the key lives only in an Actions environment secret).
//
//   GEMINI_API_KEY=… node gen.mjs jobs.json out/
//
// jobs.json:
//   { "voices": { "nexmax_ja": { "id": "voice_…" } | { "design": { gender, language_code, input, display_name } } },
//     "lines": [ { "key", "text", "voice": "Zephyr" | "@nexmax_ja", "style"?, "lang"? } ],
//     "only"?: ["key", …], "force"?: true }
// out/: <key>.wav, voices.json (ids of designed voices + preview wavs), report.json (transcripts).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY is not set'); process.exit(1); }
const [jobsPath, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'));
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = jobs.model || 'gemini-3.8-flash-tts';
const CHECK_MODEL = jobs.checkModel || 'gemini-3.5-flash';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, body, method = 'POST', tries = 5) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(API + path, {
      method,
      headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(150000),
    }).catch((e) => ({ ok: false, status: 599, text: async () => String(e) }));
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    console.error(`  ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
    if (res.status === 429 || res.status >= 500) { await sleep(4000 * (i + 1)); continue; }
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  throw new Error('gave up after retries: ' + path);
}

// ---- voices ----
const voiceIds = {};
for (const [name, v] of Object.entries(jobs.voices || {})) {
  if (v.id) { voiceIds[name] = v.id; continue; }
  console.log('design voice', name);
  const { input, fallback, ...rest } = v.design;
  let r;
  try {
    r = await call('/voices', { store: true, voice: { type: 'prompted', ...rest, prompted: { input } } });
  } catch (e) {
    console.error('  voice design failed, falling back to', fallback || 'Leda', e.message);
    voiceIds[name] = fallback || 'Leda';
    continue;
  }
  voiceIds[name] = r.id || r.name;
  if (r.sample_audio?.data) writeFileSync(`${OUT}/voice_${name}_preview.wav`, Buffer.from(r.sample_audio.data, 'base64'));
  console.log('  →', voiceIds[name], JSON.stringify(Object.keys(r)));
  writeFileSync(`${OUT}/voice_${name}.json`, JSON.stringify({ ...r, sample_audio: undefined }, null, 2));
}
writeFileSync(`${OUT}/voices.json`, JSON.stringify(voiceIds, null, 2));

// ---- lines ----
const voiceOf = (v) => (v?.startsWith('@') ? voiceIds[v.slice(1)] : v) || 'Zephyr';
const only = jobs.only ? new Set(jobs.only) : null;

function audioFrom(r) {
  // Interactions API: steps[].content[] with type "audio" (base64 data). Be lenient about the shape.
  const found = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if ((o.type === 'audio' || o.mime_type?.startsWith?.('audio') || o.mimeType?.startsWith?.('audio')) && typeof o.data === 'string') found.push(o);
    if (o.inlineData?.data) found.push({ data: o.inlineData.data, mime_type: o.inlineData.mimeType });
    for (const k of Object.keys(o)) if (k !== 'data') walk(o[k]);
  };
  walk(r);
  return found.at(-1);
}

function pcmToWav(pcm, rate = 24000) {
  const b = Buffer.alloc(44 + pcm.length);
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(pcm.length, 40); pcm.copy(b, 44);
  return b;
}

const report = [];
for (const line of jobs.lines) {
  if (only && !only.has(line.key)) continue;
  const path = `${OUT}/${line.key}.wav`;
  if (existsSync(path) && !jobs.force) continue;
  const voice = voiceOf(line.voice);
  console.log(line.key, voice, line.text.slice(0, 40));
  const part = { type: 'text', text: line.text };
  if (line.style) part.annotations = [{ type: 'speech_metadata', style: line.style }];
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      const r = await call('/interactions', {
        model: MODEL,
        input: [{ type: 'user_input', content: [part] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      });
      const a = audioFrom(r);
      if (!a) { console.error('  no audio in response', JSON.stringify(r).slice(0, 500)); continue; }
      let buf = Buffer.from(a.data, 'base64');
      if (buf.subarray(0, 4).toString() !== 'RIFF') buf = pcmToWav(buf);
      writeFileSync(path, buf);
      ok = true;
    } catch (e) {
      console.error('  failed:', e.message);
      await sleep(3000);
    }
  }
  if (!ok) { report.push({ key: line.key, error: 'no audio' }); continue; }
  await sleep(jobs.delay ?? 600);
}

// ---- check: transcribe each new wav and compare with the script ----
if (jobs.check !== false) {
  for (const line of jobs.lines) {
    if (only && !only.has(line.key)) continue;
    const path = `${OUT}/${line.key}.wav`;
    if (!existsSync(path)) continue;
    try {
      const r = await call(`/models/${CHECK_MODEL}:generateContent`, {
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: 'audio/wav', data: readFileSync(path).toString('base64') } },
          { text: 'Transcribe this speech exactly as spoken, in the language spoken. Japanese: write it in normal Japanese script. Output only the transcript.' },
        ] }],
      });
      const heard = r.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
      report.push({ key: line.key, script: line.text, heard: heard.trim() });
    } catch (e) {
      report.push({ key: line.key, script: line.text, error: e.message });
    }
  }
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log('done', report.length);
