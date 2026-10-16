// Transcribe each clip in its OWN request, so the model cannot move words between clips.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.GEMINI_API_KEY; const [dir, OUT] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];
const api = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
let mi = 0;
const SKIP = new Set((process.env.SKIP || '').split(',').filter(Boolean));
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const res = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mp3') && !SKIP.has(x.replace('.mp3', ''))).sort()) {
  const body = { contents: [{ role: 'user', parts: [
    { inlineData: { mimeType: 'audio/mp3', data: readFileSync(`${dir}/${f}`).toString('base64') } },
    { text: 'Transcribe exactly the words spoken in this short audio clip. It may start or end mid-sentence; do not complete or fix sentences. Output only the words.' } ] }],
    generationConfig: { temperature: 0 } };
  for (let i = 0; i < 8 && mi < MODELS.length; i++) {
    const r = await fetch(api(MODELS[mi]), { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.text();
    if (r.ok) { res[f.replace('.mp3', '')] = (JSON.parse(t).candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '').trim(); break; }
    console.error(f, MODELS[mi], r.status, t.slice(0, 160));
    if (r.status === 429 && /quota/i.test(t)) { mi++; continue; }   // this model's daily quota is gone: next model
    await sleep(4000 * (i + 1));
  }
  console.log(f, '|', MODELS[mi], '|', res[f.replace('.mp3', '')]);
  await sleep(400);
}
writeFileSync(`${OUT}/seg_transcripts.json`, JSON.stringify(res, null, 1));
