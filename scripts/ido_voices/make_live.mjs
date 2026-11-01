// 一時（このブランチは マージしない）：IDO 時渡り（別の リポジトリ）の 物語の 声を、
// この リポジトリの Live の 読み上げ（scripts/lib/live_tts.ts）で 1行ずつ 作る。tomy さんの OK（2026-11-01）。
//
// **作った 声を 消さない ため**（2026-11-01 の 指定「データが 消えるのは 致命的」）：
//   ・Gemini から 受け取ったら、その場で WAV（受け取った ままの 音）に して ido-voices-out/ に 書く
//   ・8行 ごとに コミットして この ブランチに push する（途中で 止まっても、送った ぶんは 残る）
//   ・MP3 に する などの 仕上げは、受け取った あとに IDO 時渡りの 側で やる
//   ・すでに ある 行は 飛ばす（もう一度 走らせると、続きだけ 作る）
//   ・持ち時間（22分）を 過ぎたら、新しい 行は 始めない
//
// 使い方（ワークフロー「教材の 音声づくり」から）: meeting=ido_proto_voices
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { OUT_RATE, synthesizeWithFallback, toWav } from "../lib/live_tts.ts";

const DIR = "scripts/ido_voices";
const OUT = "ido-voices-out";
const MODELS = ["gemini-3.8-live"]; // 1人の 声を そろえる ため、モデルは 1つに 決める
const BUDGET_MS = 22 * 60 * 1000;
const PUSH_EVERY = 8;

const started = Date.now();
const req = JSON.parse(readFileSync(`${DIR}/request.json`, "utf8"));
const cast = JSON.parse(readFileSync(`${DIR}/voice-cast.json`, "utf8")).cast;
const lines = JSON.parse(readFileSync(`${DIR}/voice-lines.json`, "utf8")).filter((l) =>
  req.episodes.includes(l.episode),
);
const apiKey = process.env.GEMINI_API_KEY ?? "";
const branch = process.env.GITHUB_REF_NAME ?? "";
if (!apiKey || !branch) {
  console.error("GEMINI_API_KEY と GITHUB_REF_NAME が 要ります");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const logFile = `${OUT}/made.json`;
const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, "utf8")) : {};

const git = (...args) => spawnSync("git", args, { stdio: "inherit" });
git("config", "user.name", "tomy1031");
git("config", "user.email", "33148568+tomy1031@users.noreply.github.com");
/** いま できて いる ぶんを コミットして、この ブランチに 送る（3回まで やり直す） */
const save = (message) => {
  writeFileSync(logFile, JSON.stringify(log, null, 1));
  git("add", OUT);
  if (git("diff", "--cached", "--quiet").status === 0) return true;
  git("commit", "-q", "-m", message);
  for (let i = 0; i < 3; i += 1) {
    if (git("push", "-q", "origin", `HEAD:${branch}`).status === 0) return true;
    spawnSync("sleep", [String(5 * (i + 1))]);
  }
  console.error("⚠ push できませんでした（できた 声は この ジョブの 中に だけ 残って います）");
  return false;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let made = 0;
let pending = 0;
const failed = [];
for (const l of lines) {
  const file = `${OUT}/${l.vid}.wav`;
  if (existsSync(file)) continue;
  if (Date.now() - started > BUDGET_MS) {
    console.log("持ち時間を 過ぎたので、ここで 止めます（続きは もう一度 走らせる）");
    break;
  }
  const c = cast[l.speaker];
  if (!c?.voice) {
    console.log(`- ${l.speaker}：声が 決まって いないので 作りません`);
    continue;
  }
  const how =
    l.style === "shout"
      ? "この文は叫ぶように、強く。"
      : l.style === "whisper"
        ? "この文はささやくように、耳元で、息を多めに。"
        : "";
  const text = l.text.replace(/^（小声）/, "");
  // 演技の指示（人物・場面の空気・言い方・読み方）。文は漢字のまま渡し、読み方はここで伝える
  //（台本どおりに 読めたかの 見くらべ（live_tts.ts）を 崩さない ため）
  const instruction = [
    "",
    l.speaker === "narr"
      ? "物語の語り手として、場面の空気に合わせて、気持ちを込めて読んでください。"
      : "ここからは、次の人物になりきって、気持ちを込めて演じて読んでください。",
    "文の言葉は、書いてあるとおりに読み、足したり省いたりしないでください。",
    `人物と声：${c.style}`,
    `場面の空気：${l.scene ?? ""}。`,
    how,
    l.readings?.length ? `読み方（必ずこの読みで）：${l.readings.join("、")}。` : "",
  ]
    .filter((x, i) => i === 0 || x)
    .join("\n");
  try {
    const spoken = await synthesizeWithFallback(
      text,
      {
        apiKey,
        voice: c.voice,
        instruction,
        quoteOnRetry: true,
        transcribeWhenEmpty: true,
      },
      undefined,
      MODELS,
    );
    writeFileSync(file, toWav(spoken.pcm));
    const seconds = spoken.pcm.byteLength / OUT_RATE / 2;
    log[l.vid] = {
      episode: l.episode,
      speaker: l.speaker,
      voice: c.voice,
      model: spoken.model,
      seconds,
      text: l.text,
      heard: spoken.transcript,
      scene: l.scene,
      readings: l.readings,
    };
    made += 1;
    pending += 1;
    console.log(`✓ ${l.speaker}（${c.voice}）${seconds.toFixed(1)}秒 ${l.text.slice(0, 24)}`);
    if (pending >= PUSH_EVERY) {
      if (save(`一時：IDO の 声 ${Object.keys(log).length}行（マージしない）`)) pending = 0;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failed.push(l.vid);
    console.error(`✗ ${l.speaker} ${l.text.slice(0, 24)}\n  ${message.slice(0, 400)}`);
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(message)) {
      console.error("1日の 枠に 当たった ようです。ここで 止めます");
      break;
    }
  }
  await wait(4_000); // 成功した ときは すぐ 返る ので、つづけて つなぐと 断られる
}
save(`一時：IDO の 声 ${Object.keys(log).length}行（マージしない）`);
console.log(`\n今回：${made}行／失敗：${failed.length}行／ブランチに ある 声：${Object.keys(log).length}行`);
