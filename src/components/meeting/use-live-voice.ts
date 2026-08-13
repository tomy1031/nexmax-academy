"use client";

import { useCallback, useRef, useState } from "react";
import { DEFAULT_LIVE_TALK_MODEL, LIVE_TALK_MODELS } from "@/lib/ai/models";
import { getGeminiKey, getLiveModel } from "@/lib/profile";
import { base64ToBytes } from "@/lib/audio/wav";
import { startMicCapture, IN_RATE, type MicCapture } from "./mic-capture";

/**
 * Gemini Live と**声で**話すセッション。
 *
 * `use-live-session.ts` はテキストだけを送る作りで、マイクも再生も持っていない。
 * ミーティングは「話すのが主・書くのは補い」なので、音の出入りをここで足す。
 *
 * ## 音の決まり（Live API）
 * - 送る音声は **16kHz・16bit・モノラルの生PCM**（`audio/pcm;rate=16000`）
 * - 返る音声は **24kHz** の生PCM。`serverContent.modelTurn.parts[].inlineData` に base64 で来る
 * サンプリングレートが違うので、入力用と出力用の AudioContext を分ける。
 *
 * ## 口パクのための解析器
 * 再生の手前に `AnalyserNode` を挟んで返す。口の形はこの**音の大きさ**で決まるので、
 * 「鳴っているときだけ動く」が自然に成り立つ（`viseme-face.tsx`）。
 *
 * ## 何を返すか
 * 学習者が話した内容は `inputTranscription`、相手の返事は `outputTranscription` で
 * **文字でも**返る。判定と日本語の助言はその文字に対して行う（音のままでは検査できない）。
 */

export type VoiceStatus = "idle" | "connecting" | "live" | "notReady" | "error";

export interface VoiceTurn {
  readonly from: "me" | "client";
  readonly text: string;
}

interface TokenResponse {
  ready: boolean;
  reason?: string;
  token?: string;
  model?: string;
}

/** 返る音声のサンプリングレート（Live API の決まり）。送る側は mic-capture.ts が持つ。 */
const OUT_RATE = 24_000;

export interface LiveVoice {
  readonly status: VoiceStatus;
  readonly reason: string | null;
  /** 字幕。AIの聞き取り違いを学習者が目で確かめられるように残す。 */
  readonly turns: readonly VoiceTurn[];
  /**
   * 学習者が**言い終わった**ひとまとまり。判定はこれに対して行う。
   *
   * 聞き取りは細切れで届くので、届いたそばから判定すると「わたしは」だけで
   * 見られることになる。相手が話しはじめた合図（返事の文字起こし）で1つに束ねる。
   * `id` は同じ文をもう一度言ったときにも変わる（判定をやり直せるように）。
   */
  readonly lastUtterance: { id: number; text: string } | null;
  /** 口パクを動かすための解析器（再生の手前）。 */
  readonly analyser: AnalyserNode | null;
  /** `voice` は人物カードで決めた声（characters の voice）。 */
  readonly start: (systemInstruction: string, voice?: string) => Promise<void>;
  readonly stop: () => void;
  /** 声が使えないときの補い。テキストで送る（相手は声で返す）。 */
  readonly sendText: (text: string) => void;
}

export function useLiveVoice(): LiveVoice {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [turns, setTurns] = useState<readonly VoiceTurn[]>([]);
  const [lastUtterance, setLastUtterance] = useState<{ id: number; text: string } | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /** 聞き取りの途中。相手が話しはじめたら1つに束ねて流す。 */
  const heardRef = useRef("");
  const saidRef = useRef("");
  const utteranceIdRef = useRef(0);

  const sessionRef = useRef<{
    sendRealtimeInput: (input: unknown) => void;
    sendClientContent: (input: unknown) => void;
    close: () => void;
  } | null>(null);
  const micRef = useRef<{ capture: MicCapture; stream: MediaStream } | null>(null);
  const outRef = useRef<{ ctx: AudioContext; node: AnalyserNode; playAt: number } | null>(null);

  const stop = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    micRef.current?.capture.stop();
    micRef.current?.stream.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    void outRef.current?.ctx.close();
    outRef.current = null;
    setAnalyser(null);
    setStatus("idle");
  }, []);

  const start = useCallback(async (systemInstruction: string, voice?: string) => {
    setStatus("connecting");
    setReason(null);
    setTurns([]);
    setLastUtterance(null);
    heardRef.current = "";
    saidRef.current = "";

    const apiKey = getGeminiKey();
    if (!apiKey) {
      setStatus("notReady");
      setReason("noKey");
      return;
    }

    /*
     * 設定してあるモデル → 既定（新しいほう）の順にためす。
     * Live の preview モデルは**名前ごと入れ替わる**ので、前に選んだ名前が
     * 消えていることがある。1つで諦めると、画面には「声は まだ つかえません」
     * としか出ず、キーを疑い続けることになる（2026-08-06 に実際に起きた）。
     */
    const wanted = [getLiveModel(), ...LIVE_TALK_MODELS].filter(
      (name, index, all): name is string => Boolean(name) && all.indexOf(name) === index,
    );
    let payload: TokenResponse | null = null;
    let lastReason = "upstream";
    for (const model of wanted.length > 0 ? wanted : [DEFAULT_LIVE_TALK_MODEL]) {
      const response = await fetch("/api/live/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey, model }),
      });
      const body = (await response.json().catch(() => ({}))) as TokenResponse;
      if (body.ready && body.token && body.model) {
        payload = body;
        break;
      }
      lastReason = body.reason ?? "upstream";
      // キーそのものが無い・通らないなら、モデルを変えても同じ
      if (lastReason === "noKey" || lastReason === "noPermission") break;
    }
    if (!payload?.token || !payload.model) {
      setStatus("notReady");
      setReason(lastReason);
      return;
    }

    // マイクは**つなぐ前**に許可を取る。つないでから断られると、
    // 相手だけが話して学習者が答えられない状態で残る
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // 相手の声がスピーカーから回り込むと、そのまま聞き取りに混ざる
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setStatus("notReady");
      setReason("noMic");
      return;
    }

    try {
      const { GoogleGenAI, Modality } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: payload.token, apiVersion: "v1beta" });

      // 再生側。解析器を挟んでから出す
      const outCtx = new AudioContext({ sampleRate: OUT_RATE });
      // 自動再生の制限で止まったまま始まることがある。動かさないと1音も出ない
      if (outCtx.state === "suspended") await outCtx.resume();
      const node = outCtx.createAnalyser();
      node.fftSize = 512;
      node.connect(outCtx.destination);
      outRef.current = { ctx: outCtx, node, playAt: 0 };
      setAnalyser(node);

      const session = await ai.live.connect({
        model: payload.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          /*
           * 声は**人物カードで決めたもの**を使う（characters の voice）。
           * 決めていないときは Live の既定に任せる——ここで別の声を勝手に
           * 当てると、まんがのヘンディさんと声が違う人になる。
           * 言語を伝えるのは、日本語として聞き取らせるため。
           */
          speechConfig: {
            languageCode: "ja-JP",
            ...(voice ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } : {}),
          },
        },
        callbacks: {
          onopen: () => setStatus("live"),
          onmessage: (message: unknown) => {
            /*
             * 文字起こしは**細切れで**届く（「わたしは」「プノンペン」…）。
             * 1つずつ字幕にすると読めないし、途中で判定すると言い終える前に
             * 見られることになる。だから:
             *   聞き取り（学習者）… 相手が話しはじめた合図で 1つに束ねて流す
             *   返事（相手）      … turnComplete で 1つに束ねる
             */
            const piece = readTranscript(message);
            if (piece?.from === "me") heardRef.current += piece.text;
            if (piece?.from === "client") {
              const heard = heardRef.current.trim();
              if (heard) {
                heardRef.current = "";
                utteranceIdRef.current += 1;
                const id = utteranceIdRef.current;
                setTurns((prev) => [...prev, { from: "me", text: heard }]);
                setLastUtterance({ id, text: heard });
              }
              saidRef.current += piece.text;
            }
            if (isTurnComplete(message) && saidRef.current.trim()) {
              const said = saidRef.current.trim();
              saidRef.current = "";
              setTurns((prev) => [...prev, { from: "client", text: said }]);
            }
            for (const pcm of readAudio(message)) play(outRef.current, pcm);
          },
          onerror: () => setStatus("error"),
          onclose: () => setStatus("idle"),
        },
      });
      sessionRef.current = session as unknown as NonNullable<typeof sessionRef.current>;

      /*
       * マイク → 16kHz PCM → 送信。落とす処理は mic-capture.ts が持つ
       *（音声スレッドで動かすため。メインスレッドで作っていたころは、画面が
       * 忙しいと語の途中が丸ごと落ちて、何を言っても書き起こしが崩れていた）。
       */
      const capture = await startMicCapture(stream, (pcm) => {
        sessionRef.current?.sendRealtimeInput({
          audio: {
            data: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
            mimeType: `audio/pcm;rate=${IN_RATE}`,
          },
        });
      });
      micRef.current = { capture, stream };
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setStatus("error");
      setReason("connect");
    }
  }, []);

  /**
   * 書いて送る。**相手は声で返す**（Live は入力が文字でも音声で答える）。
   * マイクが無い・使いたくない学習者にも、同じ会話の体験を残すため。
   */
  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    setTurns((prev) => [...prev, { from: "me", text }]);
    sessionRef.current?.sendClientContent({ turns: text, turnComplete: true });
  }, []);

  return { status, reason, turns, lastUtterance, analyser, start, stop, sendText };
}

/** 相手が話し終わったか（返事を1つに束ねる合図）。 */
function isTurnComplete(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const content = (message as { serverContent?: { turnComplete?: unknown } }).serverContent;
  return content?.turnComplete === true;
}

/** 返ってきた24kHzのPCMを、切れ目なく順に鳴らす。 */
function play(
  out: { ctx: AudioContext; node: AnalyserNode; playAt: number } | null,
  pcm: Uint8Array,
) {
  if (!out) return;
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const buffer = out.ctx.createBuffer(1, samples.length, OUT_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i]! / 0x8000;

  const source = out.ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(out.node);
  // 前の音の終わりに継ぐ。now を毎回使うと、細かい塊が重なって濁る
  const at = Math.max(out.ctx.currentTime, out.playAt);
  source.start(at);
  out.playAt = at + buffer.duration;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** 音声の塊を取り出す（形が変わっても落ちないようにする）。 */
function readAudio(message: unknown): Uint8Array[] {
  if (!message || typeof message !== "object") return [];
  const content = (message as { serverContent?: Record<string, unknown> }).serverContent;
  const parts = (content?.modelTurn as { parts?: { inlineData?: { data?: string } }[] } | undefined)
    ?.parts;
  if (!parts) return [];
  return parts.flatMap((p) => (p.inlineData?.data ? [base64ToBytes(p.inlineData.data)] : []));
}

/** 字幕にする1行を取り出す。 */
function readTranscript(message: unknown): VoiceTurn | null {
  if (!message || typeof message !== "object") return null;
  const content = (message as { serverContent?: Record<string, unknown> }).serverContent;
  if (!content) return null;
  const output = content.outputTranscription as { text?: string } | undefined;
  if (output?.text) return { from: "client", text: output.text };
  const input = content.inputTranscription as { text?: string } | undefined;
  if (input?.text) return { from: "me", text: input.text };
  return null;
}
