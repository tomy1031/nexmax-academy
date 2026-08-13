import { NextResponse } from "next/server";
import { TEXT_MODEL } from "@/lib/ai/models";
import {
  buildJudgePrompt,
  isKanaOnly,
  JUDGE_RESPONSE_SCHEMA,
  parseJudge,
  type JudgeContext,
  type JudgeResult,
} from "@/lib/meeting/judge";

/**
 * ミーティングの返事を見てもらう（学習者が使う・BYOK）
 *
 * POST { apiKey, ...context } → { ready: true, judge } / { ready: false, reason }
 *
 * キーは本人のもの。ここで受け取って Gemini を呼ぶだけで、**キーも上流の応答本文も
 * クライアントには返さない**（/api/live/token・/api/studio/vocab と同じ流儀。規律4）。
 *
 * ## かなだけで返ってくるまで、1回だけ言い直させる
 * 動的に作った文にはふりがなを合成できない（読み辞書は教材データが持つ）。
 * 漢字が1つ混ざると、そこで学習者が止まる。構造化出力でも「漢字を使うな」は
 * ときどき破られるので、**サーバで検査 → 1回だけ言い直し → それでも駄目なら
 * ready:false**。画面はそのとき規則ベース（japanese-check.ts）へ落ちる。
 * 会話は止めない——止まると、いちばん助けが要る学習者だけが終われなくなる。
 */

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`;

/** 上流を待つ上限。会話の途中なので、長く待たせるより落ちたほうがよい。 */
const TIMEOUT_MS = 12_000;

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ready: false, reason }, { status });
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("invalidJson", 400);
  }

  const apiKey = text(body.apiKey, 200);
  // キーが無い＝まだ設定していない。画面は規則ベースの助言に落ちる
  if (!apiKey) return fail("noKey", 503);

  const utterance = text(body.utterance, 600);
  if (!utterance) return fail("noUtterance", 400);

  const attemptRaw = typeof body.attempt === "number" ? Math.floor(body.attempt) : 1;
  const context: JudgeContext = {
    ask: text(body.ask, 400),
    hint: text(body.hint, 200),
    keywords: Array.isArray(body.keywords)
      ? body.keywords.flatMap((k) => (typeof k === "string" ? [k.slice(0, 40)] : [])).slice(0, 12)
      : [],
    judgePrompt: text(body.judgePrompt, 2000),
    hostName: text(body.hostName, 40) || "せんぱい",
    learnerName: text(body.learnerName, 40),
    utterance,
    attempt: Math.min(Math.max(attemptRaw, 1), 9),
  };

  let judge: JudgeResult | null = null;
  try {
    judge = await askOnce(apiKey, context, false);
    // 漢字が混ざっていたら、混ざっていたことを伝えてもう一度だけ頼む
    if (judge && !isKanaOnly(judge)) judge = await askOnce(apiKey, context, true);
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 502;
    return fail(e instanceof UpstreamError ? e.reason : "network", status);
  }

  if (!judge) return fail("badShape", 502);
  if (!isKanaOnly(judge)) return fail("kanaRetryFailed", 502);

  return NextResponse.json({ ready: true, model: TEXT_MODEL, judge });
}

class UpstreamError extends Error {
  constructor(
    readonly reason: string,
    readonly status: number,
  ) {
    super(reason);
    this.name = "UpstreamError";
  }
}

async function askOnce(
  apiKey: string,
  context: JudgeContext,
  kanaRetry: boolean,
): Promise<JudgeResult | null> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildJudgePrompt(context, kanaRetry) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        // 「JSONで返して」と頼むだけにしない（設計01 P12: プロンプト頼みにしない）
        responseSchema: JUDGE_RESPONSE_SCHEMA,
        // 学習者の言ったことに寄せたいので、思いつきは抑える
        temperature: 0.4,
      },
    }),
  });

  if (!response.ok) {
    // 応答本文にはキーが混ざりうるので、そのまま外へ出さない
    throw new UpstreamError(response.status === 429 ? "quota" : "upstream", response.status);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!raw) return null;

  try {
    return parseJudge(JSON.parse(raw), context.attempt);
  } catch {
    return null;
  }
}
