"use client";

import { useCallback, useRef, useState } from "react";
import { DEFAULT_LIVE_TALK_MODEL } from "@/lib/ai/models";
import { getGeminiKey, getLiveModel } from "@/lib/profile";
import { base64ToBytes } from "@/lib/audio/wav";

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

/** 送る音声のサンプリングレート（Live API の決まり）。 */
const IN_RATE = 16_000;
/** 返る音声のサンプリングレート（同上）。 */
const OUT_RATE = 24_000;
/** 1回に送る長さ。短すぎると通信が増え、長すぎると返事が遅れる。 */
const CHUNK = 2048;

export interface LiveVoice {
  readonly status: VoiceStatus;
  readonly reason: string | null;
  /** 字幕。AIの聞き取り違いを学習者が目で確かめられるように残す。 */
  readonly turns: readonly VoiceTurn[];
  /** 口パクを動かすための解析器（再生の手前）。 */
  readonly analyser: AnalyserNode | null;
  readonly start: (systemInstruction: string) => Promise<void>;
  readonly stop: () => void;
  /** 声が使えないときの補い。テキストで送る。 */
  readonly sendText: (text: string) => void;
}

export function useLiveVoice(): LiveVoice {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [turns, setTurns] = useState<readonly VoiceTurn[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const sessionRef = useRef<{
    sendRealtimeInput: (input: unknown) => void;
    sendClientContent: (input: unknown) => void;
    close: () => void;
  } | null>(null);
  const micRef = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null);
  const outRef = useRef<{ ctx: AudioContext; node: AnalyserNode; playAt: number } | null>(null);

  const stop = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    micRef.current?.stream.getTracks().forEach((t) => t.stop());
    void micRef.current?.ctx.close();
    micRef.current = null;
    void outRef.current?.ctx.close();
    outRef.current = null;
    setAnalyser(null);
    setStatus("idle");
  }, []);

  const start = useCallback(async (systemInstruction: string) => {
    setStatus("connecting");
    setReason(null);
    setTurns([]);

    const apiKey = getGeminiKey();
    if (!apiKey) {
      setStatus("notReady");
      setReason("noKey");
      return;
    }

    const response = await fetch("/api/live/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, model: getLiveModel() || DEFAULT_LIVE_TALK_MODEL }),
    });
    const payload = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!payload.ready || !payload.token || !payload.model) {
      setStatus("notReady");
      setReason(payload.reason ?? "upstream");
      return;
    }

    // マイクは**つなぐ前**に許可を取る。つないでから断られると、
    // 相手だけが話して学習者が答えられない状態で残る
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
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
        },
        callbacks: {
          onopen: () => setStatus("live"),
          onmessage: (message: unknown) => {
            const turn = readTranscript(message);
            if (turn) setTurns((prev) => [...prev, turn]);
            for (const pcm of readAudio(message)) play(outRef.current, pcm);
          },
          onerror: () => setStatus("error"),
          onclose: () => setStatus("idle"),
        },
      });
      sessionRef.current = session as unknown as NonNullable<typeof sessionRef.current>;

      // マイク → 16kHz PCM → 送信
      const inCtx = new AudioContext({ sampleRate: IN_RATE });
      const source = inCtx.createMediaStreamSource(stream);
      const pump = inCtx.createScriptProcessor(CHUNK, 1, 1);
      pump.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i += 1) {
          const clamped = Math.max(-1, Math.min(1, input[i]!));
          pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        }
        sessionRef.current?.sendRealtimeInput({
          audio: {
            data: bytesToBase64(new Uint8Array(pcm.buffer)),
            mimeType: `audio/pcm;rate=${IN_RATE}`,
          },
        });
      };
      source.connect(pump);
      // ScriptProcessor は出力へつながないと動かない。音は出さないので無音へ落とす
      const mute = inCtx.createGain();
      mute.gain.value = 0;
      pump.connect(mute);
      mute.connect(inCtx.destination);
      micRef.current = { ctx: inCtx, stream };
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setStatus("error");
      setReason("connect");
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    setTurns((prev) => [...prev, { from: "me", text }]);
    sessionRef.current?.sendClientContent({ turns: text, turnComplete: true });
  }, []);

  return { status, reason, turns, analyser, start, stop, sendText };
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
