"use client";

import { useCallback, useRef, useState } from "react";
import { DEFAULT_LIVE_TALK_MODEL, LIVE_TALK_MODELS } from "@/lib/ai/models";
import { getGeminiKey, getLiveModel } from "@/lib/profile";
import { base64ToBytes } from "@/lib/audio/wav";
import { startMicCapture, IN_RATE, type MicCapture } from "@/components/meeting/mic-capture";

/**
 * たいわ（scenario）の Live セッション — **声で話し、声で返る**。
 *
 * つなぎ方（設計03 §2 / AGENTS.md 規律4）:
 *   1. サーバの /api/live/token に短命トークンを取りに行く
 *   2. ブラウザが そのトークンだけで Live に直接つなぐ
 * APIキーはクライアントに渡らない。サーバは音声を中継しない。
 *
 * ## 以前は「話せない たいわ」だった
 * ここは長いあいだテキストだけを送る作りで、マイクも再生も持っていなかった。
 * 画面には「🎙️ 話しはじめる」と出るのに、話した声はどこにも送られず、
 * 相手の声も鳴らない。学習者から見ると**何をしても無反応**だった。
 * いまはマイクを開いて 16kHz PCM を送り、返る 24kHz を鳴らす
 *（音の決まりと理由は `src/components/meeting/mic-capture.ts` の冒頭）。
 *
 * ## ミーティング（use-live-voice）と分けてある理由
 * 唯一にして重要な違いは **マイクを断られても会話を続ける** こと。
 * たいわは書いて送る道が教材の正規ルートとして残っている（音が使えない教室・
 * 端末がある）ので、マイクが無いことを理由に接続そのものを止めない。
 * 低い層（PCM化・base64）は meeting のものをそのまま使い、再実装しない。
 * TODO: 2つの Live フックの共通部分を `src/lib/live/` に寄せる。
 *       meeting 側にも触る横断変更なので、専用タスクとして出す（AGENTS.md 多スレッド運用）。
 *
 * ## 判定にかける単位（lastUtterance）
 * 文字起こしは細切れで届く（「わたしは」「けんしょう」…）。届いたそばから
 * 判定すると「わたしは」だけで見られることになるので、**相手が話しはじめた合図で
 * 1つに束ねて**から渡す（use-live-voice と同じ約束）。
 *
 * キーが未登録のときは status="notReady" になり、画面は理由つきの案内に落ちる。
 */

export type LiveStatus = "idle" | "connecting" | "live" | "notReady" | "error";

export interface LiveTurn {
  readonly from: "client" | "me";
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

export interface LiveSession {
  readonly status: LiveStatus;
  /**
   * うまくいかなかった理由の名前（badKey / noPermission / modelNotFound /
   * rateLimited / upstream / noKey / connect）。画面に出す言い方は呼ぶ側が決める。
   *
   * ここを持たずに status だけ返していたころは、キーを入れた先生に
   * 「じゅんびちゅう」としか出せず、何を直せばよいか分からなかった。
   */
  readonly reason: string | null;
  /** 字幕（Q&A表示）。AIの誤判定を学習者が目で確認できるように残す。 */
  readonly transcript: readonly LiveTurn[];
  /**
   * 学習者が**言い終わった**ひとまとまり。要件ボードの判定はこれに対して行う。
   * `id` は同じ文をもう一度言ったときにも増える（判定をやり直せるように）。
   */
  readonly lastUtterance: { id: number; text: string } | null;
  /**
   * マイクが使えているか。false でも会話は続く（書いて送る道が残る）ので、
   * 画面は「声は使えないが、書けば進める」と伝えるために使う。
   */
  readonly voiceOn: boolean;
  /** `voice` は人物カードで決めた声（scenario の client.voice）。 */
  readonly connect: (systemInstruction: string, voice?: string) => Promise<void>;
  readonly disconnect: () => void;
  readonly send: (text: string) => void;
}

export function useLiveSession(): LiveSession {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<readonly LiveTurn[]>([]);
  const [lastUtterance, setLastUtterance] = useState<{ id: number; text: string } | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);

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
  const outRef = useRef<{ ctx: AudioContext; node: GainNode; playAt: number } | null>(null);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    micRef.current?.capture.stop();
    micRef.current?.stream.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    void outRef.current?.ctx.close();
    outRef.current = null;
    setVoiceOn(false);
    setStatus("idle");
    setReason(null);
  }, []);

  const connect = useCallback(async (systemInstruction: string, voice?: string) => {
    setStatus("connecting");
    setReason(null);
    setTranscript([]);
    setLastUtterance(null);
    setVoiceOn(false);
    heardRef.current = "";
    saidRef.current = "";

    const apiKey = getGeminiKey();
    if (!apiKey) {
      setStatus("notReady");
      setReason("noKey");
      return;
    }

    /*
     * 本人のキーはこの端末に保存されている（はじめの設定ウィザードで登録）。
     * サーバへ渡すのは交換のためだけで、Live には短命トークンしか出さない。
     *
     * 設定してあるモデル → 既定（新しいほう）の順にためす。Live の preview モデルは
     * **名前ごと入れ替わる**ので、前に選んだ名前が消えていることがある。1つで諦めると
     * 画面には「じゅんびちゅう」としか出ず、キーを疑い続けることになる（2026-08-06 実発生）。
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
        // トークンはこのモデルにだけ有効になるので、接続と同じ名前を渡す
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

    /*
     * マイクは**つなぐ前**に許可を取る。つないでから断られると、相手だけが話して
     * 学習者が答えられない状態で残る。
     * ただし**断られても止めない**——書いて送れば会話は成り立つ（劣化運転）。
     */
    let stream: MediaStream | null = null;
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
      stream = null;
    }

    try {
      // SDK は接続時にだけ要る。初期表示のバンドルに載せない。
      const { GoogleGenAI, Modality } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: payload.token, apiVersion: "v1beta" });

      // 再生側。24kHz で受けて、切れ目なく順に鳴らす
      const outCtx = new AudioContext({ sampleRate: OUT_RATE });
      // 自動再生の制限で止まったまま始まることがある。動かさないと1音も出ない
      if (outCtx.state === "suspended") await outCtx.resume();
      const node = outCtx.createGain();
      node.connect(outCtx.destination);
      outRef.current = { ctx: outCtx, node, playAt: 0 };

      const session = await ai.live.connect({
        model: payload.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          // 文字起こしを必ず出す。学習者が「何を言ったか」を目で確かめられるようにする。
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          /*
           * 声は**人物カードで決めたもの**を使う（scenario の client.voice）。
           * 決めていないときは Live の既定に任せる——ここで別の声を勝手に当てると、
           * まんがや ミーティングと 声が 違う人になる。
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
             * 文字起こしは**細切れで**届く。1つずつ字幕にすると読めないし、
             * 途中で判定すると言い終える前に見られることになる。だから:
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
                setTranscript((prev) => [...prev, { from: "me", text: heard }]);
                setLastUtterance({ id, text: heard });
              }
              saidRef.current += piece.text;
            }
            if (isTurnComplete(message) && saidRef.current.trim()) {
              const said = saidRef.current.trim();
              saidRef.current = "";
              setTranscript((prev) => [...prev, { from: "client", text: said }]);
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
       *（音声スレッドで動かすため。メインスレッドで作ると、画面が忙しいときに
       * 語の途中が丸ごと落ちて、何を言っても書き起こしが崩れる）。
       */
      if (stream) {
        const capture = await startMicCapture(stream, (pcm) => {
          sessionRef.current?.sendRealtimeInput({
            audio: {
              data: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
              mimeType: `audio/pcm;rate=${IN_RATE}`,
            },
          });
        });
        micRef.current = { capture, stream };
        setVoiceOn(true);
      }
    } catch {
      // 例外の中身は出さない。短命トークンが混ざりうるうえ、SDK の生メッセージは
      // 学習者にも先生にも読めない。理由の名前だけ渡す。
      stream?.getTracks().forEach((track) => track.stop());
      setStatus("error");
      setReason("connect");
    }
  }, []);

  /**
   * 書いて送る。**相手は声で返す**（Live は入力が文字でも音声で答える）。
   * マイクが無い・使いたくない学習者にも、同じ会話の体験を残すため。
   */
  const send = useCallback((text: string) => {
    const session = sessionRef.current;
    if (!session || !text.trim()) return;
    setTranscript((prev) => [...prev, { from: "me", text }]);
    session.sendClientContent({ turns: text, turnComplete: true });
  }, []);

  return { status, reason, transcript, lastUtterance, voiceOn, connect, disconnect, send };
}

/** 相手が話し終わったか（返事を1つに束ねる合図）。 */
function isTurnComplete(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const content = (message as { serverContent?: { turnComplete?: unknown } }).serverContent;
  return content?.turnComplete === true;
}

/** 返ってきた24kHzのPCMを、切れ目なく順に鳴らす。 */
function play(out: { ctx: AudioContext; node: GainNode; playAt: number } | null, pcm: Uint8Array) {
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

/** Live のメッセージから字幕にする1行を取り出す（形が変わっても落ちないようにする）。 */
function readTranscript(message: unknown): LiveTurn | null {
  if (!message || typeof message !== "object") return null;
  const content = (message as { serverContent?: Record<string, unknown> }).serverContent;
  if (!content) return null;

  const output = content.outputTranscription as { text?: string } | undefined;
  if (output?.text) return { from: "client", text: output.text };

  const input = content.inputTranscription as { text?: string } | undefined;
  if (input?.text) return { from: "me", text: input.text };

  return null;
}
