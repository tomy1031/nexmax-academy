import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/studio/content/route";
import { TEXT_MODEL } from "@/lib/ai/models";
import { classifyUpstreamResponse } from "@/lib/ai/upstream-error";
import {
  buildVocabPrompt,
  parseVocabCandidates,
  VOCAB_RESPONSE_SCHEMA,
  type VocabCandidate,
} from "@/lib/vocab/extract";

/**
 * ステージの本文から、単語ステージにできそうなことばを抜き出す（管理者専用）。
 *
 * POST { apiKey, texts: string[] } → { ready: true, words }
 *
 * キーは先生本人のもの（BYOK）。はじめの設定ウィザードで登録され、その端末に
 * 保存されている。ここでは受け取ったキーで Gemini を呼ぶだけで、
 * **キーも上流の応答本文もクライアントには返さない**（/api/live/token と同じ流儀。
 * AGENTS.md 規律4）。失敗の中身にはキーが混ざりうるので、理由の名前だけを返す。
 *
 * 判断（どれがビジネス語か・N4を超えるか）は意味の判断なのでAIに任せるが、
 * **返す前に必ず wordSchema を通す**。通らないものは捨てる（extract.ts）。
 * 壊れた候補を画面に出すと、先生が選んだあとの保存で初めて落ちて、
 * 落ちた理由が見えないまま選び直しをくり返すことになる。
 */

/** 使うモデル。名前は1か所にまとめてある（src/lib/ai/models.ts）。 */
const VOCAB_MODEL = TEXT_MODEL;

const GENERATE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${VOCAB_MODEL}:generateContent`;

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ready: false, reason }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { apiKey?: unknown; texts?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("invalidJson", 400);
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  // キーが無い＝まだ設定していない。画面は「じゅんびちゅう」に落ちる（/api/live/token と同じ）
  if (!apiKey) return fail("noKey", 503);

  const texts = Array.isArray(body.texts)
    ? body.texts.filter((text): text is string => typeof text === "string" && text.trim() !== "")
    : [];
  // 本文がまだ1文字も無いステージ。AIに聞いても出しようがないので、呼ばずに返す
  if (texts.length === 0) return fail("noText", 400);

  let words: VocabCandidate[];
  try {
    words = await extractWords({ apiKey, texts });
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 502;
    return fail(e instanceof UpstreamError ? e.reason : "upstream", status);
  }

  return NextResponse.json({ ready: true, model: VOCAB_MODEL, words });
}

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** 上流が付けた名前（`locationNotSupported` など）。画面が逃げ道を選ぶのに要る。 */
    readonly reason: string = "upstream",
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

async function extractWords({
  apiKey,
  texts,
}: {
  apiKey: string;
  texts: string[];
}): Promise<VocabCandidate[]> {
  const response = await fetch(GENERATE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildVocabPrompt(texts) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        // 「JSONで返して」と頼むだけにしない（設計01 P12: プロンプト頼みにしない）
        responseSchema: VOCAB_RESPONSE_SCHEMA,
        // 教材づくりなので、思いつきよりも本文に忠実な方を採る
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    /*
     * 応答本文にキーが混ざる可能性があるので、そのまま外へ出さない。名前（記号）だけ読む——
     * うちの Worker は香港で動くことがあり、Google は香港を対象地域に入れていない。
     * ここを `upstream` で潰すと、画面はブラウザから直接ためす手に気づけない（2026-08-17）。
     */
    const { reason } = await classifyUpstreamResponse(response);
    throw new UpstreamError(
      "ことばの抜き出しに失敗しました",
      response.status,
      reason ?? "upstream",
    );
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const raw = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  return parseVocabCandidates(raw);
}
