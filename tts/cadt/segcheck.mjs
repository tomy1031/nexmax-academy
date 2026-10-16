// Transcribe each clip in its OWN request, so the model cannot move words between clips.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.GEMINI_API_KEY; const [dir, OUT] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const res = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mp3')).sort()) {
  const body = { contents: [{ role: 'user', parts: [
    { inlineData: { mimeType: 'audio/mp3', data: readFileSync(`${dir}/${f}`).toString('base64') } },
    { text: 'Transcribe exactly the words spoken in this short audio clip. It may start or end mid-sentence; do not complete or fix sentences. Output only the words.' } ] }],
    generationConfig: { temperature: 0 } };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.text();
    if (r.ok) { res[f.replace('.mp3', '')] = (JSON.parse(t).candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '').trim(); break; }
    console.error(f, r.status, t.slice(0, 200)); await sleep(5000 * (i + 1));
  }
  console.log(f, '|', res[f.replace('.mp3', '')]);
  await sleep(400);
}
writeFileSync(`${OUT}/seg_transcripts.json`, JSON.stringify(res, null, 1));
