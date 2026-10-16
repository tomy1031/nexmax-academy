// Transcribe the two CADT student speech clips with sentence timestamps (Gemini 3.5 Flash).
//   GEMINI_API_KEY=… node tts/cadt/transcribe.mjs tts/cadt/speech out
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.GEMINI_API_KEY; const [dir, OUT] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const res = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mp3'))) {
  const body = { contents: [{ role: 'user', parts: [
    { inlineData: { mimeType: 'audio/mp3', data: readFileSync(`${dir}/${f}`).toString('base64') } },
    { text: 'This is a Japanese speech. Transcribe it sentence by sentence (split also at clear pauses inside long sentences). For each part give the start and end time in seconds from the beginning of this audio, with one decimal. Output only JSON: [{"start":0.0,"end":0.0,"ja":"..."}]' } ] }],
    generationConfig: { responseMimeType: 'application/json' } };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.text();
    if (r.ok) { res[f] = JSON.parse(t).candidates?.[0]?.content?.parts?.map((p) => p.text).join(''); break; }
    console.error(f, r.status, t.slice(0, 300)); await new Promise((s) => setTimeout(s, 5000 * (i + 1)));
  }
  console.log(f, res[f]);
}
writeFileSync(`${OUT}/speech_transcripts.json`, JSON.stringify(res, null, 2));
