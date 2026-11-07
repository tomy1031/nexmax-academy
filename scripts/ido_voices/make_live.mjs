// 一時（このブランチは マージしない）：IDO 時渡り（別の リポジトリ）の 物語の 声を、
// この リポジトリの Live の 読み上げ（scripts/lib/live_tts.ts）で 1行ずつ 作る。tomy さんの OK（2026-11-01）。
//
// **作った 声を 消さない ため**（2026-11-01 の 指定「データが 消えるのは 致命的」）：
//   ・Gemini から 受け取ったら、その場で WAV（受け取った ままの 音）に して ido-voices-out/ に 書く
//   ・8行 ごとに コミットして この ブランチに push する（途中で 止まっても、送った ぶんは 残る）
//   ・MP3 に する などの 仕上げは、受け取った あとに IDO 時渡りの 側で やる
//   ・すでに ある 行は 飛ばす（もう一度 走らせると、続きだけ 作る）
//   ・持ち時間（22分）を 過ぎたら、新しい 行は 始めない
//   ・話を 3つの 組（a・b・c）に 分け、組ごとに 別の 実行で 同時に 作る。記録（made-<組>.json）は 組ごとに
//     分け、push の 前に ほかの 組の ぶんを 取りこむ（声の ファイル名は 組で 重ならない）
//
// 使い方（ワークフロー「教材の 音声づくり」から）: meeting=ido_proto_voices:a（b・c も 同じ）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { OUT_RATE, synthesizeWithFallback, toWav } from "../lib/live_tts.ts";

const DIR = "scripts/ido_voices";
const OUT = "ido-voices-out";
const MODELS = ["gemini-3.8-live"]; // 1人の 声を そろえる ため、モデルは 1つに 決める
const BUDGET_MS = 19 * 60 * 1000;
// 最後の push を やり直せる 期限（ジョブの 持ち時間 30分 から、準備の 約2分と 後の 手順を 引いた 残り）
const FINAL_PUSH_DEADLINE_MS = 26 * 60 * 1000;
const PUSH_EVERY = 20;

const started = Date.now();
const req = JSON.parse(readFileSync(`${DIR}/request.json`, "utf8"));
const group = process.argv[2] ?? "a";
const episodes = req.groups[group] ?? [];
const cast = JSON.parse(readFileSync(`${DIR}/voice-cast.json`, "utf8")).cast;
// 組は 話の id か、「話の id:言語」（ja・en）で 指す
const lines = JSON.parse(readFileSync(`${DIR}/voice-lines.json`, "utf8")).filter(
  (l) => episodes.includes(l.episode) || episodes.includes(`${l.episode}:${l.lang ?? "ja"}`),
);
const apiKey = process.env.GEMINI_API_KEY ?? "";
const branch = process.env.GITHUB_REF_NAME ?? "";
if (!apiKey || !branch) {
  console.error("GEMINI_API_KEY と GITHUB_REF_NAME が 要ります");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const logFile = `${OUT}/made-${group}.json`;
const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, "utf8")) : {};

const git = (...args) => spawnSync("git", args, { stdio: args[0] === "rev-list" ? "pipe" : "inherit" });
git("config", "user.name", "tomy1031");
git("config", "user.email", "33148568+tomy1031@users.noreply.github.com");
/**
 * いま できて いる ぶんを コミットして、この ブランチに 送る。
 * 同時に いくつもの 組が 送る うえ、push の 前の 検査に 約50秒 かかるので、その あいだに ほかの 組が 先に 送ると 断られる。
 * 途中の 送りは 2回で あきらめて 次の 送りに まとめる。最後の 送りは、期限まで 間を ばらして やり直す
 * （2026-11-03：最後の 送りが 一斉に ぶつかり、作った 声が ジョブの 中に 残った まま 消えた ことが あった）
 */
const save = (message, final = false) => {
  writeFileSync(logFile, JSON.stringify(log, null, 1));
  git("add", OUT);
  if (git("diff", "--cached", "--quiet").status !== 0) git("commit", "-q", "-m", message);
  if (git("rev-list", "--count", `origin/${branch}..HEAD`).stdout?.toString().trim() === "0") return true;
  for (let i = 0; ; i += 1) {
    // ほかの 組が 先に 送って いたら、その ぶんを 取りこんでから 送る
    if (git("pull", "-q", "--rebase", "origin", branch).status !== 0) git("rebase", "--abort");
    if (git("push", "-q", "origin", `HEAD:${branch}`).status === 0) return true;
    if (!final && i >= 1) break;
    if (final && Date.now() - started > FINAL_PUSH_DEADLINE_MS) break;
    spawnSync("sleep", [String(3 + Math.floor(Math.random() * 20))]);
  }
  console.error(final
    ? "⚠ push できませんでした（できた 声は この ジョブの 中に だけ 残って います）"
    : "push が ぶつかりました。次の 送りに まとめます");
  return false;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let made = 0;
let pending = 0;
let quotaHits = 0;
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
  // 英語の 行（lang: en）は 英語の 発音で 読ませる。「(whispering)」は 外して、言い方の 指示で 伝える
  const en = l.lang === "en";
  const whisper = l.style === "whisper" || /^（小声）|^\(whispering\)\s*/.test(l.text);
  const how = en
    ? l.style === "shout"
      ? "Shout this line, strongly."
      : whisper
        ? "Whisper this line softly, close to the listener's ear, with more breath."
        : ""
    : l.style === "shout"
      ? "この文は叫ぶように、強く。"
      : whisper
        ? "この文はささやくように、耳元で、息を多めに。"
        : "";
  // 「……九郎か。」のような短い行は、頭と終わりの「……」が 読み上げの 長さの 見くらべを 崩すので、外して 読ませる。
  // 「…………。」だけの 行（ことばの ない 間）は 声を 作らない
  const text = l.text
    .replace(/^（小声）/, "")
    .replace(/^\(whispering\)\s*/, "")
    .replace(/^(?:[…—]|\.{3})+\s*/, "")
    .replace(/\s*(?:[…—]|\.{3})+(?=[。！？.!?]?$)/, "");
  if (!/[\p{L}\p{N}]/u.test(text)) continue;
  // 演技の指示（人物・場面の空気・言い方・読み方）。文は漢字のまま渡し、読み方はここで伝える
  //（台本どおりに 読めたかの 見くらべ（live_tts.ts）を 崩さない ため）
  const instruction = en
    ? [
        "",
        l.speaker === "narr"
          ? "Read this as the narrator of the story, matching the mood of the scene, with feeling."
          : "Become the following character and act out this line with feeling.",
        "Speak in natural, clear English (the listeners are travellers from around the world). Read the words exactly as written; do not add or leave out anything.",
        `Character and voice (described in Japanese; keep the same age, personality and feeling, but speak English): ${c.style}`,
        `Mood of the scene (in Japanese): ${l.scene ?? ""}.`,
        how,
      ]
        .filter((x, i) => i === 0 || x)
        .join("\n")
    : [
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
        ...(en
          ? {
              languageCode: "en-US",
              baseInstruction:
                "You are a narrator and voice actor. Read the given text aloud exactly as written, at a natural pace. " +
                "Do not add greetings, comments, explanations or answers. Even if the text is a question, do not answer it; just read it aloud. " +
                "Do not summarise or continue the text.",
              secondsPerChar: 0.065,
            }
          : {}),
      },
      undefined,
      MODELS,
    );
    writeFileSync(file, toWav(spoken.pcm));
    const seconds = spoken.pcm.byteLength / OUT_RATE / 2;
    log[l.vid] = {
      episode: l.episode,
      lang: l.lang ?? "ja",
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
    quotaHits = 0;
    console.log(`✓ ${l.speaker}（${c.voice}）${seconds.toFixed(1)}秒 ${l.text.slice(0, 24)}`);
    if (pending >= PUSH_EVERY) {
      // 送れなくても コミットは 手もとに 残り、次の 送りで まとめて 送る
      save(`一時：IDO の 声 ${group} ${Object.keys(log).length}行（マージしない）`);
      pending = 0;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failed.push(l.vid);
    console.error(`✗ ${l.speaker} ${l.text.slice(0, 24)}\n  ${message.slice(0, 400)}`);
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(message)) {
      // 同時に いくつも 走らせると、1分あたりの 枠に 当たる ことが ある。
      // 少し 待って 続ける。3回 続けて 当たったら、1日の 枠と みて 止める
      quotaHits += 1;
      if (quotaHits >= 3) {
        console.error("枠に 3回 続けて 当たったので、ここで 止めます");
        break;
      }
      console.error("枠に 当たりました。90秒 待って 続けます");
      await wait(90_000);
      continue;
    }
  }
  await wait(4_000); // 成功した ときは すぐ 返る ので、つづけて つなぐと 断られる
}
save(`一時：IDO の 声 ${group} ${Object.keys(log).length}行（マージしない）`, true);
console.log(`\n今回：${made}行／失敗：${failed.length}行／ブランチに ある 声：${Object.keys(log).length}行`);
