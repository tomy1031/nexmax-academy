/**
 * Kotoba Town（tomy1031/lab の VR 日本語練習アプリ）の 作り置きの 声を 作る。
 *
 * 読み上げは 教材の 音声づくりと 同じ 道（`scripts/lib/live_tts.ts`）——Gemini Live で 読み、
 * 文字起こしを 台本と 見くらべて、合わない ものは 書かない。
 *
 * 入力:  kotoba-town/manifest.json   （lab の tools/voice_manifest.mjs が 作る）
 * 出力:  kotoba-town/out/voice/<id>.mp3 と kotoba-town/out/index.json（id → hash・秒・モデル・文字起こし）
 *
 * 使い方: GEMINI_API_KEY=… node --import tsx scripts/make_kotoba_voices.ts [--budget-min 22] [--only <id の 頭>]
 * すでに 同じ hash で できて いる 行は 飛ばす。さいごに `REMAINING=<数>` を 出す（ワークフローが 見る）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { synthesizeWithFallback, toWav } from "./lib/live_tts";

interface Line {
  id: string;
  voice: string;
  text: string;
  style: string;
  hash: string;
}
interface Made {
  hash: string;
  seconds: number;
  model: string;
  transcript: string;
}

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const budgetMs = Number(arg("--budget-min") ?? 22) * 60_000;
const only = arg("--only") ?? "";
const apiKey = process.env.GEMINI_API_KEY ?? "";
if (!apiKey) {
  console.error("GEMINI_API_KEY が ありません（Environment「Preview」）");
  process.exit(1);
}

const ROOT = "kotoba-town";
const OUT = join(ROOT, "out");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as { lines: Line[] };
const indexPath = join(OUT, "index.json");
const failPath = join(OUT, "failures.json");
const index: Record<string, Made> = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};
const failures: Record<string, string> = existsSync(failPath) ? JSON.parse(readFileSync(failPath, "utf8")) : {};
mkdirSync(join(OUT, "voice"), { recursive: true });

const save = () => {
  writeFileSync(indexPath, JSON.stringify(index, null, 1) + "\n");
  writeFileSync(failPath, JSON.stringify(failures, null, 1) + "\n");
};

/** wav → mp3（前後の 無音を 切って、24kHz モノラル 48kbps）。長さ（秒）を 返す。 */
function encode(wav: string, mp3: string): number {
  mkdirSync(dirname(mp3), { recursive: true });
  const trim =
    "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06," +
    "areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.18,areverse";
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", trim, "-ac", "1", "-ar", "24000", "-b:a", "48k", mp3]);
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp3], {
    encoding: "utf8",
  });
  return Number(out.trim()) || 0;
}

async function main(): Promise<void> {
const started = Date.now();
const todo = manifest.lines.filter((l) => l.id.startsWith(only) && index[l.id]?.hash !== l.hash);
console.log(`作る 行: ${todo.length} / ${manifest.lines.length}`);
let made = 0;
for (const line of todo) {
  if (Date.now() - started > budgetMs) {
    console.log("時間の 区切り。ここまでを 入れる");
    break;
  }
  try {
    const spoken = await synthesizeWithFallback(line.text, {
      apiKey,
      voice: line.voice,
      instruction: `\n話し方の 指示（読み上げる 文には 入れない）: ${line.style}`,
      quoteOnRetry: true,
      transcribeWhenEmpty: true,
    });
    const wav = join(tmpdir(), `kt-${process.pid}.wav`);
    writeFileSync(wav, toWav(spoken.pcm));
    const seconds = encode(wav, join(OUT, "voice", `${line.id}.mp3`));
    rmSync(wav, { force: true });
    index[line.id] = { hash: line.hash, seconds, model: spoken.model, transcript: spoken.transcript };
    delete failures[line.id];
    made += 1;
    console.log(`✓ ${line.id} (${line.voice}, ${seconds.toFixed(1)}s, ${spoken.model}) ${line.text}`);
  } catch (error) {
    failures[line.id] = String(error instanceof Error ? error.message : error).slice(0, 600);
    console.log(`✗ ${line.id}: ${failures[line.id]?.split("\n")[0]}`);
  }
  save();
  // 無料枠の Live は 1分あたりの つなぎ数が 少ない（live_tts.ts の 覚え書き）
  await new Promise((wait) => setTimeout(wait, 2_500));
}
save();
const remaining = manifest.lines.filter((l) => index[l.id]?.hash !== l.hash).length;
console.log(`できた: ${made} ／ のこり: ${remaining}`);
console.log(`MADE=${made}`);
console.log(`REMAINING=${remaining}`);
}

// Live の つなぎは 閉じても すぐには 片づかない ので、終わったら 明示的に 抜ける
void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
