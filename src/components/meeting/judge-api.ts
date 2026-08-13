"use client";

import { getGeminiKey } from "@/lib/profile";
import type { JudgeResult } from "@/lib/meeting/judge";

/**
 * 判定APIの呼び出し（ブラウザ側）。
 *
 * キーは本人のもの（BYOK）で端末に保存されている。ここで載せて送り、
 * サーバは受け取って Gemini を呼ぶだけ——キーも上流の応答も返ってこない。
 *
 * 失敗は**理由の名前**で返す。「だめでした」しか出ないと、キーを入れた学習者は
 * 自分のキーを疑い続けることになる（2026-08-06 に実際に起きた）。
 */

export interface JudgeRequest {
  ask: string;
  hint: string;
  keywords: readonly string[];
  judgePrompt: string;
  hostName: string;
  learnerName: string;
  utterance: string;
  attempt: number;
}

export type JudgeApiResult =
  { ok: true; judge: JudgeResult; model: string } | { ok: false; reason: string };

export async function requestJudge(request: JudgeRequest): Promise<JudgeApiResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) return { ok: false, reason: "noKey" };

  let response: Response;
  try {
    response = await fetch("/api/meeting/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, ...request }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  const body = (await response.json().catch(() => ({}))) as {
    ready?: boolean;
    judge?: JudgeResult;
    model?: string;
    reason?: string;
  };
  if (!response.ok || !body.ready || !body.judge) {
    return { ok: false, reason: body.reason ?? "upstream" };
  }
  return { ok: true, judge: body.judge, model: body.model ?? "" };
}

/** 失敗の理由 → 学習者に見せる一言（責めない・次の行動を書く）。 */
export function judgeFailNote(reason: string): string {
  switch (reason) {
    case "noKey":
      return "AIの せっていが まだです。じぶんで こたえを かいて すすめられます。";
    case "quota":
      return "AIが いま こんで います。すこし まってから もう いちど おねがいします。";
    case "network":
      return "つうしんが うまく いきませんでした。もう いちど おねがいします。";
    default:
      return "AIの みかたは いま つかえません。かいた こたえは そのまま すすめられます。";
  }
}
