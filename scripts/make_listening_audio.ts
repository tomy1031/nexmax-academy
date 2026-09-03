/**
 * リスニングの 原稿を 音に する（CI から 走らせる）
 *
 * ## なぜ CI で 作るのか
 * ミーティングの 音づくり（`make_meeting_audio.ts`）と 同じ 理由。鍵は BYOK 方式で
 * サーバにも `.env` にも 置かず、唯一 GitHub の Environment Secrets（`Preview`）に ある。
 * だから 鍵の 要る 作業は Actions の 中で やる（docs/constraints.md 運用の制約）。
 *
 * ## 何を するか
 * `content/listening/<教材ID>.json` の `script[].text` を 上から 読み上げ、
 * **1本の wav に つないで** `public/audio/listening/<教材ID>.wav` に 置き、
 * 教材の `audioUrl` を 書き足す。
 *
 * ## ミーティングと ちがって 1本に つなぐ
 * ミーティングは 会話が 行ったり 来たり するので 1文ずつ 別の ファイルに する。
 * リスニングは **頭から おわりまで 通して 聞く** 教材で、画面が 持って いる 札も
 * `audioUrl` 1つ だけ（`listeningSchema`）。だから ブロックの あいだに 短い 無音を
 * はさんで 1本に する——ブロックの 切れ目が 耳で 分かる ように。
 *
 * ## 読み上げたか どうかを その場で 確かめる
 * `synthesizeWithFallback`（`scripts/lib/live_tts.ts`）が 文字起こしと 見くらべる。
 * 合わなければ 作り直し、それでも 合わなければ **1本も 書かない**——
 * 途中まで の 音を 置くと、原稿と ずれた ものが 学習者に 届く。
 *
 * 使い方: `GEMINI_API_KEY=… node --import tsx scripts/make_listening_audio.ts <教材ID> [--force]`
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { OUT_RATE, synthesizeWithFallback, toWav } from "./lib/live_tts";

const listeningId: string = process.argv[2] ?? "";
/** すでに ある ものも 作り直すか。 */
const force: boolean = process.argv.includes("--force");
if (!listeningId) {
  console.error("使い方: node --import tsx scripts/make_listening_audio.ts <教材ID>");
  process.exit(1);
}
const apiKey: string = process.env.GEMINI_API_KEY ?? "";
if (!apiKey) {
  console.error("GEMINI_API_KEY が ありません（GitHub の Environment「Preview」に あります）");
  process.exit(1);
}

const listeningPath = join("content", "listening", `${listeningId}.json`);
const listening = JSON.parse(readFileSync(listeningPath, "utf8"));

interface Line {
  readonly speaker: string;
  readonly text: string;
}
const script: Line[] = (listening.script ?? []).filter((line: Line) => line.text?.trim());

/**
 * 声は **話す人の 人物カード**から 引く（まんが・たいわ・ミーティングと 同じ 人を
 * 同じ 声に する ため。ここで 別の 声を 当てない）。
 * 話す人が 複数 いる 原稿でも、行ごとに その人の 声で 読む。
 */
function voiceOf(speakerId: string): string {
  const cardPath = join("content", "characters", `${speakerId}.json`);
  if (!existsSync(cardPath)) return "Puck";
  return JSON.parse(readFileSync(cardPath, "utf8")).voice ?? "Puck";
}

/** ブロックの あいだに はさむ 無音（秒）。切れ目が 耳で 分かる ように。 */
const GAP_SECONDS = 0.6;
const gap = new Uint8Array(Math.round(OUT_RATE * GAP_SECONDS) * 2);

async function main(): Promise<void> {
  const outDir = join("public", "audio", "listening");
  const file = join(outDir, `${listeningId}.wav`);
  const url = `/audio/listening/${listeningId}.wav`;

  if (existsSync(file) && !force) {
    console.log(`${file} は すでに あります（作り直すには --force）`);
    if (listening.audioUrl !== url) {
      listening.audioUrl = url;
      writeFileSync(listeningPath, `${JSON.stringify(listening, null, 2)}\n`);
      console.log(`${listeningPath} に audioUrl を 書きました`);
    }
    return;
  }

  const pieces: Uint8Array[] = [];
  for (const [index, line] of script.entries()) {
    process.stdout.write(`(${index + 1}/${script.length}) ${line.speaker} … `);
    /*
     * **1つでも 落ちたら 全部 やめる**（ミーティングとは 逆）。
     * ミーティングは 1文ずつ 別の ファイルなので、作れた ぶんだけ 置けば よい。
     * リスニングは 1本に つなぐ ので、抜けた ぶんは **黙って 飛ばされた 原稿**に なる——
     * 学習者には「聞こえなかった」と 区別が つかない。
     */
    const spoken = await synthesizeWithFallback(line.text, {
      apiKey,
      voice: voiceOf(line.speaker),
    });
    if (pieces.length > 0) pieces.push(gap);
    pieces.push(spoken.pcm);
    console.log(
      `${(spoken.pcm.byteLength / OUT_RATE / 2).toFixed(1)}秒 「${spoken.transcript.trim()}」`,
    );
  }

  mkdirSync(outDir, { recursive: true });
  const pcm = Buffer.concat(pieces.map((one) => Buffer.from(one)));
  writeFileSync(file, toWav(pcm));
  listening.audioUrl = url;
  writeFileSync(listeningPath, `${JSON.stringify(listening, null, 2)}\n`);
  console.log(
    `${file}（${(pcm.byteLength / OUT_RATE / 2).toFixed(1)}秒）と ` +
      `${listeningPath} の audioUrl を 書きました`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
