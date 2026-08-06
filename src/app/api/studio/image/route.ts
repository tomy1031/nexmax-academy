import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/studio/content/route";
import { DEFAULT_IMAGE_MODEL } from "@/lib/ai/models";

/**
 * エリアの絵を1枚つくる（管理者専用）。
 *
 * POST { apiKey, prompt } → { ready: true, mimeType, data }（data は base64）
 *
 * キーは先生本人のもの（BYOK）。はじめの設定ウィザードで登録され、その端末に
 * 保存されている。ここでは受け取ったキーで Gemini を呼ぶだけで、
 * **キーも上流の応答本文もクライアントには返さない**（/api/live/token・/api/studio/vocab と
 * 同じ流儀。AGENTS.md 規律4）。失敗の中身にはキーが混ざりうるので、理由の名前だけを返す。
 *
 * 画像そのもの（base64）は返す。返さずに Storage へ直接上げる手もあるが、
 * それだとサーバが service_role を持つことになる。アップロードは今までどおり
 * ブラウザから RLS 越しに行い、ここは生成だけを受け持つ。
 */

/** 画像生成のモデル。名前は1か所にまとめてある（src/lib/ai/models.ts）。 */
const IMAGE_MODEL = DEFAULT_IMAGE_MODEL;

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;

/** 受け取るプロンプトの上限。長すぎるものは上流に投げる前に落とす。 */
const MAX_PROMPT = 4000;

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ready: false, reason }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { apiKey?: unknown; prompt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("invalidJson", 400);
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  // キーが無い＝まだ設定していない。画面は「じゅんびちゅう」に落ちる
  if (!apiKey) return fail("noKey", 503);

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length === 0 || prompt.length > MAX_PROMPT) return fail("invalidPrompt", 400);

  let image: { mimeType: string; data: string } | null;
  try {
    image = await generateImage({ apiKey, prompt });
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 502;
    return fail("upstream", status);
  }
  // モデルが文字だけ返すことがある（安全ブロックなど）。画面には理由の名前だけ渡す。
  if (!image) return fail("noImage", 502);

  return NextResponse.json({ ready: true, model: IMAGE_MODEL, ...image });
}

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

async function generateImage({
  apiKey,
  prompt,
}: {
  apiKey: string;
  prompt: string;
}): Promise<{ mimeType: string; data: string } | null> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    // 応答本文にキーが混ざる可能性があるので、そのまま外へ出さない
    throw new UpstreamError("絵の生成に失敗しました", response.status);
  }

  const data = (await response.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
    }[];
  };
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inlineData;
    if (inline?.data) return { mimeType: inline.mimeType ?? "image/png", data: inline.data };
  }
  return null;
}
