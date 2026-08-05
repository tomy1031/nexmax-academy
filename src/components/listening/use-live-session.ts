"use client";

import { useCallback, useRef, useState } from "react";
import { getGeminiKey } from "@/lib/profile";

/**
 * Gemini Live との対話セッション。
 *
 * つなぎ方（設計03 §2 / AGENTS.md 規律4）:
 *   1. サーバの /api/live/token に短命トークンを取りに行く
 *   2. ブラウザが そのトークンだけで Live に直接つなぐ
 * APIキーはクライアントに渡らない。サーバは音声を中継しない。
 *
 * キーが未登録のときは
 * status="notReady" になり、画面は「じゅんびちゅう」に落ちる。
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

export interface LiveSession {
  readonly status: LiveStatus;
  /** 字幕（Q&A表示）。AIの誤判定を学習者が目で確認できるように残す。 */
  readonly transcript: readonly LiveTurn[];
  readonly connect: (systemInstruction: string) => Promise<void>;
  readonly disconnect: () => void;
  readonly send: (text: string) => void;
}

export function useLiveSession(): LiveSession {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [transcript, setTranscript] = useState<readonly LiveTurn[]>([]);
  const sessionRef = useRef<{
    sendClientContent: (input: unknown) => void;
    close: () => void;
  } | null>(null);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setStatus("idle");
  }, []);

  const connect = useCallback(async (systemInstruction: string) => {
    setStatus("connecting");

    // 本人のキーはこの端末に保存されている（はじめの設定ウィザードで登録）。
    // サーバへ渡すのは交換のためだけで、Live には短命トークンしか出さない。
    const response = await fetch("/api/live/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: getGeminiKey() }),
    });
    const payload = (await response.json()) as TokenResponse;
    if (!payload.ready || !payload.token || !payload.model) {
      setStatus("notReady");
      return;
    }

    try {
      // SDK は接続時にだけ要る。初期表示のバンドルに載せない。
      const { GoogleGenAI, Modality } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: payload.token, apiVersion: "v1beta" });

      const session = await ai.live.connect({
        model: payload.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          // 文字起こしを必ず出す。学習者が「何を言ったか」を目で確かめられるようにする。
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => setStatus("live"),
          onmessage: (message: unknown) => {
            const turn = readTranscript(message);
            if (turn) setTranscript((prev) => [...prev, turn]);
          },
          onerror: () => setStatus("error"),
          onclose: () => setStatus("idle"),
        },
      });

      sessionRef.current = session as unknown as {
        sendClientContent: (input: unknown) => void;
        close: () => void;
      };
    } catch {
      setStatus("error");
    }
  }, []);

  const send = useCallback((text: string) => {
    const session = sessionRef.current;
    if (!session || !text.trim()) return;
    setTranscript((prev) => [...prev, { from: "me", text }]);
    session.sendClientContent({ turns: text, turnComplete: true });
  }, []);

  return { status, transcript, connect, disconnect, send };
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
