import { NextResponse } from "next/server";
import { TEXT_MODEL } from "@/lib/ai/models";
import {
  buildReqJudgePrompt,
  parseReqJudge,
  reqJudgeResponseSchema,
  type JudgeableReq,
} from "@/components/listening/req-matcher";

/**
 * たいわ（scenario）の発話が、要件ボードのどの項目を引き出したかを見てもらう
 *
 * POST { apiKey, utterance, reqs[] } → { ready: true, reqId: string|null } / { ready: false, reason }
 *
 * キーは本人のもの（BYOK）。ここで受け取って Gemini を呼ぶだけで、**キーも上流の
 * 応答本文もクライアントには返さない**（/api/meeting/judge・/api/live/token と同じ流儀。規律4）。
 *
 * ## 返すのは「どの項目か」だけ
 * 学習者が読む文はここで作らない。相手役（Live）が会話を続け、画面が
 * ボードとフィードバックを出す——AIに直接ほめ言葉を書かせると、
 * その場で作った漢字に ふりがなを付けられず、そこで学習者が止まる（設計01 P12）。
 *
 * ## 落ちても教材は止まらない
 * キーが無ければ `noKey`、上流が駄目なら `upstream`/`quota` を返し、
 * 画面はローカルのキーワード判定だけで静かに続ける（判定3層の層2）。
 * ここが 500 を投げても、会話は1つも止まらないのが正しい状態。
 *
 * 判定の材料（指示文・responseSchema・読み取り）は
 * `src/components/listening/req-matcher.ts` が持つ。層1と層2を1か所に置いて、
 * 単体テストで両方を固定するため（サーバは呼び出しの都合だけを持つ）。
 */

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`;

/** 上流を待つ上限。会話の途中なので、長く待たせるより落ちたほうがよい。 */
const TIMEOUT_MS = 8_000;

/** 一度に見る項目の上限（scenario の reqs は10個）。 */
const MAX_REQS = 12;

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ready: false, reason }, { status });
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

/** 受け取った項目を、判定に要る4つだけに切り詰める（余計な物を上流へ渡さない）。 */
function readReqs(value: unknown): JudgeableReq[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const id = text(item.id, 20);
      const label = text(item.label, 80);
      if (!id || !label) return [];
      return [
        {
          id,
          label,
          fact: text(item.fact, 300),
          keywords: Array.isArray(item.keywords)
            ? item.keywords
                .flatMap((k) => (typeof k === "string" ? [k.slice(0, 40)] : []))
                .slice(0, 16)
            : [],
        } satisfies JudgeableReq,
      ];
    })
    .slice(0, MAX_REQS);
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("invalidJson", 400);
  }

  const apiKey = text(body.apiKey, 200);
  // キーが無い＝まだ設定していない。画面はローカル判定だけで続く
  if (!apiKey) return fail("noKey", 503);

  const utterance = text(body.utterance, 600);
  if (!utterance) return fail("noUtterance", 400);

  const reqs = readReqs(body.reqs);
  if (reqs.length === 0) return fail("noReqs", 400);

  try {
    return NextResponse.json({
      ready: true,
      model: TEXT_MODEL,
      reqId: await askOnce(apiKey, utterance, reqs),
    });
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 502;
    return fail(e instanceof UpstreamError ? e.reason : "network", status);
  }
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
  utterance: string,
  reqs: readonly JudgeableReq[],
): Promise<string | null> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildReqJudgePrompt(utterance, reqs) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        // 「JSONで返して」と頼むだけにしない（設計01 P12: プロンプト頼みにしない）
        responseSchema: reqJudgeResponseSchema(reqs),
        // 選ぶのは id ひとつ。思いつきは要らない
        temperature: 0,
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
    return parseReqJudge(JSON.parse(raw), reqs);
  } catch {
    return null;
  }
}
