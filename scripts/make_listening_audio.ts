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
 *  - 行では なく **1文ずつ** 読み上げ、声と モデルは 台帳の 名指しの ものを 使う
 *  - モデルが ちがう 人どうしは **同時に** 作る（列の 中は 1文ずつ）
 *  - 文の 前後の 無音を 切り、**文と 文の あいだを 台帳の 秒に そろえる**
 *  - 文ごとの wav と 台帳（`sentences.json`）を `public/audio/listening/<教材ID>/` に **残す**
 *  - 聞きくらべ用に 別の 秒でも つなぐ（`<教材ID>.gap2s.wav` など）
 *  - 読み上げは **読み（かな）の ずれ 1字まで**しか 許さない（`scripts/lib/speech_reading.ts`）
 *
 * ## TTS で まとめて 読む 教材（台帳の `engine: "tts"`。2026-09-28 から）
 * Live で 1文ずつ では なく、**Gemini の TTS で 会話を まとめて 読み**（声は 1回に 2人まで。
 * 3人 出る 原稿は 2人ずつの かたまりに 分ける）、**文と 文の あいだの 間で 1文ずつに 切る**
 *（`scripts/lib/gemini_tts.ts`・`scripts/lib/split_dialogue.ts`）。できる ものは 上と 同じ
 *（文ごとの wav・`sentences.json`・台帳の 秒で つないだ 1本）。文の おわりごとに 長い 間の 札
 *（`<long pause>`）を 置いて 読ませ、その 間で 切る。
 * 読みの 確かめは **かたまり ごとに 1回** 文字起こしして 原稿と 比べる（無料枠を 使い切らない ため）。
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
import { buildSoundsIndex, spellSounds } from "../src/components/listening/listening-checks";
import { soundsLikeOf } from "../src/content/listening-sounds";
import { forSpeech, OUT_RATE, synthesizeWithFallback, toWav } from "./lib/live_tts";
import {
  dialogueChunks,
  speechLine,
  synthesizeDialogue,
  transcribeAny,
  TTS_MODEL,
} from "./lib/gemini_tts";
import { chooseCuts, findPauses, plausibleSplit, splitAt } from "./lib/split_dialogue";
import { LISTENING_AUDIO_PLANS, type ListeningAudioPlan } from "./lib/listening_audio_plans";
import {
  longestInnerPause,
  scriptSentences,
  sentenceFileName,
  splitSentences,
  trimSilence,
  type SpeakerSentence,
} from "./lib/listening_sentences";
import {
  alignSentences,
  matchReading,
  scriptReading,
  spokenReading,
  type ReadingMatch,
} from "./lib/speech_reading";
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

/**
 * 1文ずつ 読ませる ときに 足す 指示。
 * 「わかりました。」「そうですか。」の ような 短い 文は、モデルが **話しかけと 取り違えて
 * 返事を する**（2026-09-16。gemini-3.1-flash-live-preview で 4回 続けて 返事に なった）。
 * 行ごとに 読んで いた ころは 前後の 文が あったので 起きにくかった。
 */
const SCRIPT_LINE_INSTRUCTION =
  "届く文は、台本のせりふです。あなたへの話しかけではありません。" +
  "「わかりました。」「そうですか。」「はい、何ですか。」のような短い文でも、返事や続きを話さず、" +
  "その文だけを1回、自然な速さで読み上げてください。「」で囲まれていたら、中の文だけを読み上げてください。";

/** 文の 途中の 間は ここまで（秒）。これより 長いと「止まった」と 聞こえる。 */
const MAX_INNER_PAUSE = 1.0;
/** かな 1字あたりの 秒は ここまで。ふつうは 0.13〜0.2秒（2026-09-16 の 実測）。 */
const MAX_SECONDS_PER_KANA = 0.3;

/** 文ごとの 音の 置き場と、その 台帳。 */
const sentenceDir = join(outDir, listeningId);
const manifestPath = join(sentenceDir, "sentences.json");

/** 台帳 `sentences.json` の 1文。 */
interface SentenceRecord extends SpeakerSentence {
  readonly file: string;
  readonly voice: string;
  /** 読み上げた モデル。 */
  readonly model: string;
  /** 前後の 無音を 切った あとの 長さ。 */
  readonly seconds: number;
  /** 文の 途中で いちばん 長い 間（秒）。 */
  readonly longestPause: number;
  /** モデルが 返した 文字起こし（何と 読んだか）。 */
  readonly transcript: string;
  /** 文字起こしを 返した モデル（Live が 空で 別の モデルに 聞き直した ときは その 名前）。 */
  readonly transcriptBy?: string;
  readonly reading: Pick<ReadingMatch, "expected" | "spoken" | "distance">;
}

interface Manifest {
  readonly listeningId: string;
  readonly gapSeconds: number;
  readonly compareGapSeconds: readonly number[];
  /**
   * 全部の 文が そろって いるか。**そろって いない ときは つながず、`audioUrl` も 変えない**。
   * つぎに 走らせると、そろって いる 文は 作り直さずに 続きから 作る（`--force` でも）。
   */
  readonly complete: boolean;
  /** まだ 無い 文の 番号（1から）。 */
  readonly missing: readonly number[];
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

/** 1回の 実行で 新しい 文を 作り始めて よい 時間（ミリ秒）。CI の 30分に 収める。 */
const RUN_BUDGET_MS = 18 * 60_000;

async function makeSentences(activePlan: ListeningAudioPlan): Promise<void> {
  const startedAt = Date.now();
  const sentences = scriptSentences(script);
  const previous: Manifest | null = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest)
    : null;
  /** 前の 回が 途中で 終わって いる（続きから 作る）。 */
  const resuming = previous !== null && previous.complete === false;

  if (joinOnly || (previous !== null && !resuming && !force)) {
    if (!previous) {
      throw new Error(`${manifestPath} が ありません。先に --force で 1文ずつ 作ってください`);
    }
    if (resuming) {
      throw new Error(
        `まだ そろって いません（無い 文: ${previous.missing.join("・")}）。もう一度 走らせて 続きを 作ってください`,
      );
    }
    const manifest = previous;
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
  // 数字・英字の 語は 原稿も 文字起こしも 同じ 台帳で かなへ（「GitHub」＝「ギットハブ」）
  const sounds = buildSoundsIndex(soundsLikeOf(listeningId));

  /** 文ごとの 結果（並び順に 入れる。同時に 作るので 終わる 順は ばらばら）。 */
  const done: ({ pcm: Uint8Array; record: SentenceRecord } | undefined)[] = [];

  /*
   * **前の 回で できた 文は 作り直さない**（2026-09-16。3.8 が 4文目で 崩れる たびに、
   * 合格して いた 11文まで 捨てて 最初から 作り直して いた）。
   * 原稿の 同じ 位置の 文と 話す人が 変わって いない ものだけ 使う。
   */
  if (resuming) {
    for (const record of previous.sentences) {
      const at = Number.parseInt(record.file, 10) - 1;
      const now = sentences[at];
      const wav = join(sentenceDir, record.file);
      if (!now || now.text !== record.text || now.speaker !== record.speaker) continue;
      if (!existsSync(wav)) continue;
      done[at] = { pcm: readFileSync(wav).subarray(44), record };
    }
    const kept = done.filter(Boolean).length;
    console.log(`前の 回で できて いる ${kept}文は そのまま 使います`);
  }

  /** 1文を 作る（名指しの 声・固定の モデル）。 */
  const makeOne = async (i: number): Promise<void> => {
    const sentence = sentences[i]!;
    const voice = voiceOf(sentence.speaker);
    const model = activePlan.models[sentence.speaker];
    let accepted: ReadingMatch | null = null;
    const accept = (candidate: { transcript: string; pcm: Uint8Array }) => {
      const match = matchReading(sentence.text, candidate.transcript, index, tokenizer, sounds);
      if (!match.ok) return match;
      /*
       * 読みが 合っても **長さが おかしい 音**は 落とす（2026-09-16。同じ 文が
       * 4.0秒 → 8.6秒 に なった。文字起こしは 原稿どおり だった）。
       */
      const trimmed = trimSilence(candidate.pcm);
      const pause = longestInnerPause(trimmed);
      const perKana = seconds(trimmed) / Math.max(match.expected.length, 1);
      if (pause > MAX_INNER_PAUSE) {
        return { ok: false, why: `文の 途中に ${pause.toFixed(1)}秒の 間が ある` };
      }
      if (perKana > MAX_SECONDS_PER_KANA) {
        return { ok: false, why: `読みが おそすぎる（かな 1字 ${perKana.toFixed(2)}秒）` };
      }
      accepted = match;
      return match;
    };
    // ためし切って だめ なら 投げる（呼ぶ 側が この 文を 飛ばして つぎへ 進む）
    const spoken = await synthesizeWithFallback(
      sentence.text,
      {
        apiKey,
        voice,
        instruction: SCRIPT_LINE_INSTRUCTION,
        quoteOnRetry: true,
        transcribeWhenEmpty: true,
      },
      accept,
      model ? [model] : undefined,
    );
    const match = accepted as ReadingMatch | null;
    if (!match) throw new Error(`(${i + 1}) 照合の 結果が ありません`);
    const pcm = trimSilence(spoken.pcm);
    const pause = longestInnerPause(pcm);
    done[i] = {
      pcm,
      record: {
        ...sentence,
        file: sentenceFileName(i),
        voice,
        model: spoken.model,
        seconds: Math.round(seconds(pcm) * 100) / 100,
        longestPause: Math.round(pause * 100) / 100,
        transcript: spoken.transcript.trim(),
        transcriptBy: spoken.transcriptBy ?? spoken.model,
        reading: { expected: match.expected, spoken: match.spoken, distance: match.distance },
      },
    };
    console.log(
      `(${i + 1}/${sentences.length}) ${sentence.speaker}・${voice}・${spoken.model} … ` +
        `${seconds(pcm).toFixed(1)}秒（いちばん 長い 間 ${pause.toFixed(2)}秒） ずれ${match.distance}字 「${spoken.transcript.trim()}」`,
    );
  };

  /*
   * **モデルごとに 列を 分けて 同時に 流す**（2026-09-16 の 指定。ヘンディさん＝3.8・
   * 藤木さん＝3.1）。無料枠は モデルごとに 数えられる ので、列を 分ければ 早く なり、
   * 上限にも 当たりにくい。列の 中は 1文ずつ、あいだに 間を おく——成功した ときは
   * `synthesizeWithFallback` が 待たずに 返る ので、つづけて つなぐと 断られる。
   */
  const lanes = new Map<string, number[]>();
  sentences.forEach((sentence, i) => {
    if (done[i]) return;
    const lane = activePlan.models[sentence.speaker] ?? "(モデル 指定なし)";
    lanes.set(lane, [...(lanes.get(lane) ?? []), i]);
  });
  /*
   * **1文 だめでも 列を 止めない**。その 文は 飛ばして つぎの 文へ 進み、できた ぶんを
   * 残す。つぎに 走らせた ときに 無い 文だけ 作る。持ち時間を 過ぎたら 新しい 文は 始めない。
   */
  const failures: string[] = [];
  await Promise.all(
    [...lanes.values()].map(async (lane) => {
      for (const [k, i] of lane.entries()) {
        if (Date.now() - startedAt > RUN_BUDGET_MS) {
          failures.push(`(${i + 1}) 時間切れで 作って いません`);
          continue;
        }
        if (k > 0) await new Promise((wait) => setTimeout(wait, 8_000));
        try {
          await makeOne(i);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`(${i + 1}) ${message}`);
          console.log(`(${i + 1}/${sentences.length}) だめ でした。飛ばして つぎへ\n  ${message}`);
        }
      }
    }),
  );
  const made = done.flatMap((one, i) => (one ? [{ ...one, i }] : []));
  const missing = sentences.flatMap((_, i) => (done[i] ? [] : [i + 1]));

  // 前の 文ごとの 音は 消してから、いま ある ぶんを 置き直す
  rmSync(sentenceDir, { recursive: true, force: true });
  mkdirSync(sentenceDir, { recursive: true });
  for (const one of made) writeFileSync(join(sentenceDir, one.record.file), toWav(one.pcm));
  const manifest: Manifest = {
    listeningId,
    gapSeconds: activePlan.gapSeconds,
    compareGapSeconds: activePlan.compareGapSeconds ?? [],
    complete: missing.length === 0,
    missing,
    sentences: made.map((one) => one.record),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (missing.length > 0) {
    // そろって いない ときは つながない（抜けた 文が 黙って 飛ばされた 音に なる）
    console.log(
      `${made.length}/${sentences.length}文を 残しました。まだ 無い 文: ${missing.join("・")}。` +
        "もう一度 走らせると 続きから 作ります\n  " +
        failures.join("\n  "),
    );
    return;
  }
  const parts = made.map((one) => one.pcm);
  const records = made.map((one) => one.record);
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

/* ------------------------------------------------------------------ *
 * TTS で 会話を まとめて 読み、間で 1文ずつに 切る（台帳の `engine: "tts"`）
 * ------------------------------------------------------------------ */

/** まとめて 読む のを 何回まで 試すか（切れ目が 決まらない ときの 読み直し）。 */
const BATCH_ATTEMPTS = 2;
/**
 * ずれた 文を まとめて 読み直す 回数。**無料枠は 1日 10回**（2026-09-28 に 429 で 判明:
 * 「limit: 10 requests per day on Free Tier」）なので、1文ずつ では なく まとめて 読み直す。
 */
const REREAD_ROUNDS = 2;
/**
 * 読み直す ずれの 大きさ（かな 何字 から）。1字の ずれは ほぼ 文字起こしの ゆれ
 *（「イシュー」→「イシュ」の 長音 落ち）で、1日 10回の 枠を 使う ほどでは ない。
 * 1字の ずれが 残った 文は 台帳（`sentences.json`）と 最後の まとめに 名指しで 出る。
 */
const REREAD_DISTANCE = 2;
/** 間を 拾う ときの 音の 大きさの しきい（小さい 順に 試す）。 */
const PAUSE_THRESHOLDS = [60, 120, 250] as const;
/**
 * 文の 切れ目と みなす 間の 短さの 下限（秒）。`<long pause>` を 置いた 切れ目は
 * これより 長く あく。読点や「っ」の すきま（0.1〜0.3秒）では 切らない。
 */
const MIN_BOUNDARY_PAUSE = 0.45;

/** かたまり 1つぶんの 結果（台帳 `sentences.json` の `chunks` に 残す）。 */
interface ChunkRecord {
  readonly lines: readonly number[];
  readonly speakers: readonly string[];
  /** まとめて 読んだ 回数（切れ目が 決まった 回まで）。0 は まとめて 読めなかった。 */
  readonly attempts: number;
  readonly transcript: string;
  readonly transcribedBy: string | null;
  /** まとめて 読んだ 音で 原稿と ずれて いた 文（1から。1文ずつ 読み直した）。 */
  readonly reread: readonly number[];
}

/** 文 1つぶんの 音と、その 確かめ。 */
interface TtsClip {
  pcm: Uint8Array;
  /** その 文の ところで 聞こえた 読み（かな）。確かめて いない ときは 空。 */
  spoken: string;
  /** 読みの ずれ（かな何字）。確かめて いない ときは null。 */
  distance: number | null;
  by: string | null;
  /** まとめて 読んだ 音から 切った か、1文だけで 読み直した か。 */
  source: "dialogue" | "sentence";
}

/** かなを カタカナへ（英字の 語を 読ませる ときの 字）。 */
function toKatakana(kana: string): string {
  return kana.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

async function makeSentencesByTts(activePlan: ListeningAudioPlan): Promise<void> {
  const apiKey = requireApiKey();
  const tokenizer = await getTokenizer();
  const index = buildFuriganaIndex(listening.furigana ?? []);
  const sounds = buildSoundsIndex(soundsLikeOf(listeningId));
  /*
   * **英字の 語は カタカナに してから 読ませる**（画面の 字は 変えない）。
   * 2回目（run 36410609494）で「Issueを 確認してから」を いっしゅう と 読んだ。
   * 読みは 台帳の 1つ目（GitHub → ギットハブ・S3 → エススリー）——学習者が 打つ 読みと そろう。
   */
  const latin = buildSoundsIndex(
    soundsLikeOf(listeningId).filter(([surface]) => /[A-Za-z]/.test(surface)),
  );
  const forTts = (text: string): string => forSpeech(spellSounds(text, latin, toKatakana));
  const sentences = scriptSentences(script);

  /** 話す人の 名前（TTS に 渡す ラベル）→ 声。 */
  const nameOf = (id: string): string =>
    (listening.participants ?? []).find((p: { id: string; name: string }) => p.id === id)?.name ??
    (id === "narration" ? "ナレーション" : id);
  const voices: Record<string, string> = {};
  for (const line of script) voices[nameOf(line.speaker)] = voiceOf(line.speaker);

  /** 行ごとの 文（原稿の 文の 通し番号つき）。 */
  let serial = 0;
  const lineSentences = script.map((line) =>
    splitSentences(line.text).map((text) => ({ index: serial++, speaker: line.speaker, text })),
  );
  const chunks = dialogueChunks(
    script.map((line) => line.speaker),
    script.map((line) => line.text.length),
  );
  console.log(
    `${sentences.length}文・${script.length}行を まとめて ${chunks.length}回で 読みます（${TTS_MODEL}）`,
  );

  const sleep = (ms: number) => new Promise((wait) => setTimeout(wait, ms));
  const clips: TtsClip[] = [];
  const chunkRecords: ChunkRecord[] = [];

  /** 文 1つ（原稿の 通し番号つき）。 */
  type Member = { index: number; speaker: string; text: string };

  /**
   * いくつかの 文を **まとめて 1回で** 読み、長い 間で 切って、1回の 文字起こしで
   * 文ごとの ずれを 出す。切れ目が 決まらなければ `null`（呼ぶ 側が 読み直す）。
   * `groups` は 行（話す人の ひとつづき）ごとの 文。
   */
  const speakBatch = async (
    groups: readonly (readonly Member[])[],
    source: TtsClip["source"],
  ): Promise<{ clips: TtsClip[]; odd: boolean[]; transcript: string } | null> => {
    const members = groups.flat();
    const expectedParts = members.map((one) => scriptReading(one.text, index, sounds));
    const weights = expectedParts.map((reading) => Math.max(1, reading.length));
    const raw = (
      await synthesizeDialogue(
        {
          // 文の おわりごとに 長い 間の 札を 置く（切れ目を はっきり させる。`SENTENCE_BREAK`）
          lines: groups.map((group, k) => ({
            speaker: nameOf(group[0]!.speaker),
            text: speechLine(
              group.map((one) => forTts(one.text)),
              k < groups.length - 1,
            ),
          })),
          voices,
          style: activePlan.style,
        },
        apiKey,
      )
    ).pcm;
    let parts: Uint8Array[] | null = null;
    let why = "";
    for (const threshold of PAUSE_THRESHOLDS) {
      const found = findPauses(raw, { threshold });
      const cuts = chooseCuts(found.pauses, found.speechStart, found.speechEnd, weights, {
        minBoundarySeconds: MIN_BOUNDARY_PAUSE,
      });
      if (!cuts) {
        why = `長い 間が 足りません（要る のは ${members.length - 1}）`;
        continue;
      }
      const split = splitAt(raw, cuts).map((one) => trimSilence(one));
      const check = plausibleSplit(split.map(seconds), weights);
      why = check.why;
      if (check.ok) {
        parts = split;
        break;
      }
    }
    console.log(
      `  ${members.length}文を まとめて: ${(raw.byteLength / OUT_RATE / 2).toFixed(1)}秒 — ` +
        (parts ? "切れました" : `切れ目が 決まりません（${why}）`),
    );
    if (!parts) return null;
    const heard = await transcribeAny(raw, apiKey);
    const aligned = heard
      ? alignSentences(expectedParts, spokenReading(heard.text, tokenizer, index, sounds))
      : null;
    /*
     * **長さの 見張り**（文字起こしが 無くても 効く）。まとめて 読んだ ふつうの 速さ
     *（かな 1字 あたりの 秒の 中央値）から 大きく 外れた 文は 読み直す。
     * 2回目（run 36410609494）で「問題は ありません」を 2度 読み、その 音が
     * 31字の 文に 入って 7.8秒（ふつうの 1.7倍）に なって いた。文が 少ない ときは 当てに
     * ならないので、3文 以上 まとめた ときだけ 見る。
     */
    const rates = parts.map((pcm, k) => seconds(pcm) / weights[k]!).sort((a, b) => a - b);
    const pace = rates[Math.floor(rates.length / 2)]!;
    const odd = parts.map(
      (pcm, k) =>
        members.length >= 3 &&
        (seconds(pcm) > pace * weights[k]! * 1.45 + 0.5 ||
          seconds(pcm) < pace * weights[k]! * 0.55 - 0.2),
    );
    return {
      clips: parts.map((pcm, k) => ({
        pcm,
        spoken: aligned?.[k]?.spoken ?? "",
        distance: aligned ? aligned[k]!.distance : null,
        by: heard?.model ?? null,
        source,
      })),
      odd,
      transcript: heard?.text ?? "",
    };
  };

  /** 読み直しが 要るか（ずれが 大きい・長さが おかしい）。 */
  const needsReread = (clip: TtsClip, odd: boolean): boolean =>
    odd || (clip.distance !== null && clip.distance >= REREAD_DISTANCE);
  /** a の ほうが よいか（ずれが 少ない。確かめて いない ものは いちばん 下）。 */
  const better = (a: TtsClip, b: TtsClip): boolean =>
    (a.distance ?? Number.POSITIVE_INFINITY) < (b.distance ?? Number.POSITIVE_INFINITY);

  for (const [c, lineIds] of chunks.entries()) {
    if (c > 0) await sleep(5_000);
    const groups = lineIds.map((id) => lineSentences[id]!);
    const members = groups.flat();
    const who = [...new Set(members.map((one) => nameOf(one.speaker)))];
    console.log(
      `[${c + 1}/${chunks.length}] ${who.join("・")} ${lineIds.length}行・${members.length}文`,
    );

    // 1. かたまりを まとめて 読んで 切る（切れ目が 決まらなければ もう 1回）
    let first: Awaited<ReturnType<typeof speakBatch>> = null;
    let attempts = 0;
    for (let attempt = 1; attempt <= BATCH_ATTEMPTS && !first; attempt += 1) {
      if (attempt > 1) await sleep(5_000);
      attempts = attempt;
      first = await speakBatch(groups, "dialogue");
    }
    if (!first) throw new Error(`${c + 1}つ目の かたまりを 文に 切れませんでした`);
    first.clips.forEach((clip, k) => (clips[members[k]!.index] = clip));

    // 2. ずれた 文・長さが おかしい 文だけ、**まとめて** 読み直す（無料枠は 1日 10回）
    let bad = members.filter((_, k) => needsReread(first!.clips[k]!, first!.odd[k]!));
    const reread = bad.map((one) => one.index + 1);
    for (let round = 1; round <= REREAD_ROUNDS && bad.length > 0; round += 1) {
      await sleep(5_000);
      for (const one of bad) {
        const now = clips[one.index]!;
        console.log(
          `  (${one.index + 1}) 読み直し「${one.text}」— ` +
            (now.distance !== null && now.distance >= REREAD_DISTANCE
              ? `ずれ ${now.distance}字「${now.spoken}」`
              : `長さが ふつうと ちがう（${seconds(now.pcm).toFixed(1)}秒）`),
        );
      }
      const again = await speakBatch(
        bad.map((one) => [one]),
        "sentence",
      );
      if (!again) continue;
      bad = bad.filter((one, k) => {
        const clip = again.clips[k]!;
        const current = clips[one.index]!;
        const odd = again.odd[k]!;
        if (!odd && (better(clip, current) || needsReread(current, false))) {
          clips[one.index] = clip;
        }
        return needsReread(clips[one.index]!, odd);
      });
    }
    chunkRecords.push({
      lines: lineIds,
      speakers: who,
      attempts,
      transcript: first.transcript,
      transcribedBy: first.clips[0]?.by ?? null,
      reread,
    });
  }

  const records: SentenceRecord[] = sentences.map((one, i) => {
    const clip = clips[i]!;
    return {
      ...one,
      file: sentenceFileName(i),
      voice: voiceOf(one.speaker),
      model: clip.source === "dialogue" ? `${TTS_MODEL}（まとめて）` : `${TTS_MODEL}（1文）`,
      seconds: Math.round(seconds(clip.pcm) * 100) / 100,
      longestPause: Math.round(longestInnerPause(clip.pcm) * 100) / 100,
      transcript: clip.spoken,
      transcriptBy: clip.by ?? "（確かめて いない）",
      reading: {
        expected: scriptReading(one.text, index, sounds),
        spoken: clip.spoken,
        distance: clip.distance ?? -1,
      },
    };
  });

  rmSync(sentenceDir, { recursive: true, force: true });
  mkdirSync(sentenceDir, { recursive: true });
  records.forEach((record, i) =>
    writeFileSync(join(sentenceDir, record.file), toWav(clips[i]!.pcm)),
  );
  const manifest: Manifest & { engine: string; chunks: readonly ChunkRecord[] } = {
    listeningId,
    gapSeconds: activePlan.gapSeconds,
    compareGapSeconds: activePlan.compareGapSeconds ?? [],
    complete: records.length === sentences.length,
    missing: [],
    sentences: records,
    engine: TTS_MODEL,
    chunks: chunkRecords,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeJoined(
    clips.map((clip) => clip.pcm),
    activePlan,
  );
  pointAudioUrl();

  const unchecked = records.filter((record) => record.reading.distance < 0);
  const off = records.filter((record) => record.reading.distance > 0);
  console.log(
    `${records.length}文を ${sentenceDir}/ に 残しました。` +
      ` 読み直した 文: ${chunkRecords.flatMap((one) => one.reread).length}` +
      `／確かめて いない 文: ${unchecked.length}／ずれが 残った 文: ${off.length}` +
      off
        .map((record) => `\n  ${record.file}「${record.text}」→「${record.reading.spoken}」`)
        .join(""),
  );
}

async function main(): Promise<void> {
  if (plan) {
    if (plan.engine === "tts" && !joinOnly) await makeSentencesByTts(plan);
    else await makeSentences(plan);
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
