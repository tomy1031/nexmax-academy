/**
 * Gemini の 音声合成（TTS）で、会話を **まとめて 1回で** 読み上げる（CI から 使う）
 *
 * ## なぜ 足したか（2026-09-28 の 指定「ためしに Google の 新しい TTS で 一括で 作成」）
 * Live で 1文ずつ 作る 道（`live_tts.ts`）は、短い 返事（「はい、大丈夫ですよ。」
 *「どうしましたか。」）を モデルが 途中で 切り、確かめの 文字起こしも 無料枠
 *（gemini-2.5-flash は 1日 20回）を 使い切って 止まった（同日 run 36406776276・36406785324）。
 * TTS は **台本を そのまま 読む** 専用の モデルで、会話を まとめて 1回で 読める——
 * 話しかけと 取り違えて 返事を する ことが 無く、呼ぶ 回数も 教材 1本で 1〜4回に 減る。
 *
 * ## 使いかた（Interactions API・参考 https://qiita.com/Takuya__/items/45a3c0b0da5c17f0b3bc）
 * - モデル `gemini-3.8-flash-tts`。行ごとに `speech_metadata` で 話す人と 話しかたを 付ける
 * - 2人の 会話は `speech_config.mode = "conversational"`。**1回に 声は 2人まで**
 *   だから 3人 出る 朝礼は 2人ずつの かたまりに 分けて 呼ぶ（`dialogueChunks`）
 * - 返る 音は 24kHz・16bit・モノラル（WAV か 生PCM。どちらでも 読む）
 *
 * SDK（@google/genai 2.16）の 型には まだ `mode` と `speech_metadata` が 無いので、
 * REST を 直に 呼ぶ。ここの 純関数（`ttsRequestBody`・`audioFromInteraction`・`pcmFromAudio`・
 * `dialogueChunks`）は 鍵なしで テストできる（tests/gemini_tts.test.ts）。
 */

import { GoogleGenAI } from "@google/genai";
import { OUT_RATE, toWav } from "./live_tts";

export const TTS_MODEL = "gemini-3.8-flash-tts";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** 1回の 呼び出しに 入れる 行。 */
export interface TtsLine {
  /** 話す人の 名前（`speakers` の `speaker` と 同じ 字）。 */
  readonly speaker: string;
  readonly text: string;
}

export interface TtsRequest {
  readonly lines: readonly TtsLine[];
  /** 話す人の 名前 → 声（Gemini の 30種の 名前）。 */
  readonly voices: Readonly<Record<string, string>>;
  /** 話しかたの 指示（全部の 行に 付ける）。 */
  readonly style?: string;
  readonly model?: string;
}

/**
 * 読み上げに 渡す 字（画面の 字は 変えない）。**分かち書きの 空白を 詰める**——
 * 日本語の あいだの 空白で 間を 取られると、1文が 切れ切れに 聞こえる。
 * 英字の 前後の 空白は 残す（「AWSの S3」の 語の 切れ目）。
 */
export function speechText(text: string): string {
  return text.replace(/(?<=[^\x00-\x7F])[ 　]+(?=[^\x00-\x7F])/g, "").trim();
}

/**
 * 文の 切れ目に 入れる **長い 間**の 札（TTS の 決まった 札。読み上げずに 無音に なる）。
 *
 * 1回目（2026-09-28・run 36409901284）は 札なしで 読ませた。会話の 間は 0.1〜0.3秒しか 無く、
 * 読点の 間・「っ」の すきまと 見分けが つかず、24文中 7文の 切れ目が ずれた
 *（「はい。」が 1.6秒、「パソコンと スマートフォンの どちらも…」が 2.1秒）。
 * 文の おわりごとに 札を 置けば、切れ目だけが はっきり 長く なる。
 */
export const SENTENCE_BREAK = "<long pause>";

/**
 * 1行を 読み上げに 渡す 字に する（文と 文の あいだに 長い 間の 札）。
 * `breakAfter` が true なら 行の おわりにも 札を 置く（次の 人へ 渡る 切れ目）。
 */
export function speechLine(sentences: readonly string[], breakAfter: boolean): string {
  const body = sentences.map((one) => speechText(one)).join(` ${SENTENCE_BREAK} `);
  return breakAfter ? `${body} ${SENTENCE_BREAK}` : body;
}

/** Interactions API に 送る 体（テストで 形を 見張る）。 */
export function ttsRequestBody(request: TtsRequest): Record<string, unknown> {
  const speakers = [...new Set(request.lines.map((line) => line.speaker))];
  if (speakers.length === 0) throw new Error("読む 行が ありません");
  if (speakers.length > 2) {
    throw new Error(`1回に 読める 声は 2人まで（${speakers.join("・")}）`);
  }
  const voiceOf = (speaker: string): string => {
    const voice = request.voices[speaker];
    if (!voice) throw new Error(`「${speaker}」の 声が 決まって いません`);
    return voice;
  };
  const conversational = speakers.length === 2;
  return {
    model: request.model ?? TTS_MODEL,
    input: [
      {
        type: "user_input",
        content: request.lines.map((line) => ({
          type: "text",
          text: line.text,
          annotations: [
            {
              type: "speech_metadata",
              ...(conversational ? { speaker: line.speaker } : {}),
              ...(request.style ? { style: request.style } : {}),
            },
          ],
        })),
      },
    ],
    response_format: { type: "audio" },
    generation_config: {
      speech_config: conversational
        ? {
            mode: "conversational",
            speakers: speakers.map((speaker) => ({ speaker, voice: voiceOf(speaker) })),
          }
        : [{ voice: voiceOf(speakers[0]!) }],
    },
  };
}

/** 返事の 中の 音（最後の `model_output` の `audio`。SDK の `output_audio` と 同じ 拾いかた）。 */
export function audioFromInteraction(
  json: unknown,
): { data: string; mimeType: string; sampleRate: number } | null {
  const steps = (json as { steps?: unknown[] })?.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i] as { type?: string; content?: unknown[] };
    if (step?.type === "user_input") break;
    if (step?.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (let j = step.content.length - 1; j >= 0; j -= 1) {
      const item = step.content[j] as {
        type?: string;
        data?: string;
        mime_type?: string;
        sample_rate?: number;
      };
      if (item?.type === "audio" && item.data) {
        return {
          data: item.data,
          mimeType: item.mime_type ?? "audio/wav",
          sampleRate: item.sample_rate ?? OUT_RATE,
        };
      }
    }
  }
  return null;
}

/**
 * 返った 音を 生PCM（16bit・モノラル・24kHz）に する。WAV なら 頭を 外し、生PCM なら そのまま。
 * **24kHz・モノラル 以外は 止める**——つなぐ 相手（`joinPcm`）と 速さが ずれる。
 */
export function pcmFromAudio(bytes: Uint8Array, sampleRate = OUT_RATE): Uint8Array {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.length >= 12 && view.toString("ascii", 0, 4) === "RIFF") {
    let at = 12;
    let rate = OUT_RATE;
    let channels = 1;
    let bits = 16;
    while (at + 8 <= view.length) {
      const id = view.toString("ascii", at, at + 4);
      const size = view.readUInt32LE(at + 4);
      if (id === "fmt ") {
        channels = view.readUInt16LE(at + 10);
        rate = view.readUInt32LE(at + 12);
        bits = view.readUInt16LE(at + 22);
      } else if (id === "data") {
        if (rate !== OUT_RATE || channels !== 1 || bits !== 16) {
          throw new Error(`音の 形が ちがいます（${rate}Hz・${channels}ch・${bits}bit）`);
        }
        const end = Math.min(view.length, at + 8 + size);
        return new Uint8Array(view.subarray(at + 8, end));
      }
      at += 8 + size + (size % 2);
    }
    throw new Error("WAV に data が ありません");
  }
  if (sampleRate !== OUT_RATE) throw new Error(`音の 速さが ちがいます（${sampleRate}Hz）`);
  return new Uint8Array(bytes);
}

/**
 * 原稿の 行を、**声が 2人まで**の かたまりに 分ける（行の 並びは 変えない）。
 * 3人目が 出た ところで 次の かたまりに する。長すぎる かたまりも 切る
 *（1回の 音が 長いと、途中で 止まった ときに 失う ぶんが 大きい）。
 */
export function dialogueChunks(
  speakers: readonly string[],
  lengths: readonly number[],
  { maxSpeakers = 2, maxChars = 1400 } = {},
): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let who = new Set<string>();
  let chars = 0;
  speakers.forEach((speaker, i) => {
    const length = lengths[i] ?? 0;
    const grows = !who.has(speaker);
    if (current.length > 0 && ((grows && who.size >= maxSpeakers) || chars + length > maxChars)) {
      chunks.push(current);
      current = [];
      who = new Set();
      chars = 0;
    }
    current.push(i);
    who.add(speaker);
    chars += length;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** 待つ。 */
const sleep = (ms: number) => new Promise((wait) => setTimeout(wait, ms));

/**
 * 会話を 読み上げて 生PCM を 返す。混んで いる（429・503）ときは 待って 3回まで。
 */
export async function synthesizeDialogue(
  request: TtsRequest,
  apiKey: string,
): Promise<{ pcm: Uint8Array; model: string }> {
  const body = JSON.stringify(ttsRequestBody(request));
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal: AbortSignal.timeout(240_000),
    });
    const text = await response.text();
    if (!response.ok) {
      lastError = `${response.status} ${text.slice(0, 600)}`;
      // 1日の 枠を 使い切った（無料枠は 1日 10回）。待っても 今日は 通らないので すぐ やめる
      if (response.status === 429 && /per day/i.test(text)) {
        throw new Error(`TTS の 1日の 無料枠を 使い切りました: ${lastError}`);
      }
      if (response.status === 429 || response.status === 503) {
        const delay = Number(/"retryDelay":\s*"(\d+)/.exec(text)?.[1] ?? 20);
        await sleep(Math.min(90, delay + 2) * 1000);
        continue;
      }
      throw new Error(`TTS が 失敗しました: ${lastError}`);
    }
    const audio = audioFromInteraction(JSON.parse(text));
    if (!audio) throw new Error(`TTS の 返事に 音が ありません: ${text.slice(0, 300)}`);
    const pcm = pcmFromAudio(Buffer.from(audio.data, "base64"), audio.sampleRate);
    return { pcm, model: request.model ?? TTS_MODEL };
  }
  throw new Error(`TTS が 混んで います: ${lastError}`);
}

/**
 * 文字起こしに 使う モデル（前から 順に 試す）。**無料枠は モデルごと**に 数えられるので、
 * 1つが 上限（gemini-2.5-flash は 1日 20回）でも 次で 聞ける。
 */
export const TRANSCRIBE_MODELS = [
  // 2026-09-28 の 実測: 3.8-flash と 3-flash-preview は 混雑（503）、2.5-flash は 1日 20回で 上限、
  // 3.1-flash と 2.5-flash-lite は 404（「3.5-flash-lite を 使え」と 返った）
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
] as const;

/**
 * 音を 文字に 起こす（読んだ 字が 原稿どおりかを 確かめる ため）。
 * どの モデルも 使えなければ `null`（呼ぶ 側が「確かめて いない」と 記録する）。
 */
export async function transcribeAny(
  pcm: Uint8Array,
  apiKey: string,
): Promise<{ text: string; model: string } | null> {
  const ai = new GoogleGenAI({ apiKey });
  // 混雑（503）は 少し 待てば 通る ことが 多いので、ひと回り だめなら 1回だけ 待って もう一周
  for (let round = 1; round <= 2; round += 1) {
    if (round > 1) await sleep(20_000);
    const found = await transcribeOnce(ai, pcm);
    if (found) return found;
  }
  return null;
}

async function transcribeOnce(
  ai: GoogleGenAI,
  pcm: Uint8Array,
): Promise<{ text: string; model: string } | null> {
  for (const model of TRANSCRIBE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "audio/wav", data: toWav(pcm).toString("base64") } },
              {
                text:
                  "この日本語の音声を、聞こえたとおりに一字一句そのまま文字起こししてください。" +
                  "話す人の名前や記号は付けず、言い直しや足りない言葉も直さずに書いてください。" +
                  "文字起こしの文だけを返してください。",
              },
            ],
          },
        ],
      });
      const text = response.text?.trim() ?? "";
      if (text) return { text, model };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  文字起こし（${model}）: 使えません — ${message.slice(0, 160)}`);
    }
  }
  return null;
}
