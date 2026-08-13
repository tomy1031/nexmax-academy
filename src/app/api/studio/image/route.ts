import { Buffer } from "node:buffer";
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

/**
 * 参照画像の枚数の上限。
 * Worker の1呼び出しあたりの外部サブリクエストは50本までなので、
 * 取りに行く枚数は少なく抑える（人物は多くても数人）。
 */
const MAX_REFS = 4;

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ready: false, reason }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { apiKey?: unknown; prompt?: unknown; references?: unknown };
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

  /**
   * 参照画像（キャラクターシートなど）。**コマ間で顔や服が変わらない**ようにする
   * いちばん確実な方法が、これを毎回渡すことである（プロンプトで容姿を書き直すより効く）。
   * URL だけ受け取り、サーバが取りに行く——クライアントから巨大な base64 を
   * 送らせると、Worker の受け口の上限に当たる。
   */
  const references = Array.isArray(body.references)
    ? body.references.filter((url): url is string => typeof url === "string").slice(0, MAX_REFS)
    : [];

  let image: { mimeType: string; data: string } | null;
  try {
    image = await generateImage({ apiKey, prompt, references });
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
  references,
}: {
  apiKey: string;
  prompt: string;
  references: readonly string[];
}): Promise<{ mimeType: string; data: string } | null> {
  const refParts = await Promise.all(references.map((url) => fetchInline(url)));
  const parts = [
    // 参照画像を先に置く。あとに置くと、モデルが指示より画像を弱く扱うことがある
    ...refParts.flatMap((part) => (part ? [part] : [])),
    { text: prompt },
  ];

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
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

/** 参照画像を1枚取ってきて、そのまま渡せる形にする。取れなければ黙って落とす。 */
async function fetchInline(
  url: string,
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type") ?? "image/png";
    if (!mimeType.startsWith("image/")) return null;
    // 1文字ずつの文字列連結は 1.7MB の参照画像で数MBの中間文字列を生む
    //（参照4枚で 128MB のメモリ上限に迫る）。Buffer で一発変換する。
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
    return { inlineData: { mimeType, data } };
  } catch {
    // 参照画像が1枚取れなくても生成そのものは続ける（絵は出る）
    return null;
  }
}
