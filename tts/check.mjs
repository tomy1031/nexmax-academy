// One transcription request per joined mp3: "N utterances separated by silence → JSON array of N strings".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.GEMINI_API_KEY;
const [dir, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
const MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.8-flash'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
for (const [g, list] of Object.entries(manifest)) {
  const data = readFileSync(`${dir}/${g}.mp3`).toString('base64');
  const prompt =
    `This audio has exactly ${list.length} separate utterances, each followed by about 2.5 seconds of silence. ` +
    'Transcribe each utterance exactly as it is spoken, word for word, without fixing or completing anything (write Japanese in normal Japanese script). ' +
    `Return a JSON array of exactly ${list.length} strings, one per utterance, in order.`;
  let done = false;
  for (const model of MODELS) {
    for (let a = 0; a < 2 && !done; a++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp3', data } }, { text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(300000),
        });
        const txt = await res.text();
        if (!res.ok) { console.log(g, model, res.status, txt.slice(0, 200)); if (res.status === 429 || res.status === 404) break; await sleep(5000); continue; }
        const j = JSON.parse(txt);
        const arr = JSON.parse(j.candidates[0].content.parts.map((p) => p.text).join(''));
        out[g] = { model, heard: arr };
        console.log(g, model, 'got', arr.length, 'of', list.length);
        done = true;
      } catch (e) { console.log(g, model, 'error', String(e).slice(0, 200)); await sleep(5000); }
    }
    if (done) break;
  }
}
writeFileSync(`${OUT}/check_report.json`, JSON.stringify(out, null, 1));
