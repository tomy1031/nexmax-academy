/**
 * Kotoba Town の 通し試験（本物の Gemini Live・本物の ブラウザ）。
 *
 * 1. kotoba-town/e2e/learner.wav（学習者の 声。make_kotoba_voices と 同じ Live TTS で 作る）を
 *    Chromium の 偽マイクに する（--use-file-for-fake-audio-capture、くり返し 流れる）
 * 2. kotoba-town/game/（lab の アプリの 写し）を 開き、鍵を localStorage に 入れて 場面を 始める
 * 3. 学習者の 番で マイクが 開く → AudioWorklet → Live → judge_reply → 分岐、を そのまま 通す
 * 4. 判定の 記録（KT.log の judge 行）と ふりかえりを kotoba-town/out/e2e.json に 書く
 *
 * 使い方: GEMINI_API_KEY=… node scripts/kotoba_e2e.mjs [variant=l01a] [seconds=150]
 * 鍵は ページの 中だけで 使い、ログには 出さない。
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, createReadStream } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const variant = process.argv[2] || "l01a";
const seconds = Number(process.argv[3] || 150);
if (!apiKey) throw new Error("GEMINI_API_KEY が ありません");
const root = resolve("kotoba-town/game");
const wav = resolve("kotoba-town/e2e/learner.wav");
if (!existsSync(join(root, "index.html")) || !existsSync(wav)) throw new Error("game/ か e2e/learner.wav が ありません");

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg" };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = join(root, p);
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" });
  createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`,
    "--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["microphone"] });
await ctx.addInitScript((key) => {
  localStorage.setItem("kotoba.geminiKey", key);
  localStorage.setItem("kotoba.settings.v1", JSON.stringify({ name: "リン", english: true, noSynth: true }));
}, apiKey);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${port}/?play=${variant}&debug=1`);
await page.waitForFunction("window.KT && window.KT.ready && window.KT.state.where === 'brief'", null, { timeout: 120000 });
await page.evaluate(() => { window.KT.start(); }); // fire and forget: start() resolves only when the conversation ends
const t0 = Date.now();
let last = "";
while (Date.now() - t0 < seconds * 1000) {
  const st = await page.evaluate(() => ({ where: window.KT.state.where, log: window.KT.log.filter((l) => /^(judge|live)/.test(l)).slice(-30) }));
  const s = st.log.join("\n");
  if (s !== last) { console.log(st.log.slice(-3).join("\n")); last = s; }
  if (st.where === "report") break;
  await page.waitForTimeout(2000);
}
const result = await page.evaluate(() => ({
  where: window.KT.state.where,
  log: window.KT.log.filter((l) => /^(judge|live|mic|audio)/.test(l)),
  turns: window.KT.runner?.turns || window.KT.lastReport?.turns || [],
  report: window.KT.lastReport?.report || null,
  errors: window.KT.errors,
}));
result.pageErrors = errors;
result.variant = variant;
result.at = new Date().toISOString();
await page.screenshot({ path: "kotoba-town/out/e2e.png" });
mkdirSync("kotoba-town/out", { recursive: true });
writeFileSync("kotoba-town/out/e2e.json", JSON.stringify(result, null, 1) + "\n");
console.log(`E2E ${variant}: where=${result.where} judged=${result.log.filter((l) => l.startsWith("judge")).length} turns=${result.turns.length}`);
await browser.close();
srv.close();
void readFileSync;
