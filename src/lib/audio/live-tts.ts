"use client";

/**
 * 台本 → 音声（Gemini Live・ブラウザから直接）
 *
 * サーバは短命トークンを出すだけで、音声は通さない（AGENTS.md 規律4 / 設計03 §2）。
 * Cloudflare Workers に載せたまま長時間の接続を抱えないためで、これは
 * Live対話（use-live-session.ts）と同じ考え方である。
 *
 * Live は1回の接続で声を切り替えられないので、**行ごとに1接続**して作り、
 * あとで1本につなぐ（wav.ts）。行数ぶん時間がかかるので、進み具合を必ず返す。
 */

import { LIVE_TTS_MODELS } from "@/lib/ai/models";
import { base64ToBytes, joinPcm, pcmToWav, type JoinedPcm } from "./wav";

/**
 * 読み上げに使うモデル。上から順にためす（src/lib/ai/models.ts）。
 * ここに名前を直書きしていたころ、モデルが差し替わって消えたことに誰も気づけなかった。
 */
const MODELS = LIVE_TTS_MODELS;

/**
 * 「書いてあるとおりに読む」ための指示。
 * これが無いとモデルが相づちや言い換えを足して、台本と音がずれる
 *（学習者は台本を見ながら聞くので、ずれると聞き取りの練習にならない）。
 */
const NARRATOR_INSTRUCTION =
  "あなたはナレーターです。渡された文を、書いてあるとおりに、自然な速さで読み上げてください。" +
  "あいづち・言い換え・説明・感想を足さないでください。読み上げ以外は何もしないでください。";

const LIVE_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/** 1行ぶんの読み上げ指示。 */
export interface TtsLine {
  readonly text: string;
  /** Live の作りおきの声（voices.ts）。 */
  readonly voice: string;
}

export interface TtsProgress {
  /** 作り終えた行数。 */
  readonly done: number;
  readonly total: number;
}

export class TtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsError";
  }
}

/**
 * 短命トークンを1つもらう。1トークン1接続なので行ごとに取り直す。
 *
 * **つなぐモデルを必ず渡す。** トークンは `liveConnectConstraints` で
 * 1つのモデルに縛られるので、渡さないと たいわ用モデルのトークンが返り、
 * TTS用モデルでの接続が必ず弾かれる（実際そうなっていた）。
 */
async function fetchToken(apiKey: string, model: string): Promise<string> {
  const response = await fetch("/api/live/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey, model }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ready?: boolean;
    token?: string;
    reason?: string;
  };
  if (!response.ok || !payload.ready || !payload.token) {
    throw new TtsError(messageForTokenReason(payload.reason));
  }
  return payload.token;
}

/** 失敗の理由を、先生が次の一手を決められる言い方にする。 */
function messageForTokenReason(reason: string | undefined): string {
  switch (reason) {
    case "noKey":
      return "AIの キーが まだ ありません。「AI指示出し」で 登録してください。";
    case "tokenRejected":
      return "みじかい きっぷ が つくれませんでした。「AI設定」で「せつぞくを ためす」を おしてください（AQ. で はじまる キーだと 止まることが あります）。";
    case "noPermission":
      return "この キーでは 音声づくりが つかえません。キーの プロジェクトを たしかめてください。";
    case "modelNotFound":
      return "音声づくりに つかう モデルが 見つかりません。「AI指示出し」で「せつぞくを ためす」を おしてください。";
    case "rateLimited":
      return "きょうは つかいすぎたようです。時間を おいて ためしてください。";
    default:
      return "音声の じゅんびが できませんでした。少し 待って もう一度 ためしてください。";
  }
}

/** 1行を読み上げて、生PCMを返す。 */
function synthesizeLine(token: string, line: TtsLine, model: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${LIVE_ENDPOINT}?access_token=${encodeURIComponent(token)}`);
    socket.binaryType = "arraybuffer";
    const chunks: Uint8Array[] = [];
    let setupDone = false;
    // 応答が来ないまま開きっぱなしにすると、先生の画面が止まったままになる
    const timer = setTimeout(() => {
      socket.close();
      reject(new TtsError("音声の 作成に 時間が かかりすぎました。"));
    }, 60_000);

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      socket.close();
      fn();
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: {
              // Live は音声だけを返す。TEXT を混ぜると接続ごと切れる
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: line.voice } },
                languageCode: "ja-JP",
              },
            },
            systemInstruction: { parts: [{ text: NARRATOR_INSTRUCTION }] },
          },
        }),
      );
    };

    socket.onmessage = async (event: MessageEvent<unknown>) => {
      const raw =
        typeof event.data === "string"
          ? event.data
          : await new Blob([event.data as BlobPart]).text();
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }

      if (message.setupComplete !== undefined && !setupDone) {
        setupDone = true;
        socket.send(
          JSON.stringify({
            clientContent: {
              turns: [{ role: "user", parts: [{ text: line.text }] }],
              turnComplete: true,
            },
          }),
        );
        return;
      }

      const server = message.serverContent as
        | { modelTurn?: { parts?: { inlineData?: { data?: string } }[] }; turnComplete?: boolean }
        | undefined;
      for (const part of server?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) chunks.push(base64ToBytes(part.inlineData.data));
      }
      if (server?.turnComplete) {
        const total = chunks.reduce((sum, c) => sum + c.length, 0);
        if (total === 0) {
          finish(() => reject(new TtsError("音声が 空でした。もう一度 ためしてください。")));
          return;
        }
        const pcm = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          pcm.set(chunk, offset);
          offset += chunk.length;
        }
        finish(() => resolve(pcm));
      }
    };

    socket.onerror = () => finish(() => reject(new TtsError("音声の 作成に しっぱいしました。")));
    socket.onclose = () => {
      clearTimeout(timer);
      if (chunks.length === 0) reject(new TtsError("音声の 作成に しっぱいしました。"));
    };
  });
}

/** 声のちがいを聞き比べるための1文（短いほど待たされない）。 */
export const SAMPLE_TEXT = "おはようございます。きょうの よていを つたえます。";

/** 1行だけ作る（声の試聴に使う）。 */
export async function synthesizeSample(apiKey: string, voice: string): Promise<Blob> {
  const pcm = await withModelFallback((model) =>
    fetchToken(apiKey, model).then((token) =>
      synthesizeLine(token, { text: SAMPLE_TEXT, voice }, model),
    ),
  );
  return pcmToWav(pcm);
}

/**
 * 台本ぜんぶを作って1本につなぐ。
 * 行ごとの開始秒も返すので、字幕を音に合わせられる。
 */
export async function synthesizeScript(
  apiKey: string,
  lines: readonly TtsLine[],
  onProgress?: (progress: TtsProgress) => void,
): Promise<{ wav: Blob; startSeconds: number[] }> {
  const parts: Uint8Array[] = [];
  for (const [index, line] of lines.entries()) {
    const pcm = await withModelFallback((model) =>
      fetchToken(apiKey, model).then((token) => synthesizeLine(token, line, model)),
    );
    parts.push(pcm);
    onProgress?.({ done: index + 1, total: lines.length });
  }
  const joined: JoinedPcm = joinPcm(parts);
  return { wav: pcmToWav(joined.pcm), startSeconds: joined.startSeconds };
}

/** 新しいモデルから順に試す。声が使えないモデルもあるため（voices.ts の注記）。 */
async function withModelFallback(run: (model: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  let last: unknown;
  for (const model of MODELS) {
    try {
      return await run(model);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new TtsError("音声の 作成に しっぱいしました。");
}
