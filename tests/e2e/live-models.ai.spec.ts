import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, Modality, type LiveConnectConfig, type Session } from "@google/genai";
import { expect, test } from "@playwright/test";
import { JUDGE_SYSTEM } from "../../src/components/meeting/judge-api";
import { createLiveToken } from "../../src/lib/ai/live-token";
import { LIVE_TALK_MODELS, LIVE_TEXT_MODELS, LIVE_TTS_MODELS } from "../../src/lib/ai/models";
import { SAMPLE_TEXT } from "../../src/lib/audio/live-tts";
import { NARRATOR_INSTRUCTION } from "../../src/lib/audio/narrator";
import { buildJudgePrompt, JUDGE_TOOL, parseJudge } from "../../src/lib/meeting/judge";
import { evalKey } from "./eval-key";

/**
 * Live の **先頭の モデル**が、うちの 3つの つなぎかたを 受け付けるか（鍵が あるときだけ）
 *
 * ## なぜ 要るか（2026-09-16・3.8 Live へ 先頭を 移した とき）
 * 画面の 通し（`judge.ai.spec.ts` など）は **緑でも 先頭の モデルで 通ったとは かぎらない**。
 * 見かたの つなぎは 開けなければ 黙って 次の 名前へ 落ちる——3.8 が 断っても 3.1 で 緑に なる。
 * 逆に たいわの 声は 先頭の 1つしか ためさない ので、そこが 断られると 学習者の 声が 全部 止まる。
 * だから ここでは **落ちる 先を 持たずに**、一覧の 先頭へ 直接 つなぐ。
 *
 * 3.8 には 送ると 断られる 設定が ある（`src/lib/ai/models.ts` の 注記）。つなぎの 形は
 * 画面の 実装と 同じに して おく——ここの 形が ずれると、この 検証は 何も 守らない。
 *
 * - たいわ・ミーティングの 声 … `use-live-voice.ts`（押して 話す・自動の 区切りを 切る）
 * - AIの みかた …………………… `judge-api.ts`（道具で 見かたを 返させる）
 * - 音声づくり …………………… `live-tts.ts`（書いて ある とおりに 読む）
 *
 * 鍵は 学習者と 同じく **短命トークンに 替えて** 使う（作れない 鍵の ときだけ 鍵で 直接）。
 * Gemini は Live しか 叩かない（docs/constraints.md「Gemini は Live だけ」）。
 * 鍵が 通信の 記録に 残らない ように トレースは 切る（`judge.ai.spec.ts` と 同じ）。
 */
test.use({ trace: "off", video: "off" });

/** つなぎを 重ねない（無料枠の Live は 1分あたりの つなぎ数が 少ない）。 */
test.describe.configure({ mode: "default" });

const IN_RATE = 16_000;

/** 学習者の 声の かわり（作り置きの 日本語の 音。24kHz・16bit・1ch）。 */
const VOICE_SAMPLE = join(process.cwd(), "public/audio/meetings/kaisha_matsui/probe-1.wav");

interface Live {
  readonly session: Session;
  /** 返って きた 声の 長さ（バイト）。 */
  audioBytes(): number;
  /** 相手の 発話の 文字起こし。 */
  said(): string;
  /** こちらの 声の 聞き取り。 */
  heard(): string;
  /** 相手が ターンを 言い終えたか。 */
  turnDone(): boolean;
  /** 道具の 呼び出し（最後の 1つ）。 */
  toolCall(): { id?: string; name?: string; args?: Record<string, unknown> } | null;
  /** 切られた 理由（切られて いなければ null）。鍵も トークンも 入らない。 */
  closedWith(): string | null;
  /** つぎの ターンを 見るために 数えなおす。 */
  reset(): void;
  close(): void;
}

async function openLive(key: string, model: string, config: LiveConnectConfig): Promise<Live> {
  const minted = await createLiveToken({ apiKey: key });
  const canUseKey =
    !minted.ok && (minted.reason === "tokenRejected" || minted.reason === "invalidRequest");
  if (!minted.ok && !canUseKey) throw new Error(`短命トークンが 作れません（${minted.reason}）`);
  const auth = minted.ok ? minted.token : key;

  let bytes = 0;
  let said = "";
  let heard = "";
  let done = false;
  let call: ReturnType<Live["toolCall"]> = null;
  let closed: string | null = null;

  const ai = new GoogleGenAI({ apiKey: auth, apiVersion: "v1beta" });
  const session = await ai.live.connect({
    model,
    config,
    callbacks: {
      onmessage: (message) => {
        const content = message.serverContent;
        for (const part of content?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) bytes += Buffer.from(part.inlineData.data, "base64").length;
        }
        if (content?.outputTranscription?.text) said += content.outputTranscription.text;
        if (content?.inputTranscription?.text) heard += content.inputTranscription.text;
        if (content?.turnComplete) done = true;
        const first = message.toolCall?.functionCalls?.[0];
        if (first) call = { id: first.id, name: first.name, args: first.args };
      },
      onerror: () => {
        closed ??= "error";
      },
      onclose: (event) => {
        closed ??= `code ${event.code}${event.reason ? ` / ${event.reason}` : ""}`;
      },
    },
  });

  return {
    session,
    audioBytes: () => bytes,
    said: () => said,
    heard: () => heard,
    turnDone: () => done,
    toolCall: () => call,
    closedWith: () => closed,
    reset: () => {
      bytes = 0;
      said = "";
      heard = "";
      done = false;
      call = null;
    },
    close: () => {
      try {
        session.close();
      } catch {
        // もう 閉じて いる
      }
    },
  };
}

/** 条件が そろうまで 待つ。先に 切られたら その 理由で 落とす（待ち続けない）。 */
async function waitFor(live: Live, what: string, check: () => boolean, ms = 45_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return;
    const closed = live.closedWith();
    if (closed) throw new Error(`${what} の 前に 切られました（${closed}）`);
    await new Promise((wait) => setTimeout(wait, 100));
  }
  throw new Error(`${what} が ${ms / 1000}秒 待っても 来ません`);
}

/** WAV（24kHz）→ 16kHz の PCM。マイクの 送り方（`audio/pcm;rate=16000`）に そろえる。 */
function voiceSampleAt16k(): Int16Array {
  const wav = readFileSync(VOICE_SAMPLE);
  const rate = wav.readUInt32LE(24);
  const source = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) >> 1);
  const out = new Int16Array(Math.floor((source.length * IN_RATE) / rate));
  for (let i = 0; i < out.length; i += 1) {
    const at = (i * rate) / IN_RATE;
    const low = Math.floor(at);
    const high = Math.min(low + 1, source.length - 1);
    out[i] = Math.round(source[low]! + (source[high]! - source[low]!) * (at - low));
  }
  return out;
}

test.describe("Live の 先頭の モデル（鍵が あるときだけ）", () => {
  test.beforeEach(() => {
    test.skip(evalKey() === "", "GEMINI_API_KEY が 無いので とばしました");
    test.setTimeout(120_000);
  });

  test(`たいわ・ミーティングの 声: ${LIVE_TALK_MODELS[0]} が 文字と 押して 話すに 声で 返す`, async () => {
    const model = LIVE_TALK_MODELS[0];
    const live = await openLive(evalKey(), model, {
      responseModalities: [Modality.AUDIO],
      systemInstruction:
        "あなたは 日本の IT会社の 社長です。学生の 話を ポジティブに 受け止めて、みじかい 日本語で 返事を します。",
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      speechConfig: {
        languageCode: "ja-JP",
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Schedar" } },
      },
    });
    try {
      // 1) つないだ 直後の 合図（文字）に 声で 返す
      live.session.sendClientContent({ turns: "こんにちは。", turnComplete: true });
      await waitFor(live, "合図への 声の 返事", () => live.audioBytes() > 0 && live.turnDone());
      console.log(`[live-models] talk ${model} 合図 → 「${live.said().trim()}」`);

      // 2) 押して 話す（activityStart → 音 → activityEnd）
      live.reset();
      const pcm = voiceSampleAt16k();
      live.session.sendRealtimeInput({ activityStart: {} });
      for (let at = 0; at < pcm.length; at += IN_RATE / 10) {
        const chunk = pcm.subarray(at, at + IN_RATE / 10);
        live.session.sendRealtimeInput({
          audio: {
            data: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString("base64"),
            mimeType: `audio/pcm;rate=${IN_RATE}`,
          },
        });
        await new Promise((wait) => setTimeout(wait, 20));
      }
      live.session.sendRealtimeInput({ activityEnd: {} });
      await waitFor(
        live,
        "押して 話した ことへの 声の 返事",
        () => live.audioBytes() > 0 && live.turnDone(),
      );
      console.log(
        `[live-models] talk ${model} 聞き取り「${live.heard().trim()}」 → 「${live.said().trim()}」`,
      );
      expect(live.heard().trim(), "こちらの 声が 聞き取られて いない").not.toBe("");
      expect(live.closedWith()).toBeNull();
    } finally {
      live.close();
    }
  });

  test(`AIの みかた: ${LIVE_TEXT_MODELS[0]} が 道具で 見かたを 返す`, async () => {
    const model = LIVE_TEXT_MODELS[0];
    const live = await openLive(evalKey(), model, {
      responseModalities: [Modality.AUDIO],
      systemInstruction: JUDGE_SYSTEM,
      tools: [JUDGE_TOOL] as never,
      temperature: 0.4,
    });
    try {
      live.session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              {
                text: buildJudgePrompt({
                  ask: "しゅっしんは どこですか。",
                  hint: "わたしは ◯◯から きました。",
                  keywords: [],
                  judgePrompt: "",
                  hostName: "ヘンディ",
                  learnerName: "ソック",
                  utterance: "わたしは プノンペンから きました。",
                  attempt: 1,
                }),
              },
            ],
          },
        ],
        turnComplete: true,
      });
      await waitFor(live, "道具の 呼び出し", () => live.toolCall() !== null);
      const call = live.toolCall()!;
      // 返事を 返さないと 相手が 待ちつづける（画面の 実装と 同じ）
      live.session.sendToolResponse({
        functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }],
      });
      console.log(`[live-models] judge ${model} → ${JSON.stringify(call.args)}`);
      expect(call.name).toBe("nihongo_no_mikata");
      expect(parseJudge(call.args, 1), "見かたの 形が 受け口（zod）を 通らない").not.toBeNull();
    } finally {
      live.close();
    }
  });

  test(`音声づくり: ${LIVE_TTS_MODELS[0]} が 書いて ある 文を 読む`, async () => {
    const model = LIVE_TTS_MODELS[0];
    const live = await openLive(evalKey(), model, {
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      systemInstruction: NARRATOR_INSTRUCTION,
      speechConfig: {
        languageCode: "ja-JP",
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Schedar" } },
      },
    });
    try {
      live.session.sendClientContent({ turns: SAMPLE_TEXT, turnComplete: true });
      await waitFor(live, "読み上げの 声", () => live.audioBytes() > 0 && live.turnDone());
      // 文字起こしの さいごの ひときれは turnComplete の あとに 届く ことが ある
      await new Promise((wait) => setTimeout(wait, 700));
      const seconds = live.audioBytes() / 24_000 / 2;
      console.log(`[live-models] tts ${model} ${seconds.toFixed(1)}秒 「${live.said().trim()}」`);
      expect(seconds, "読み上げに しては 短すぎる").toBeGreaterThan(1);
      expect(live.said(), "書いて ある 文を 読んで いない").toMatch(/おはよう/);
    } finally {
      live.close();
    }
  });
});
