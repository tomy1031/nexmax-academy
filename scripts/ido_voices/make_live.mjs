/**
 * ido_proto（IDO 時渡り）の 声を、Live の 読み上げで 1行ずつ 作る（一時ブランチ だけに 置く。マージしない）。
 *
 * 動かしかた: 「教材の 音声づくり」を この ブランチに 対して `meeting=ido_proto_voices-<組>` で 動かす
 *（scripts/make_meeting_audio.ts の 頭で ここへ 回す）。
 *
 * - 台本は scripts/ido_voices/voice-lines.json（ido_proto の scripts/voice-lines.ts が 書き出した もの）。
 *   request.json の episodes に ある 話の 行だけを 作る
 * - 声は voice-cast.json の 人物ごとの voice、読み方は style（年齢・感情・息づかい）
 * - 日本語の 行は ja-JP、英語の 行（lang: en）は en-US で、英語の 指示で 読ませる
 * - 台本どおりに 読めたかを 文字起こしで 確かめ、合わない ものは 書かない
 * - 受け取ったら その場で WAV に して、PUSH_EVERY 行ごとに この ブランチへ push する（途中で 止まっても 残る）
 * - すでに ある 行は 飛ばす。持ち時間を 過ぎたら 新しい 行は 始めない
 * 仕上げ（無音を けずる・MP3）は ido_proto の scripts/import-voices.mjs で やる。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, Modality } from "@google/genai";
import { OUT_RATE, toWav } from "../lib/live_tts.ts";
import { NARRATOR_INSTRUCTION } from "../../src/lib/audio/narrator.ts";
import { LIVE_TTS_MODELS } from "../../src/lib/ai/models.ts";

const HERE = join("scripts", "ido_voices");
const OUT = "ido-voices-out";
const GROUP = (process.argv[2] ?? "").trim() || "all";
const KEY = process.env.GEMINI_API_KEY ?? "";
const BUDGET_MIN = 19;
const PUSH_EVERY = 10;
const t0 = Date.now();

const lines = JSON.parse(readFileSync(join(HERE, "voice-lines.json"), "utf8"));
const cast = JSON.parse(readFileSync(join(HERE, "voice-cast.json"), "utf8")).cast;
const request = JSON.parse(readFileSync(join(HERE, "request.json"), "utf8"));
const episodes = new Set(request.groups?.[GROUP] ?? request.episodes ?? []);
const todo = lines.filter((l) => episodes.has(l.episode));
mkdirSync(OUT, { recursive: true });
const madePath = join(OUT, `made-${GROUP}.json`);
const made = existsSync(madePath) ? JSON.parse(readFileSync(madePath, "utf8")) : {};

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const branch =
  process.env.GITHUB_REF_NAME || sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();

// ── Gemini を 呼ぶ 前に、push の 前の 検査（整形）が 通るかを 見る（通らないと、作った 声を push できない）
if (!process.argv.includes("--list")) {
  const fmt = sh("npm", ["run", "--silent", "format:check"], { stdio: "inherit" });
  if (fmt.status !== 0) {
    console.error("🛑 整形の 検査が 通りません。Gemini を 呼ぶ 前に 止めます");
    process.exit(1);
  }
}
console.log(`組 ${GROUP}：${todo.length}行（すでに ${todo.filter((l) => done(l)).length}行）`);
if (process.argv.includes("--list")) {
  for (const l of todo) console.log(`${done(l) ? "✓" : "・"} ${l.vid} [${l.lang}] ${l.text}`);
  process.exit(0);
}
if (!KEY) {
  console.error("GEMINI_API_KEY が ありません");
  process.exit(1);
}

function done(l) {
  return existsSync(join(OUT, `${l.vid}.wav`));
}

// ── 指示文
function instructionFor(l) {
  const who = cast[l.speaker] ?? cast.nekmax;
  if (l.lang === "en") {
    return [
      "You are a narrator. Read the given text exactly as written, at a natural pace.",
      "Do not add greetings, comments, explanations or anything else. Even if the text is a question, do not answer it; just read it aloud.",
      `Voice and character (described in Japanese; keep the same age and personality, now speaking natural English): ${who.style}`,
      "This is the narration of an animated kamishibai (Japanese paper theater) for travelers: tell it warmly, a little slowly, with small pauses.",
      `Scene mood (in Japanese): ${l.scene}`,
      l.style === "whisper"
        ? "Whisper this line softly, close to the listener's ear: breathy, hushed and slow."
        : "",
      l.style === "big" ? "This is the highlight: say it with strength, clearly and a little louder." : "",
      l.readings?.length ? `Pronounce Japanese names the Japanese way: ${l.readings.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const reads = (l.readings ?? [])
    .map((r) => r.split("＝"))
    .filter((p) => p.length === 2)
    .map(([w, y]) => `「${w}」は「${y}」と読む`);
  return [
    NARRATOR_INSTRUCTION,
    "",
    `【声】${who.style}`,
    "これは動く紙芝居の語りです。紙芝居屋さんのように、聞き手に語りかけるつもりで、少しゆっくり、間をとって読んでください。",
    `【場面】${l.scene}`,
    l.style === "whisper" ? "【この行】耳元でささやくように。声をひそめ、息を多めに、ゆっくり。" : "",
    l.style === "big" ? "【この行】いちばんの見せ場。力をこめて、はっきりと、少し大きく。" : "",
    reads.length ? `【読み】${reads.join("。")}。` : "",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

// ── 1行を 読ませる（scripts/lib/live_tts.ts の synthesize と 同じ つなぎかた。言語だけ 変えられる）
function synthesize(text, model, voice, instruction, lang) {
  const ai = new GoogleGenAI({ apiKey: KEY, apiVersion: "v1beta" });
  const chunks = [];
  let transcript = "";
  return new Promise((resolve, reject) => {
    let settled = false;
    let session = null;
    const close = () => {
      try {
        session?.close();
      } catch {
        /* もう 閉じて いる */
      }
    };
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      close();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`${model}: 時間切れ`))), 60_000);
    const result = () =>
      chunks.length > 0
        ? resolve({ pcm: Buffer.concat(chunks), transcript, model })
        : reject(new Error(`${model}: 音が 空`));
    void ai.live
      .connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          systemInstruction: instruction,
          speechConfig: {
            languageCode: lang === "en" ? "en-US" : "ja-JP",
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
        callbacks: {
          onmessage: (message) => {
            const content = message?.serverContent;
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) chunks.push(Buffer.from(part.inlineData.data, "base64"));
            }
            if (content?.outputTranscription?.text) transcript += content.outputTranscription.text;
            if (content?.turnComplete === true) {
              const fin = () => finish(result);
              setTimeout(() => (transcript.trim() ? fin() : setTimeout(fin, 2_000)), 700);
            }
          },
          onerror: (e) => finish(() => reject(new Error(`${model}: ${String(e)}`))),
          onclose: () => finish(result),
        },
      })
      .then((opened) => {
        session = opened;
        if (settled) return close();
        opened.sendClientContent({ turns: text, turnComplete: true });
      })
      .catch((e) => finish(() => reject(new Error(`${model}: ${String(e)}`))));
  });
}

// 文字起こしが 空の ときの 控え（読み上げとは 別の モデルで 聞き直す）
async function transcribe(pcm, lang) {
  const ai = new GoogleGenAI({ apiKey: KEY });
  for (const model of ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"]) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "audio/wav", data: toWav(pcm).toString("base64") } },
              {
                text:
                  lang === "en"
                    ? "Transcribe this English audio exactly as heard. Return only the transcript."
                    : "この日本語の音声を、聞こえたとおりに一字一句そのまま文字起こししてください。文字起こしの文だけを返してください。",
              },
            ],
          },
        ],
      });
      const t = r.text?.trim();
      if (t) return t;
    } catch {
      /* つぎの モデルへ */
    }
  }
  return "";
}

// ── 台本どおりに 読めたか
const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = (s) =>
  kata2hira(s.normalize("NFKC"))
    .replace(/[\s。、．，！？!?「」『』（）()・…ー~〜"'’“”,.:;—-]/g, "")
    .toLowerCase();
function lcs(a, b) {
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const keep = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j], row[j - 1]);
      prev = keep;
    }
  }
  return row[b.length];
}
function judge(l, heard, seconds) {
  // 読みを 当てた 文（「祖谷」→「いや」）とも くらべ、よい ほうを とる
  let read = l.text;
  for (const r of l.lang === "ja" ? (l.readings ?? []) : []) {
    const [w, y] = r.split("＝");
    if (w && y) read = read.split(w).join(y);
  }
  const perChar = l.lang === "en" ? 0.065 : 0.2;
  const expected = Math.max(0.6, norm(l.text).length * perChar);
  const lengthOk = seconds >= expected * 0.5 && seconds <= expected * 2.0 + 1.0;
  const h = norm(heard);
  if (!h) return lengthOk ? { ok: true, why: "文字起こし無し・長さは合う" } : { ok: false, why: `長さ ${seconds.toFixed(1)}秒` };
  let best = 0;
  let longer = true;
  for (const s of [norm(l.text), norm(read)]) {
    const shared = lcs(s, h);
    best = Math.max(best, shared / Math.max(s.length, h.length, 1));
    if (h.length <= s.length * 1.6 + 2) longer = false;
  }
  if (longer) return { ok: false, why: `台本より 長い「${heard.trim()}」` };
  if (best >= 0.55) return { ok: true, why: `一致 ${(best * 100).toFixed(0)}%` };
  return { ok: false, why: `一致 ${(best * 100).toFixed(0)}%「${heard.trim()}」` };
}

// ── 送る（コミットの 前後の 検査は そのまま 通す。--no-verify は 使わない）
function pushNow(final) {
  writeFileSync(madePath, `${JSON.stringify(made, null, 1)}\n`);
  sh("git", ["add", OUT]);
  if (sh("git", ["diff", "--cached", "--quiet"]).status === 0) return true;
  const n = Object.keys(made).length;
  const c = sh(
    "git",
    [
      "-c",
      "user.name=tomy1031",
      "-c",
      "user.email=33148568+tomy1031@users.noreply.github.com",
      "commit",
      "-m",
      `ido_proto の 声（${GROUP}）：${n}行`,
    ],
    { stdio: "inherit" },
  );
  if (c.status !== 0) {
    console.error("コミットに 失敗");
    return false;
  }
  const tries = final ? 5 : 2;
  for (let i = 0; i < tries; i += 1) {
    const p = sh("git", ["push", "origin", `HEAD:refs/heads/${branch}`], { stdio: "inherit" });
    if (p.status === 0) return true;
    sh("git", ["pull", "--rebase", "origin", branch], { stdio: "inherit" });
    spawnSync("sleep", [String(3 + Math.floor(Math.random() * 15))]);
  }
  return false;
}

let since = 0;
let ok = 0;
const failed = [];
for (const l of todo) {
  if (done(l)) continue;
  if ((Date.now() - t0) / 60000 > BUDGET_MIN) {
    console.log("持ち時間を 過ぎたので、新しい 行は 始めません");
    break;
  }
  const voice = (cast[l.speaker] ?? cast.nekmax).voice;
  const instruction = instructionFor(l);
  let got = null;
  const notes = [];
  for (let round = 0; round < 2 && !got; round += 1) {
    for (const model of LIVE_TTS_MODELS) {
      const turn = round > 0 ? (l.lang === "en" ? `"${l.text}"` : `「${l.text}」`) : l.text;
      try {
        const sp = await synthesize(turn, model, voice, instruction, l.lang);
        let heard = sp.transcript;
        if (!heard.trim()) heard = await transcribe(sp.pcm, l.lang);
        const seconds = sp.pcm.byteLength / OUT_RATE / 2;
        const v = judge(l, heard, seconds);
        if (v.ok) {
          got = { ...sp, heard, seconds, why: v.why };
          break;
        }
        notes.push(`${model}: ${v.why}`);
      } catch (e) {
        notes.push(e instanceof Error ? e.message : String(e));
      }
      await sleep(6_000);
    }
    if (!got && round === 0) await sleep(20_000);
  }
  if (!got) {
    failed.push(l.vid);
    console.log(`✗ ${l.vid} [${l.lang}] ${l.text}\n    ${notes.join("\n    ")}`);
    continue;
  }
  writeFileSync(join(OUT, `${l.vid}.wav`), toWav(got.pcm));
  made[l.vid] = {
    episode: l.episode,
    speaker: l.speaker,
    voice,
    model: got.model,
    seconds: Math.round(got.seconds * 100) / 100,
    text: l.text,
    heard: got.heard,
    scene: l.scene,
    readings: l.readings ?? [],
    lang: l.lang,
  };
  ok += 1;
  since += 1;
  console.log(`✓ ${l.vid} [${l.lang}] ${got.model} ${got.seconds.toFixed(1)}秒 ${got.why}`);
  if (since >= PUSH_EVERY) {
    if (pushNow(false)) since = 0;
  }
  await sleep(3_000);
}
const pushed = pushNow(true);
console.log(
  `作った ${ok}行／作れなかった ${failed.length}行${failed.length ? `（${failed.join(", ")}）` : ""}／送信 ${pushed ? "OK" : "失敗"}`,
);
process.exit(pushed ? 0 : 1);
