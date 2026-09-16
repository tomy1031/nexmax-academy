import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, Modality, type LiveConnectConfig, type Session } from "@google/genai";
import { expect, test } from "@playwright/test";
import { JUDGE_SYSTEM } from "../../src/components/meeting/judge-api";
import { createLiveToken } from "../../src/lib/ai/live-token";
import { LIVE_TALK_MODELS, LIVE_TEXT_MODELS, LIVE_TTS_MODELS } from "../../src/lib/ai/models";
import { SAMPLE_TEXT } from "../../src/lib/audio/live-tts";
import { NARRATOR_INSTRUCTION } from "../../src/lib/audio/narrator";
import { ASAKAI_TOOL } from "../../src/lib/meeting/asakai-judge";
import { buildJudgePrompt, CARD_TOOL, JUDGE_TOOL, parseJudge } from "../../src/lib/meeting/judge";
import { TALK_TOOL } from "../../src/lib/talkgame/judge";
import { evalKey } from "./eval-key";

/**
 * Live の **先頭の モデル**が、うちの つなぎかたを 受け付けるか（鍵が あるときだけ）
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
 * - ミーティング・対話ゲームの 声 … `use-live-voice.ts`（押して 話す・自動の 区切りを 切る）
 * - リスニングの たいわ …………… `use-live-session.ts`（マイクを 流しつづけ、区切りは 相手が 決める）
 * - AIの みかた ……………………… `judge-api.ts`（道具で 見かたを 返させる・つなぎを 使い回す）
 * - 音声づくり ……………………… `live-tts.ts`（書いて ある とおりに 読む）
 *
 * 鍵は 学習者と 同じく **短命トークンに 替えて** 使う（作れない 鍵の ときだけ 鍵で 直接）。
 * Gemini は Live しか 叩かない（docs/constraints.md「Gemini は Live だけ」）。
 * 鍵が 通信の 記録に 残らない ように トレースは 切る（`judge.ai.spec.ts` と 同じ）。
 */
test.use({ trace: "off", video: "off" });

/** つなぎを 重ねない（無料枠の Live は 1分あたりの つなぎ数が 少ない）。 */
test.describe.configure({ mode: "default" });

const IN_RATE = 16_000;
const CHUNK = IN_RATE / 10;

/** 学習者の 声の かわり（作り置きの 日本語の 音。24kHz・16bit・1ch）。 */
const VOICE_SAMPLE = join(process.cwd(), "public/audio/meetings/kaisha_matsui/probe-1.wav");

/** 相手役の 決まり（聞き返しの 決まりは docs/constraints.md の 会話練習の 型）。 */
const HOST_SYSTEM = [
  "あなたは 日本の IT会社の 社長です。学生と 日本語で 話します。",
  "学生の 話を ポジティブに 受け止めて、みじかい やさしい 日本語で 返事を します。",
  "聞き取れなかった ときや 分からなかった ときは、分かった ふりを せず 聞き返します。",
].join("\n");

interface ToolCall {
  readonly id?: string;
  readonly name?: string;
  readonly args?: Record<string, unknown>;
}

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
  /** reset から あとに 届いた 道具の 呼び出し。 */
  toolCalls(): readonly ToolCall[];
  /** 切られた 理由（切られて いなければ null）。鍵も トークンも 入らない。 */
  closedWith(): string | null;
  /** つぎの ターンを 見るために 数えなおす。 */
  reset(): void;
  close(): void;
}

const sleep = (ms: number) => new Promise((wait) => setTimeout(wait, ms));

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
  let calls: ToolCall[] = [];
  let closed: string | null = null;

  const ai = new GoogleGenAI({ apiKey: auth, apiVersion: "v1beta" });
  const connecting = ai.live.connect({
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
        for (const call of message.toolCall?.functionCalls ?? []) {
          calls = [...calls, { id: call.id, name: call.name, args: call.args }];
        }
      },
      onerror: () => {
        closed ??= "error";
      },
      onclose: (event) => {
        closed ??= `code ${event.code}${event.reason ? ` / ${event.reason}` : ""}`;
      },
    },
  });
  /*
   * SDK の connect は **したくの 合図（setupComplete）を 待つ**。設定を 断られると
   * 合図が 来ないまま 待ちつづける ので、ここで 期限を 切って 断られた 理由を 出す。
   */
  const session = await Promise.race([
    connecting,
    sleep(20_000).then(() => {
      throw new Error(`${model} に つながりません（${closed ?? "したくの 合図が 来ない"}）`);
    }),
  ]);

  return {
    session,
    audioBytes: () => bytes,
    said: () => said,
    heard: () => heard,
    turnDone: () => done,
    toolCalls: () => calls,
    closedWith: () => closed,
    reset: () => {
      bytes = 0;
      said = "";
      heard = "";
      done = false;
      calls = [];
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
    await sleep(100);
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

/** マイクと 同じ 大きさ（0.1秒ずつ）で 流す。 */
async function streamPcm(live: Live, pcm: Int16Array) {
  for (let at = 0; at < pcm.length; at += CHUNK) {
    const chunk = pcm.subarray(at, at + CHUNK);
    live.session.sendRealtimeInput({
      audio: {
        data: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString("base64"),
        mimeType: `audio/pcm;rate=${IN_RATE}`,
      },
    });
    await sleep(50);
  }
}

/** 押して 話す 1回（`use-live-voice.ts` の startTalking → 音 → stopTalking）。 */
async function pushToTalk(live: Live, pcm: Int16Array) {
  live.session.sendRealtimeInput({ activityStart: {} });
  await streamPcm(live, pcm);
  live.session.sendRealtimeInput({ activityEnd: {} });
}

/** 文字起こしの ならし（空白・句読点・記号を 落とす）。 */
const plain = (text: string) => text.replace(/[\s、。，．,.!?！？「」…ー]/g, "");

test.describe("Live の 先頭の モデル（鍵が あるときだけ）", () => {
  test.beforeEach(async () => {
    test.skip(evalKey() === "", "GEMINI_API_KEY が 無いので とばしました");
    test.setTimeout(150_000);
    // 前の テストの つなぎと 間を あける（1分あたりの つなぎ数）
    await sleep(3_000);
  });

  test(`ミーティングの 声: ${LIVE_TALK_MODELS[0]} が 合図・押して 話す・聞き取りにくい 声に 返す`, async () => {
    const model = LIVE_TALK_MODELS[0];
    const live = await openLive(evalKey(), model, {
      responseModalities: [Modality.AUDIO],
      systemInstruction: HOST_SYSTEM,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      speechConfig: {
        languageCode: "ja-JP",
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Schedar" } },
      },
    });
    try {
      // 1) つないだ 直後の 合図（文字・role 付き）に 声で 返す
      live.session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: "こんにちは。" }] }],
        turnComplete: true,
      });
      await waitFor(live, "合図への 声の 返事", () => live.audioBytes() > 0 && live.turnDone());
      console.log(`[live-models] voice ${model} 合図 → 「${live.said().trim()}」`);

      // 2) 押して 話す（activityStart → 音 → activityEnd）
      live.reset();
      const pcm = voiceSampleAt16k();
      await pushToTalk(live, pcm);
      await waitFor(
        live,
        "押して 話した ことへの 声の 返事",
        () => live.audioBytes() > 0 && live.turnDone(),
      );
      console.log(
        `[live-models] voice ${model} 聞き取り「${live.heard().trim()}」 → 「${live.said().trim()}」`,
      );
      expect(live.heard().trim(), "こちらの 声が 聞き取られて いない").not.toBe("");

      /*
       * 3) 聞き取りにくい 声（0.4秒の かけら）でも **黙らない**。
       * 3.8 は 先回りの 声（proactive audio）が 常に 有効で、関係ない と 見た 入力には
       * 返事を しない ことが ある。ミーティングは 相手の 返事で 聞き取りを 確定する ので、
       * ここで 黙られると 学習者の 画面が 止まる（検収 2026-09-16 の 指摘）。
       */
      live.reset();
      const middle = Math.floor(pcm.length / 2);
      await pushToTalk(live, pcm.subarray(middle - IN_RATE * 0.2, middle + IN_RATE * 0.2));
      await waitFor(
        live,
        "聞き取りにくい 声への 返事（黙った）",
        () => live.audioBytes() > 0 && live.turnDone(),
        30_000,
      );
      console.log(
        `[live-models] voice ${model} かけら「${live.heard().trim()}」 → 「${live.said().trim()}」`,
      );
      expect(live.closedWith()).toBeNull();
    } finally {
      live.close();
    }
  });

  test(`リスニングの たいわ: ${LIVE_TALK_MODELS[0]} が 流しつづけた 声の 切れ目で 返す`, async () => {
    const model = LIVE_TALK_MODELS[0];
    const live = await openLive(evalKey(), model, {
      responseModalities: [Modality.AUDIO],
      systemInstruction: HOST_SYSTEM,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        languageCode: "ja-JP",
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Schedar" } },
      },
    });
    try {
      // マイクは 開きっぱなし: 声の あとに 無音を 流し、区切りは 相手に 決めさせる
      await streamPcm(live, voiceSampleAt16k());
      await streamPcm(live, new Int16Array(IN_RATE * 2));
      await waitFor(live, "声の 切れ目での 返事", () => live.audioBytes() > 0 && live.turnDone());
      console.log(
        `[live-models] listening ${model} 聞き取り「${live.heard().trim()}」 → 「${live.said().trim()}」`,
      );
      expect(live.heard().trim(), "こちらの 声が 聞き取られて いない").not.toBe("");

      // 書いて 送る（`use-live-session.ts` の send は 文字列の turns）
      live.reset();
      live.session.sendClientContent({ turns: "よろしく おねがいします。", turnComplete: true });
      await waitFor(
        live,
        "書いて 送った ことへの 返事",
        () => live.audioBytes() > 0 && live.turnDone(),
      );
      expect(live.closedWith()).toBeNull();
    } finally {
      live.close();
    }
  });

  test(`AIの みかた: ${LIVE_TEXT_MODELS[0]} が 同じ つなぎで 2回 頼んでも 答えを 混ぜない`, async () => {
    const model = LIVE_TEXT_MODELS[0];
    const live = await openLive(evalKey(), model, {
      responseModalities: [Modality.AUDIO],
      systemInstruction: JUDGE_SYSTEM,
      tools: [JUDGE_TOOL] as never,
      temperature: 0.4,
    });
    const ask = (utterance: string) =>
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
                  utterance,
                  attempt: 1,
                }),
              },
            ],
          },
        ],
        turnComplete: true,
      });
    /** 画面の 実装と 同じく、受け取ったら すぐ 空の 返事を 返す。 */
    const answerTool = (call: ToolCall) =>
      live.session.sendToolResponse({
        functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }],
      });

    try {
      ask("わたしは プノンペンから きました。");
      await waitFor(live, "1回目の 道具の 呼び出し", () => live.toolCalls().length > 0);
      const first = live.toolCalls()[0]!;
      answerTool(first);
      /*
       * 3.8 は 道具の 呼び出しが **非同期（NON_BLOCKING）が 既定**。空の 返事の あとに
       * もう 1回 呼ばれると、画面は それを つぎの 答えの 見かたと 取りちがえる。
       * 少し 待って、よけいな 呼び出しが 来ない ことを 見る（検収 2026-09-16 の 指摘）。
       */
      await sleep(6_000);
      const extra = live.toolCalls().length - 1;
      console.log(
        `[live-models] judge ${model} 1回目 → ${JSON.stringify(first.args)}（よけい ${extra}）`,
      );
      expect(first.name).toBe("nihongo_no_mikata");
      expect(parseJudge(first.args, 1), "見かたの 形が 受け口（zod）を 通らない").not.toBeNull();
      expect(extra, "空の 返事の あとに 道具が もう 一度 呼ばれた").toBe(0);

      // 2回目（同じ つなぎ・かみ合わない 答え）は 2回目の 見かたが 返る
      live.reset();
      ask("うるさいです。");
      await waitFor(live, "2回目の 道具の 呼び出し", () => live.toolCalls().length > 0);
      const second = live.toolCalls()[0]!;
      answerTool(second);
      console.log(`[live-models] judge ${model} 2回目 → ${JSON.stringify(second.args)}`);
      expect(parseJudge(second.args, 1)).not.toBeNull();
      expect(first.args?.relevance).toBe("onTopic");
      expect(second.args?.relevance, "2回目に 1回目の 見かたが 返った").not.toBe("onTopic");
    } finally {
      live.close();
    }
  });

  test(`道具の 形: ${LIVE_TEXT_MODELS[0]} が 見かた・札・対話・朝礼の 4つを 受け付ける`, async () => {
    const model = LIVE_TEXT_MODELS[0];
    const tools: readonly { functionDeclarations: readonly unknown[] }[] = [
      JUDGE_TOOL,
      CARD_TOOL,
      TALK_TOOL,
      ASAKAI_TOOL,
    ];
    // 形の 受け付けだけを 見る ので、1本の つなぎに まとめる（つなぎ数を 増やさない）
    const live = await openLive(evalKey(), model, {
      responseModalities: [Modality.AUDIO],
      systemInstruction: JUDGE_SYSTEM,
      tools: [
        { functionDeclarations: tools.flatMap((tool) => tool.functionDeclarations) },
      ] as never,
      temperature: 0,
    });
    try {
      await sleep(2_000);
      console.log(
        `[live-models] tools ${model} 受け付け（${live.closedWith() ?? "切られていない"}）`,
      );
      expect(live.closedWith(), "道具の 形を 断られた").toBeNull();
    } finally {
      live.close();
    }
  });

  test(`音声づくり: ${LIVE_TTS_MODELS[0]} が 書いて ある 文を 答えずに 読む`, async () => {
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
      await sleep(700);
      const seconds = live.audioBytes() / 24_000 / 2;
      const said = plain(live.said());
      console.log(`[live-models] tts ${model} ${seconds.toFixed(1)}秒 「${live.said().trim()}」`);
      expect(seconds, "読み上げに しては 短すぎる").toBeGreaterThan(1.5);
      // あいさつを 返されても 通らない ように、**文の 後ろ半分**が 読まれて いるかを 見る
      expect(said, "「よていを つたえます」を 読んで いない").toMatch(/(よてい|予定)/);
      expect(said, "「よていを つたえます」を 読んで いない").toMatch(/(つたえ|伝え)/);
    } finally {
      live.close();
    }
  });
});
