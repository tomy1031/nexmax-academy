"use client";

import { generateFromBrowser } from "@/lib/ai/generate-browser";
import { TEXT_MODEL } from "@/lib/ai/models";
import { getGeminiKey } from "@/lib/profile";
import {
  buildJudgePrompt,
  isKanaOnly,
  JUDGE_RESPONSE_SCHEMA,
  parseJudge,
  type JudgeContext,
  type JudgeResult,
} from "@/lib/meeting/judge";

/**
 * 判定APIの呼び出し（ブラウザ側）。
 *
 * キーは本人のもの（BYOK）で端末に保存されている。**サーバには渡さない**——
 * この端末から Google へ直接聞く（2026-08-17）。うちの Worker は香港で動くことが
 * あり、そこを通すと Google に断られるうえ、キーが香港で復号されるため。
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
  return await judgeFromBrowser(apiKey, request);
}

/**
 * この端末から Google に直接聞く。
 *
 * ## かなだけで返ってくるまで、1回だけ言い直させる
 * 動的に作った文にはふりがなを合成できない（読み辞書は教材データが持つ）。
 * 漢字が1つ混ざると、そこで学習者が止まる。構造化出力でも「漢字を使うな」は
 * ときどき破られるので、**検査 → 1回だけ言い直し → それでも駄目なら ok:false**。
 * 画面はそのとき規則ベース（japanese-check.ts）へ落ちる。会話は止めない。
 */
async function judgeFromBrowser(apiKey: string, request: JudgeRequest): Promise<JudgeApiResult> {
  const context: JudgeContext = { ...request, attempt: Math.min(Math.max(request.attempt, 1), 9) };

  const ask = async (kanaRetry: boolean): Promise<JudgeResult | null> => {
    const result = await generateFromBrowser({
      apiKey,
      model: TEXT_MODEL,
      prompt: buildJudgePrompt(context, kanaRetry),
      schema: JUDGE_RESPONSE_SCHEMA,
      // 学習者の言ったことに寄せたいので、思いつきは抑える（route と同じ）
      temperature: 0.4,
    });
    if (!result.ok || !result.text) return null;
    try {
      return parseJudge(JSON.parse(result.text), context.attempt);
    } catch {
      return null;
    }
  };

  let judge = await ask(false);
  // 漢字が混ざっていたら、混ざっていたことを伝えてもう一度だけ頼む（route と同じ）
  if (judge && !isKanaOnly(judge)) judge = await ask(true);
  if (!judge) return { ok: false, reason: "badShape" };
  if (!isKanaOnly(judge)) return { ok: false, reason: "kanaRetryFailed" };
  return { ok: true, judge, model: TEXT_MODEL };
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
