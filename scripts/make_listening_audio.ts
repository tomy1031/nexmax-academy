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
 * ## 1文ずつ 作る 教材（`scripts/lib/listening_audio_plans.ts` に ある もの）
 * 台帳に ある 教材は 作りかたが 変わる（2026-09-16 の 指定。報告の リスニング）:
 *  - 行では なく **1文ずつ** 読み上げ、声は 台帳の 名指しの 声を 使う
 *  - 文の 前後の 無音を 切り、**文と 文の あいだを 台帳の 秒に そろえる**
 *  - 文ごとの wav と 台帳（`sentences.json`）を `public/audio/listening/<教材ID>/` に **残す**
 *  - 聞きくらべ用に 別の 秒でも つなぐ（`<教材ID>.gap2s.wav` など）
 *  - 読み上げは **読み（かな）の ずれ 1字まで**しか 許さない（`scripts/lib/speech_reading.ts`）
 *
 * 秒だけ 変える ときは 台帳の `gapSeconds` を 直して `--join` で つなぎ直す。
 * **鍵も 読み上げも 要らない**ので 手もとで できる。原稿が 変わって いたら 止まる
 *（古い 文の 音を 新しい 原稿に つなが ない ため）——そのときは `--force` で 作り直す。
 *
 * ## 読み上げたか どうかを その場で 確かめる
 * `synthesizeWithFallback`（`scripts/lib/live_tts.ts`）が 文字起こしと 見くらべる。
 * 合わなければ 作り直し、それでも 合わなければ **1本も 書かない**——
 * 途中まで の 音を 置くと、原稿と ずれた ものが 学習者に 届く。
 *
 * 使い方:
 *   `GEMINI_API_KEY=… node --import tsx scripts/make_listening_audio.ts <教材ID> [--force]`
 *   `node --import tsx scripts/make_listening_audio.ts <教材ID> --join`（1文ずつの 教材だけ）
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { joinPcm } from "../src/lib/audio/wav";
import { buildFuriganaIndex } from "../src/lib/text/furigana";
import { OUT_RATE, synthesizeWithFallback, toWav } from "./lib/live_tts";
import { LISTENING_AUDIO_PLANS, type ListeningAudioPlan } from "./lib/listening_audio_plans";
import {
  scriptSentences,
  sentenceFileName,
  trimSilence,
  type SpeakerSentence,
} from "./lib/listening_sentences";
import { matchReading, type ReadingMatch } from "./lib/speech_reading";
import { getTokenizer } from "./lib/yomi_check";

const listeningId: string = process.argv[2] ?? "";
/** すでに ある ものも 作り直すか。 */
const force: boolean = process.argv.includes("--force");
/** 残して ある 文ごとの 音を、台帳の 秒で つなぎ直すだけに するか。 */
const joinOnly: boolean = process.argv.includes("--join");
if (!listeningId) {
  console.error("使い方: node --import tsx scripts/make_listening_audio.ts <教材ID>");
  process.exit(1);
}

const listeningPath = join("content", "listening", `${listeningId}.json`);
const listening = JSON.parse(readFileSync(listeningPath, "utf8"));
const plan: ListeningAudioPlan | undefined = LISTENING_AUDIO_PLANS[listeningId];

interface Line {
  readonly speaker: string;
  readonly text: string;
}
const script: Line[] = (listening.script ?? []).filter((line: Line) => line.text?.trim());

const outDir = join("public", "audio", "listening");
const file = join(outDir, `${listeningId}.wav`);
const url = `/audio/listening/${listeningId}.wav`;

/** 鍵（読み上げる ときだけ 要る）。 */
function requireApiKey(): string {
  const apiKey: string = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    console.error("GEMINI_API_KEY が ありません（GitHub の Environment「Preview」に あります）");
    process.exit(1);
  }
  return apiKey;
}

/**
 * 声は **話す人の 人物カード**から 引く（まんが・たいわ・ミーティングと 同じ 人を
 * 同じ 声に する ため。ここで 別の 声を 当てない）。
 * 話す人が 複数 いる 原稿でも、行ごとに その人の 声で 読む。
 * **1文ずつ 作る 教材だけ**は 台帳の 名指しの 声が 先（`listening_audio_plans.ts`）。
 */
function voiceOf(speakerId: string): string {
  const named = plan?.voices[speakerId];
  if (named) return named;
  const cardPath = join("content", "characters", `${speakerId}.json`);
  if (!existsSync(cardPath)) return "Puck";
  return JSON.parse(readFileSync(cardPath, "utf8")).voice ?? "Puck";
}

/** 教材の `audioUrl` を この 1本に 向ける（変わる ときだけ 書く）。 */
function pointAudioUrl(): void {
  if (listening.audioUrl === url) return;
  listening.audioUrl = url;
  writeFileSync(listeningPath, `${JSON.stringify(listening, null, 2)}\n`);
  console.log(`${listeningPath} に audioUrl を 書きました`);
}

const seconds = (pcm: Uint8Array): number => pcm.byteLength / OUT_RATE / 2;

/* ------------------------------------------------------------------ *
 * 行ごとに 読んで 0.6秒で つなぐ（台帳に 無い 教材。これまでの 作りかた）
 * ------------------------------------------------------------------ */

/** ブロックの あいだに はさむ 無音（秒）。切れ目が 耳で 分かる ように。 */
const GAP_SECONDS = 0.6;
const gap = new Uint8Array(Math.round(OUT_RATE * GAP_SECONDS) * 2);

async function makeWholeLines(): Promise<void> {
  if (existsSync(file) && !force) {
    console.log(`${file} は すでに あります（作り直すには --force）`);
    pointAudioUrl();
    return;
  }
  const apiKey = requireApiKey();

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
    console.log(`${seconds(spoken.pcm).toFixed(1)}秒 「${spoken.transcript.trim()}」`);
  }

  mkdirSync(outDir, { recursive: true });
  const pcm = Buffer.concat(pieces.map((one) => Buffer.from(one)));
  writeFileSync(file, toWav(pcm));
  pointAudioUrl();
  console.log(`${file}（${seconds(pcm).toFixed(1)}秒）を 書きました`);
}

/* ------------------------------------------------------------------ *
 * 1文ずつ 作って 残し、台帳の 秒で つなぐ（台帳に ある 教材）
 * ------------------------------------------------------------------ */

/** 文ごとの 音の 置き場と、その 台帳。 */
const sentenceDir = join(outDir, listeningId);
const manifestPath = join(sentenceDir, "sentences.json");

/** 台帳 `sentences.json` の 1文。 */
interface SentenceRecord extends SpeakerSentence {
  readonly file: string;
  readonly voice: string;
  /** 前後の 無音を 切った あとの 長さ。 */
  readonly seconds: number;
  /** モデルが 返した 文字起こし（何と 読んだか）。 */
  readonly transcript: string;
  readonly reading: Pick<ReadingMatch, "expected" | "spoken" | "distance">;
}

interface Manifest {
  readonly listeningId: string;
  readonly gapSeconds: number;
  readonly compareGapSeconds: readonly number[];
  readonly sentences: readonly SentenceRecord[];
}

/** 聞きくらべ用の 1本の 名前（`houkoku_listening.gap2s.wav`）。 */
function compareFile(gapSeconds: number): string {
  return join(outDir, `${listeningId}.gap${gapSeconds}s.wav`);
}

/** 文ごとの 音を 台帳の 秒で つなぎ、教材が 指す 1本と 聞きくらべ用を 書く。 */
function writeJoined(parts: readonly Uint8Array[], activePlan: ListeningAudioPlan): void {
  const targets: [string, number][] = [
    [file, activePlan.gapSeconds],
    ...(activePlan.compareGapSeconds ?? []).map((g): [string, number] => [compareFile(g), g]),
  ];
  for (const [target, gapSeconds] of targets) {
    const joined = joinPcm(parts, gapSeconds * 1000).pcm;
    writeFileSync(target, toWav(joined));
    console.log(`${target}（文の あいだ ${gapSeconds}秒・全体 ${seconds(joined).toFixed(1)}秒）`);
  }
}

/** 原稿の 文の 並び と 台帳の 並びが そろって いるか。 */
function sameSentences(a: readonly SpeakerSentence[], b: readonly SpeakerSentence[]): boolean {
  return (
    a.length === b.length &&
    a.every((one, i) => one.speaker === b[i]!.speaker && one.text === b[i]!.text)
  );
}

async function makeSentences(activePlan: ListeningAudioPlan): Promise<void> {
  const sentences = scriptSentences(script);

  if (joinOnly || (existsSync(manifestPath) && !force)) {
    if (!existsSync(manifestPath)) {
      throw new Error(`${manifestPath} が ありません。先に --force で 1文ずつ 作ってください`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    if (!sameSentences(manifest.sentences, sentences)) {
      throw new Error(
        "原稿が 残して ある 音と ちがいます（古い 文の 音を つなぐ ことに なる）。--force で 作り直してください",
      );
    }
    const parts = manifest.sentences.map((one) =>
      readFileSync(join(sentenceDir, one.file)).subarray(44),
    );
    writeJoined(parts, activePlan);
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          ...manifest,
          gapSeconds: activePlan.gapSeconds,
          compareGapSeconds: activePlan.compareGapSeconds ?? [],
        },
        null,
        2,
      )}\n`,
    );
    pointAudioUrl();
    return;
  }

  const apiKey = requireApiKey();
  const tokenizer = await getTokenizer();
  const index = buildFuriganaIndex(listening.furigana ?? []);

  const records: SentenceRecord[] = [];
  const parts: Uint8Array[] = [];
  for (const [i, sentence] of sentences.entries()) {
    const voice = voiceOf(sentence.speaker);
    process.stdout.write(`(${i + 1}/${sentences.length}) ${sentence.speaker}・${voice} … `);
    let accepted: ReadingMatch | null = null;
    // 1つでも 落ちたら 全部 やめる（行ごとの 作りかたと 同じ 理由）
    const spoken = await synthesizeWithFallback(sentence.text, { apiKey, voice }, (candidate) => {
      const match = matchReading(sentence.text, candidate.transcript, index, tokenizer);
      if (match.ok) accepted = match;
      return match;
    });
    const match = accepted as ReadingMatch | null;
    if (!match) throw new Error(`(${i + 1}) 照合の 結果が ありません`);
    const pcm = trimSilence(spoken.pcm);
    parts.push(pcm);
    records.push({
      ...sentence,
      file: sentenceFileName(i),
      voice,
      seconds: Math.round(seconds(pcm) * 100) / 100,
      transcript: spoken.transcript.trim(),
      reading: { expected: match.expected, spoken: match.spoken, distance: match.distance },
    });
    console.log(
      `${seconds(pcm).toFixed(1)}秒 ずれ${match.distance}字 「${spoken.transcript.trim()}」`,
    );
    /*
     * つぎの 文の 前に 間を おく。成功した ときは `synthesizeWithFallback` が 待たずに
     * 返る ので、20文を つづけて つなぐと 無料枠の 1分あたりの つなぎ数に 当たる。
     */
    if (i + 1 < sentences.length) await new Promise((wait) => setTimeout(wait, 8_000));
  }

  // ぜんぶ そろって から 書く（前の 文ごとの 音は 消してから 置き直す）
  rmSync(sentenceDir, { recursive: true, force: true });
  mkdirSync(sentenceDir, { recursive: true });
  records.forEach((record, i) => writeFileSync(join(sentenceDir, record.file), toWav(parts[i]!)));
  const manifest: Manifest = {
    listeningId,
    gapSeconds: activePlan.gapSeconds,
    compareGapSeconds: activePlan.compareGapSeconds ?? [],
    sentences: records,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeJoined(parts, activePlan);
  pointAudioUrl();
  const off = records.filter((record) => record.reading.distance > 0);
  console.log(
    `${records.length}文を ${sentenceDir}/ に 残しました。読みの ずれが 0で ない 文: ${off.length}` +
      off
        .map((record) => `\n  ${record.file} 「${record.text}」→「${record.transcript}」`)
        .join(""),
  );
}

async function main(): Promise<void> {
  if (plan) {
    await makeSentences(plan);
    return;
  }
  if (joinOnly) {
    throw new Error(
      `${listeningId} は 1文ずつ 作る 教材では ありません（scripts/lib/listening_audio_plans.ts）`,
    );
  }
  await makeWholeLines();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
