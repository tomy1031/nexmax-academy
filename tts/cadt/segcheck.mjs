// Transcribe each narration clip separately (one request, one audio part per clip).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.GEMINI_API_KEY; const [dir, OUT] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const files = readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();
const parts = [];
for (const f of files) { parts.push({ text: `Clip ${f.replace('.mp3', '')}:` }); parts.push({ inlineData: { mimeType: 'audio/mp3', data: readFileSync(`${dir}/${f}`).toString('base64') } }); }
parts.push({ text: 'Transcribe each clip above exactly as spoken. Output only JSON: {"<clip name>": "<transcript>", ...} with one entry per clip.' });
const body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json' } };
let out = '';
for (let i = 0; i < 4; i++) {
  const r = await fetch(API, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  if (r.ok) { out = JSON.parse(t).candidates?.[0]?.content?.parts?.map((p) => p.text).join(''); break; }
  console.error(r.status, t.slice(0, 300)); await new Promise((s) => setTimeout(s, 6000 * (i + 1)));
}
writeFileSync(`${OUT}/seg_transcripts.json`, out || '{}'); console.log(out.slice(0, 4000));
