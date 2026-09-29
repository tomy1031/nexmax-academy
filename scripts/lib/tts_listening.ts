/**
 * リスニングの 音を Gemini の TTS で **まとめて** 作る（台帳の `engine: "tts"` の 教材）
 *
 * `scripts/make_listening_audio.ts` から 呼ばれる。教材IDを カンマで 並べると、
 * **何本でも 1回の 実行で** 作る（`listening:a,b,c`）。
 *
 * ## 呼ぶ 回数を 減らす（無料枠は 1日 10回。2026-09-28 に 429 で 判明）
 * TTS は 1回に **声 2人まで**。だから 「話す人の 組」ごとに 読む:
 * - 2人の 会話は その 2人で 1回
 * - 3人 出る 教材（朝礼）は 2人ずつに 分ける（行の 並びは 飛んで よい——1文ずつ 切るので）
 * - **同じ 2人（か その 一部）の 組は、教材を またいで 1回に まとめる**
 *  （① 佐藤・高橋 と ⑤ の 高橋・佐藤 の 行を 1回で。⑤ の 山田さん だけの 行は ② 山田・鈴木 に 相乗り）
 * 5本で 4回。ずれた 文の 読み直しも 組ごとに まとめて 1回。
 *
 * ## 1回の 中で すること（2026-09-28 の ためしで 固めた）
 * 1. 音の ひとまとまり（`scriptSentences`。短い 文は となりと 1つ——`src/content/listening-audio.ts`）
 *    の おわりごとに `<long pause>` を 置いて 読ませる
 * 2. 0.45秒 以上の 間で ひとまとまりずつに 切る（`split_dialogue.ts`）
 * 3. 全体を 1回 文字起こしして、ひとまとまりごとの 読みの ずれを 出す（`alignSentences`）
 * 4. ずれた もの・長さが おかしい もの（同じ ことばを 2度 読んだ など）だけ まとめて 読み直す
 * 5. 台帳の 速さ（`tempo`）に そろえる（2026-09-29 の 指定「スピードは 1.25」。ffmpeg の atempo・音程は 保つ）
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tokenizer } from "kuromoji";
import { joinPcm } from "../../src/lib/audio/wav";
import {
  buildFuriganaIndex,
  mergeFuriganaEntries,
  type FuriganaEntry,
} from "../../src/lib/text/furigana";
import {
  buildSoundsIndex,
  spellSounds,
  type SoundsIndex,
} from "../../src/components/listening/listening-checks";
import { soundsLikeOf } from "../../src/content/listening-sounds";
import { audioUnitsOf } from "../../src/content/listening-audio";
import { forSpeech, OUT_RATE, toWav } from "./live_tts";
import { speechLine, synthesizeDialogue, transcribeAny, TTS_MODEL } from "./gemini_tts";
import { chooseCuts, findPauses, plausibleSplit, splitAt } from "./split_dialogue";
import { LISTENING_AUDIO_PLANS, type ListeningAudioPlan } from "./listening_audio_plans";
import {
  longestInnerPause,
  scriptSentences,
  sentenceFileName,
  trimSilence,
} from "./listening_sentences";
import { alignSentences, scriptReading, spokenReading } from "./speech_reading";
import { getTokenizer } from "./yomi_check";

/** まとめて 読む のを 何回まで 試すか（切れ目が 決まらない ときの 読み直し）。 */
const BATCH_ATTEMPTS = 2;
/** ずれた ものを まとめて 読み直す 回数。 */
const REREAD_ROUNDS = 1;
/**
 * 読み直す ずれの 大きさ（かな 何字 から）。1字の ずれは ほぼ 文字起こしの ゆれ
 *（「イシュー」→「イシュ」の 長音 落ち）。1字の ずれが 残った ものは 台帳と まとめに 名指しで 出る。
 */
const REREAD_DISTANCE = 2;
/** 間を 拾う ときの 音の 大きさの しきい（小さい 順に 試す）。 */
const PAUSE_THRESHOLDS = [60, 120, 250] as const;
/** 切れ目と みなす 間の 下限（秒）。`<long pause>` の 切れ目は これより 長い。 */
const MIN_BOUNDARY_PAUSE = 0.45;
/** 1回に 入れる 字の 上限（長すぎると 途中で 止まった ときに 失う ぶんが 大きい）。 */
const MAX_CALL_CHARS = 1800;

const seconds = (pcm: Uint8Array): number => pcm.byteLength / OUT_RATE / 2;
const sleep = (ms: number) => new Promise((wait) => setTimeout(wait, ms));

/** 音の ひとまとまり 1つ。 */
interface Unit {
  readonly listeningId: string;
  /** 教材の 中での 通し番号（0から。ファイル名 01.wav…）。 */
  readonly index: number;
  /** 話す人（participants の id）。 */
  readonly speaker: string;
  readonly text: string;
}

/** 教材 1本ぶんの 材料。 */
interface Source {
  readonly id: string;
  readonly path: string;
  readonly json: {
    script: { speaker: string; text: string }[];
    participants?: { id: string; name: string }[];
    furigana?: FuriganaEntry[];
    audioUrl?: string;
  };
  readonly plan: ListeningAudioPlan;
  readonly furigana: FuriganaEntry[];
  readonly sounds: SoundsIndex;
  /** 英字の 語を カタカナに する ための 台帳（読ませる 字だけ）。 */
  readonly latin: SoundsIndex;
  /** 行ごとの ひとまとまり。 */
  readonly lines: Unit[][];
}

/** 声の 持ち主（名前と 声で 1人。教材を またいで 同じ 人は 同じ 声）。 */
function personKey(source: Source, speaker: string): string {
  return `${nameOf(source, speaker)}@${source.plan.voices[speaker] ?? "?"}`;
}

function nameOf(source: Source, speaker: string): string {
  return (
    source.json.participants?.find((p) => p.id === speaker)?.name ??
    (speaker === "narration" ? "ナレーション" : speaker)
  );
}

/** かなを カタカナへ（英字の 語を 読ませる ときの 字）。 */
function toKatakana(kana: string): string {
  return kana.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/** 1回ぶんの 行（話す人の ひとつづき）。 */
interface CallLine {
  readonly source: Source;
  readonly speaker: string;
  readonly units: readonly Unit[];
}

/** 1回の 呼び出しの 中身。 */
interface Call {
  readonly persons: Set<string>;
  readonly lines: CallLine[];
  chars: number;
}

/**
 * 行を「声 2人まで」の 組に 分け、同じ 組は 教材を またいで 1回に まとめる。
 * 3人 以上の 教材は、いちばん よく 話す 2人を 1組に、のこりを 2人ずつに する。
 */
export function planCalls<L extends { persons: readonly string[]; chars: number }>(
  parts: readonly L[],
  maxChars = MAX_CALL_CHARS,
): L[][] {
  const calls: { persons: Set<string>; parts: L[]; chars: number }[] = [];
  for (const part of parts) {
    const home = calls.find(
      (call) =>
        new Set([...call.persons, ...part.persons]).size <= 2 &&
        call.chars + part.chars <= maxChars,
    );
    if (home) {
      for (const person of part.persons) home.persons.add(person);
      home.parts.push(part);
      home.chars += part.chars;
    } else {
      calls.push({ persons: new Set(part.persons), parts: [part], chars: part.chars });
    }
  }
  return calls.map((call) => call.parts);
}

/** 話す人を 2人ずつに 分ける（よく 話す 人から）。 */
export function pairSpeakers(counts: ReadonlyMap<string, number>): string[][] {
  const order = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([who]) => who);
  const pairs: string[][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push(order.slice(i, i + 2));
  return pairs;
}

/** atempo で 速さを 変える（音程は 保つ）。ffmpeg が 要る。 */
function changeTempo(pcm: Uint8Array, tempo: number, work: string): Uint8Array {
  if (tempo === 1) return pcm;
  const input = join(work, "in.wav");
  const output = join(work, "out.wav");
  writeFileSync(input, toWav(pcm));
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    input,
    "-filter:a",
    `atempo=${tempo}`,
    "-ar",
    String(OUT_RATE),
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    output,
  ]);
  return new Uint8Array(readFileSync(output).subarray(44));
}

/** 1つの ひとまとまりの 音と 確かめ。 */
interface Clip {
  pcm: Uint8Array;
  spoken: string;
  distance: number | null;
  by: string | null;
  source: "dialogue" | "reread";
}

export async function runTtsListenings(ids: readonly string[], apiKey: string): Promise<void> {
  const sources: Source[] = ids.map((id) => {
    const plan = LISTENING_AUDIO_PLANS[id];
    if (!plan || plan.engine !== "tts") {
      throw new Error(`${id} は TTS で 作る 教材では ありません（listening_audio_plans.ts）`);
    }
    const path = join("content", "listening", `${id}.json`);
    const json = JSON.parse(readFileSync(path, "utf8"));
    const script = (json.script ?? []).filter((line: { text?: string }) => line.text?.trim());
    let serial = 0;
    const lines = script.map((line: { speaker: string; text: string }) =>
      scriptSentences([line], audioUnitsOf(id)).map((unit) => ({
        listeningId: id,
        index: serial++,
        speaker: unit.speaker,
        text: unit.text,
      })),
    );
    const entries = soundsLikeOf(id);
    return {
      id,
      path,
      json: { ...json, script },
      plan,
      furigana: json.furigana ?? [],
      sounds: buildSoundsIndex(entries),
      latin: buildSoundsIndex(entries.filter(([surface]) => /[A-Za-z]/.test(surface))),
      lines,
    };
  });

  // 速さを 変える なら、呼ぶ 前に ffmpeg が あるか 見る（無料枠を 使ってから 止まらない）
  if (sources.some((source) => (source.plan.tempo ?? 1) !== 1)) {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  }

  const tokenizer = await getTokenizer();

  // 1. 組に 分けて、同じ 組を まとめる
  const parts = sources.flatMap((source) => {
    const counts = new Map<string, number>();
    for (const line of source.lines) {
      const who = line[0]?.speaker;
      if (who) counts.set(who, (counts.get(who) ?? 0) + line.length);
    }
    return pairSpeakers(counts).map((pair) => {
      const lines: CallLine[] = source.lines
        .filter((line) => line.length > 0 && pair.includes(line[0]!.speaker))
        .map((units) => ({ source, speaker: units[0]!.speaker, units }));
      return {
        persons: pair.map((speaker) => personKey(source, speaker)),
        chars: lines.reduce((sum, line) => sum + line.units.map((u) => u.text).join("").length, 0),
        lines,
      };
    });
  });
  const calls = planCalls(parts).map((group) => group.flatMap((part) => part.lines));
  const total = sources.reduce((sum, source) => sum + source.lines.flat().length, 0);
  console.log(
    `${sources.length}本・${total}まとまりを ${calls.length}回で 読みます（${TTS_MODEL}）`,
  );

  const clips = new Map<string, Clip>();
  const keyOf = (unit: Unit) => `${unit.listeningId}#${unit.index}`;

  /** 1回ぶんを 読んで 切って 確かめる。切れ目が 決まらなければ null。 */
  const speak = async (
    lines: readonly CallLine[],
    source: Clip["source"],
  ): Promise<{ clips: Clip[]; odd: boolean[] } | null> => {
    const units = lines.flatMap((line) => line.units);
    const own = new Map<string, Source>(lines.map((line) => [line.source.id, line.source]));
    // 確かめは 1回の 中で 同じ 辞書を 両がわに 使う（教材を またぐ ときは 合わせた 辞書）
    const index = buildFuriganaIndex(
      mergeFuriganaEntries(...[...own.values()].map((s) => s.furigana)),
    );
    const sounds = buildSoundsIndex([...own.keys()].flatMap((id) => soundsLikeOf(id)));
    const expected = units.map((unit) => scriptReading(unit.text, index, sounds));
    const weights = expected.map((reading) => Math.max(1, reading.length));
    const voices: Record<string, string> = {};
    for (const line of lines) {
      voices[nameOf(line.source, line.speaker)] = line.source.plan.voices[line.speaker] ?? "Puck";
    }
    const style = lines[0]!.source.plan.style;
    const raw = (
      await synthesizeDialogue(
        {
          lines: lines.map((line, k) => ({
            speaker: nameOf(line.source, line.speaker),
            text: speechLine(
              line.units.map((unit) =>
                forSpeech(spellSounds(unit.text, line.source.latin, toKatakana)),
              ),
              k < lines.length - 1,
            ),
          })),
          voices,
          style,
        },
        apiKey,
      )
    ).pcm;
    let pieces: Uint8Array[] | null = null;
    let why = "";
    for (const threshold of PAUSE_THRESHOLDS) {
      const found = findPauses(raw, { threshold });
      const cuts = chooseCuts(found.pauses, found.speechStart, found.speechEnd, weights, {
        minBoundarySeconds: MIN_BOUNDARY_PAUSE,
      });
      if (!cuts) {
        why = `長い 間が 足りません（要る のは ${units.length - 1}）`;
        continue;
      }
      const split = splitAt(raw, cuts).map((one) => trimSilence(one));
      const check = plausibleSplit(split.map(seconds), weights);
      why = check.why;
      if (check.ok) {
        pieces = split;
        break;
      }
    }
    console.log(
      `  ${units.length}まとまり: ${seconds(raw).toFixed(1)}秒 — ` +
        (pieces ? "切れました" : `切れ目が 決まりません（${why}）`),
    );
    if (!pieces) return null;
    const heard = await transcribeAny(raw, apiKey);
    const aligned = heard
      ? alignSentences(expected, spokenReading(heard.text, tokenizer as Tokenizer, index, sounds))
      : null;
    // 長さの 見張り: この 回の ふつうの 速さから 大きく 外れた もの（3つ 以上 ある ときだけ）
    const rates = pieces.map((pcm, k) => seconds(pcm) / weights[k]!).sort((a, b) => a - b);
    const pace = rates[Math.floor(rates.length / 2)]!;
    const odd = pieces.map(
      (pcm, k) =>
        units.length >= 3 &&
        (seconds(pcm) > pace * weights[k]! * 1.45 + 0.5 ||
          seconds(pcm) < pace * weights[k]! * 0.55 - 0.2),
    );
    return {
      clips: pieces.map((pcm, k) => ({
        pcm,
        spoken: aligned?.[k]?.spoken ?? "",
        distance: aligned ? aligned[k]!.distance : null,
        by: heard?.model ?? null,
        source,
      })),
      odd,
    };
  };

  const needsReread = (clip: Clip, odd: boolean): boolean =>
    odd || (clip.distance !== null && clip.distance >= REREAD_DISTANCE);

  // 2. 組ごとに まとめて 読む
  const bad: { line: CallLine; unit: Unit }[] = [];
  for (const [c, lines] of calls.entries()) {
    if (c > 0) await sleep(5_000);
    const names = [...new Set(lines.map((line) => nameOf(line.source, line.speaker)))];
    const from = [...new Set(lines.map((line) => line.source.id))];
    console.log(`[${c + 1}/${calls.length}] ${names.join("・")}（${from.join("・")}）`);
    let result: Awaited<ReturnType<typeof speak>> = null;
    for (let attempt = 1; attempt <= BATCH_ATTEMPTS && !result; attempt += 1) {
      if (attempt > 1) await sleep(5_000);
      result = await speak(lines, "dialogue");
    }
    if (!result) throw new Error(`${c + 1}回目の 組を 切れませんでした`);
    const units = lines.flatMap((line) => line.units.map((unit) => ({ line, unit })));
    units.forEach(({ line, unit }, k) => {
      clips.set(keyOf(unit), result!.clips[k]!);
      if (needsReread(result!.clips[k]!, result!.odd[k]!)) {
        const clip = result!.clips[k]!;
        console.log(
          `  読み直す: ${unit.listeningId} ${sentenceFileName(unit.index)}「${unit.text}」— ` +
            (clip.distance !== null && clip.distance >= REREAD_DISTANCE
              ? `ずれ ${clip.distance}字「${clip.spoken}」`
              : `長さが ふつうと ちがう（${seconds(clip.pcm).toFixed(1)}秒）`),
        );
        bad.push({ line, unit });
      }
    });
  }

  // 3. ずれた ものだけ、組ごとに まとめて 読み直す
  for (let round = 1; round <= REREAD_ROUNDS && bad.length > 0; round += 1) {
    const rereadParts = bad.map(({ line, unit }) => ({
      persons: [personKey(line.source, line.speaker)],
      chars: unit.text.length,
      lines: [{ source: line.source, speaker: line.speaker, units: [unit] }],
    }));
    const rereadCalls = planCalls(rereadParts).map((group) => group.flatMap((part) => part.lines));
    const still: typeof bad = [];
    for (const lines of rereadCalls) {
      await sleep(5_000);
      console.log(`[読み直し] ${lines.length}まとまり`);
      const again = await speak(lines, "reread");
      lines.forEach((line, k) => {
        const unit = line.units[0]!;
        const current = clips.get(keyOf(unit))!;
        const fresh = again?.clips[k];
        const better =
          fresh && !again!.odd[k] && (fresh.distance ?? Infinity) <= (current.distance ?? Infinity);
        if (fresh && better) clips.set(keyOf(unit), fresh);
        if (needsReread(clips.get(keyOf(unit))!, false)) still.push({ line, unit });
      });
    }
    bad.splice(0, bad.length, ...still);
  }

  // 4. 速さを そろえて、教材ごとに 書く
  const work = mkdtempSync(join(tmpdir(), "tts-tempo-"));
  try {
    for (const source of sources) writeSource(source, clips, keyOf, work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** 教材 1本ぶんを 書く（文ごとの wav・sentences.json・つないだ 1本・audioUrl）。 */
function writeSource(
  source: Source,
  clips: ReadonlyMap<string, Clip>,
  keyOf: (unit: Unit) => string,
  work: string,
): void {
  const outDir = join("public", "audio", "listening");
  const dir = join(outDir, source.id);
  const index = buildFuriganaIndex(source.furigana);
  const tempo = source.plan.tempo ?? 1;
  const units = source.lines.flat();
  const pcms = units.map((unit) => changeTempo(clips.get(keyOf(unit))!.pcm, tempo, work));

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const records = units.map((unit, i) => {
    const clip = clips.get(keyOf(unit))!;
    const pcm = pcms[i]!;
    writeFileSync(join(dir, sentenceFileName(unit.index)), toWav(pcm));
    return {
      speaker: unit.speaker,
      text: unit.text,
      file: sentenceFileName(unit.index),
      voice: source.plan.voices[unit.speaker] ?? "Puck",
      model: `${TTS_MODEL}（${clip.source === "dialogue" ? "まとめて" : "読み直し"}）`,
      seconds: Math.round(seconds(pcm) * 100) / 100,
      longestPause: Math.round(longestInnerPause(pcm) * 100) / 100,
      transcript: clip.spoken,
      transcriptBy: clip.by ?? "（確かめて いない）",
      reading: {
        expected: scriptReading(unit.text, index, source.sounds),
        spoken: clip.spoken,
        distance: clip.distance ?? -1,
      },
    };
  });
  const manifest = {
    listeningId: source.id,
    gapSeconds: source.plan.gapSeconds,
    compareGapSeconds: source.plan.compareGapSeconds ?? [],
    complete: true,
    missing: [],
    sentences: records,
    engine: TTS_MODEL,
    tempo,
    joinShort: audioUnitsOf(source.id).joinShort,
  };
  writeFileSync(join(dir, "sentences.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const targets: [string, number][] = [
    [join(outDir, `${source.id}.wav`), source.plan.gapSeconds],
    ...(source.plan.compareGapSeconds ?? []).map((g): [string, number] => [
      join(outDir, `${source.id}.gap${g}s.wav`),
      g,
    ]),
  ];
  for (const [target, gap] of targets) {
    const joined = joinPcm(pcms, gap * 1000).pcm;
    writeFileSync(target, toWav(joined));
    console.log(
      `${target}（あいだ ${gap}秒・全体 ${seconds(joined).toFixed(1)}秒・速さ ${tempo}）`,
    );
  }
  const url = `/audio/listening/${source.id}.wav`;
  if (source.json.audioUrl !== url) {
    const raw = JSON.parse(readFileSync(source.path, "utf8"));
    raw.audioUrl = url;
    writeFileSync(source.path, `${JSON.stringify(raw, null, 2)}\n`);
  }
  const off = records.filter((record) => record.reading.distance > 0);
  const unchecked = records.filter((record) => record.reading.distance < 0);
  console.log(
    `${source.id}: ${records.length}まとまり。確かめて いない: ${unchecked.length}／ずれが 残った: ${off.length}` +
      off
        .map((record) => `\n  ${record.file}「${record.text}」→「${record.reading.spoken}」`)
        .join(""),
  );
}
