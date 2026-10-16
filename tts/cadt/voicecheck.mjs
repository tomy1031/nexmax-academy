// Transcribe the finished voice track with timestamps, to check each sentence sits in its slot.
//   GEMINI_API_KEY=… node tts/cadt/voicecheck.mjs tts/cadt/voicecheck/voice.mp3 out
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.GEMINI_API_KEY; const [file, OUT] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const body = { contents: [{ role: 'user', parts: [
  { inlineData: { mimeType: 'audio/mp3', data: readFileSync(file).toString('base64') } },
  { text: 'Transcribe this audio sentence by sentence (English narration, plus two short Japanese speeches). For each sentence give the start time in seconds from the beginning, with one decimal. Output only JSON: [{"start":0.0,"text":"..."}]' } ] }],
  generationConfig: { responseMimeType: 'application/json' } };
let out = '';
for (let i = 0; i < 4; i++) {
  const r = await fetch(API, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  if (r.ok) { out = JSON.parse(t).candidates?.[0]?.content?.parts?.map((p) => p.text).join(''); break; }
  console.error(r.status, t.slice(0, 300)); await new Promise((s) => setTimeout(s, 6000 * (i + 1)));
}
writeFileSync(`${OUT}/voice_transcript.json`, out || '[]'); console.log(out.slice(0, 3000));
