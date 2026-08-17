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
 * 短命トークンを1つもらう。1トークン1接続（uses:1）なので行ごとに取り直す。
 * つなぐつもりのモデル名も渡す——サーバが理由を返すときの手がかりになる。
 *
 * **トークンが作れないキーでは、本人のキーをそのまま返す**（2026-08-17）。
 * 新形式（`AQ.`）のキーは authTokens.create だけ通らないことが知られていて、
 * 旧形式は 2026年9月に廃止される。ここで諦めると、その日に音声づくりが全滅する。
 * 「漏れても30分で切れる」効き目は失うので、**作れなかったときだけ**に限る
 * （たいわ側 use-live-session.ts と同じ判断）。
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
    if (payload.reason === "tokenRejected" || payload.reason === "invalidRequest") return apiKey;
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
    case "badKey":
      return "この キーを Google が 受け取りませんでした。AI Studio の キー一覧で 制限を かけてから、もう一度 ためしてください。";
    case "wrongKeyType":
      return "この 文字列は APIキーとして 受け取ってもらえませんでした（AQ. で はじまる 新しい 形式）。「AI設定」で キーを えらび直して ください。";
    case "locationNotSupported":
      return "キーでは なく「呼んだ 場所」が はじかれました。先生に つたえてください。";
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

/**
 * 1行を読み上げて、生PCMを返す。
 *
 * ## 素の WebSocket をやめた（2026-08-06）
 * 以前はここで `wss://…v1beta…BidiGenerateContent?access_token=` へ直接つないでいた。
 * 短命トークンで接続するときの正しい接続先・API版・クエリ名は、ドキュメントの
 * あちこちに散っていて（v1alpha / BidiGenerateContentConstrained という記述もある）、
 * 手書きだと**どれか1つ間違えただけで「音声が空」になり、理由が出ない**。
 * 実際そうなっていた。
 *
 * たいわ（use-live-session.ts）で使っている公式SDKに寄せる。SDKが接続先と
 * トークンの扱いを決めるので、ここが仕様の変化で黙って壊れることが無くなる。
 */
async function synthesizeLine(apiKey: string, line: TtsLine, model: string): Promise<Uint8Array> {
  // SDK は接続時にだけ要る。初期表示のバンドルに載せない
  const { GoogleGenAI, Modality } = await import("@google/genai");
  const token = await fetchToken(apiKey, model);
  const ai = new GoogleGenAI({ apiKey: token });

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let settled = false;
    /** 失敗の理由。閉じたときに何が起きたのかを残す（トークンは含まれない）。 */
    let closeNote = "";

    // 応答が来ないまま開きっぱなしにすると、先生の画面が止まったままになる
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TtsError("音声の 作成に 時間が かかりすぎました。"));
    }, 60_000);

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const flush = () => {
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (total === 0) {
        done(() =>
          reject(new TtsError(`音声が かえって きませんでした（${model}）。${closeNote}`.trim())),
        );
        return;
      }
      const pcm = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        pcm.set(chunk, offset);
        offset += chunk.length;
      }
      done(() => resolve(pcm));
    };

    void ai.live
      .connect({
        model,
        config: {
          // Live は音声だけを返す。TEXT を混ぜると接続ごと切れる
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: line.voice } },
            languageCode: "ja-JP",
          },
          systemInstruction: NARRATOR_INSTRUCTION,
        },
        callbacks: {
          onopen: () => {
            // つながってから台本の1行を渡す
          },
          onmessage: (message: unknown) => {
            const server = (message as { serverContent?: ServerContent }).serverContent;
            for (const part of server?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) chunks.push(base64ToBytes(part.inlineData.data));
            }
            if (server?.turnComplete) flush();
          },
          onerror: (event: unknown) => {
            closeNote = describeClose(event);
            done(() =>
              reject(
                new TtsError(`音声の 作成に しっぱいしました（${model}）。${closeNote}`.trim()),
              ),
            );
          },
          onclose: (event: unknown) => {
            closeNote = describeClose(event);
            // 途中まで届いていれば、それを使う。1つも無ければ理由つきで返す
            flush();
          },
        },
      })
      .then((session) => {
        session.sendClientContent({ turns: line.text, turnComplete: true });
      })
      .catch((e: unknown) => {
        done(() =>
          reject(new TtsError(`音声に つなげませんでした（${model}）。${describeClose(e)}`.trim())),
        );
      });
  });
}

interface ServerContent {
  modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
  turnComplete?: boolean;
}

/**
 * 閉じた理由を短い一言にする。
 *
 * ここを捨てていたせいで「しっぱいしました」しか出せず、モデルが悪いのか
 * トークンが悪いのか、誰にも分からなかった。閉じ番号と理由には
 * キーもトークンも入らない（どちらもURLとヘッダにしか無い）。
 */
function describeClose(event: unknown): string {
  if (typeof event !== "object" || event === null) return "";
  const { code, reason, message } = event as {
    code?: unknown;
    reason?: unknown;
    message?: unknown;
  };
  const parts: string[] = [];
  if (typeof code === "number" && code !== 1000) parts.push(`code ${code}`);
  if (typeof reason === "string" && reason.length > 0) parts.push(reason);
  else if (typeof message === "string" && message.length > 0) parts.push(message);
  return parts.length > 0 ? `（${parts.join(" / ")}）` : "";
}

/** 声のちがいを聞き比べるための1文（短いほど待たされない）。 */
export const SAMPLE_TEXT = "おはようございます。きょうの よていを つたえます。";

/** 1行だけ作る（声の試聴に使う）。 */
export async function synthesizeSample(apiKey: string, voice: string): Promise<Blob> {
  const pcm = await withModelFallback((model) =>
    synthesizeLine(apiKey, { text: SAMPLE_TEXT, voice }, model),
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
    const pcm = await withModelFallback((model) => synthesizeLine(apiKey, line, model));
    parts.push(pcm);
    onProgress?.({ done: index + 1, total: lines.length });
  }
  const joined: JoinedPcm = joinPcm(parts);
  return { wav: pcmToWav(joined.pcm), startSeconds: joined.startSeconds };
}

/**
 * 新しいモデルから順に試す。声が使えないモデルもあるため（voices.ts の注記）。
 *
 * **全部だめだったときは、全部の理由を返す。** 最後の1つだけ返していたころは、
 * 「モデルが消えていた」のか「声が使えない」のか「トークンが通らない」のかが
 * 区別できず、直しようが無かった。
 */
async function withModelFallback(run: (model: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  const failures: string[] = [];
  for (const model of MODELS) {
    try {
      return await run(model);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${model}: 不明な エラー`);
    }
  }
  throw new TtsError(
    `どの モデルでも 音声を 作れませんでした。\n${failures.map((line) => `・${line}`).join("\n")}`,
  );
}
