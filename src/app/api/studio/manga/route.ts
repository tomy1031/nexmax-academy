import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/studio/content/route";
import { TEXT_MODEL } from "@/lib/ai/models";
import { classifyUpstreamResponse } from "@/lib/ai/upstream-error";
import { buildMangaScriptPrompt, MANGA_SCRIPT_SCHEMA } from "@/lib/manga-prompt";

/**
 * 一言の依頼から、まんがの コマ割りと セリフを作る（管理者専用）。
 *
 * POST { apiKey, request, cast, panels } → { ready: true, script }
 *
 * **絵はここで作らない。** 文字（コマ割り・セリフ・読み辞書）だけを返し、
 * 絵はコマごとに /api/studio/image で描く。1枚に4コマ描かせるとコマ順と
 * レイアウトが制御できず、読み順が崩れる報告が多いためである（調査 2026-08-06）。
 *
 * キーは先生本人のもの（BYOK）。キーも上流の応答本文もクライアントには返さない
 *（AGENTS.md 規律4）。
 *
 * 返す前にこちらで形を確かめる。壊れた下書きを画面に出すと、
 * 先生が直したあとの保存で初めて落ちて、落ちた理由が見えない。
 */

const GENERATE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`;

/** 一度に作れるコマ数。多いと1回の応答が長くなり、途中で切れる。 */
const MAX_PANELS = 8;

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ready: false, reason }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { apiKey?: unknown; request?: unknown; cast?: unknown; panels?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("invalidJson", 400);
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return fail("noKey", 503);

  const ask = typeof body.request === "string" ? body.request.trim() : "";
  if (ask.length === 0 || ask.length > 1000) return fail("invalidRequest", 400);

  const panels =
    typeof body.panels === "number" && body.panels >= 1 && body.panels <= MAX_PANELS
      ? Math.floor(body.panels)
      : 4;

  const cast = Array.isArray(body.cast)
    ? body.cast.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const { id, name, role, personality } = item as Record<string, unknown>;
        if (typeof id !== "string" || typeof name !== "string" || typeof role !== "string") {
          return [];
        }
        return [
          {
            id,
            name,
            role,
            personality: typeof personality === "string" ? personality : undefined,
          },
        ];
      })
    : [];

  let script: unknown;
  try {
    script = await generateScript({
      apiKey,
      prompt: buildMangaScriptPrompt({ request: ask, cast, panels }),
    });
  } catch (e) {
    return fail(
      e instanceof UpstreamError ? e.reason : "upstream",
      e instanceof UpstreamError ? e.status : 502,
    );
  }
  if (!script) return fail("badResponse", 502);

  return NextResponse.json({ ready: true, model: TEXT_MODEL, script });
}

class UpstreamError extends Error {
  constructor(
    readonly status: number,
    /** 上流が付けた名前（`locationNotSupported` など）。画面が逃げ道を選ぶのに要る。 */
    readonly reason: string = "upstream",
  ) {
    super(reason);
    this.name = "UpstreamError";
  }
}

async function generateScript({
  apiKey,
  prompt,
}: {
  apiKey: string;
  prompt: string;
}): Promise<unknown> {
  const response = await fetch(GENERATE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        // 「JSONで返して」と頼むだけにしない（設計01 P12: プロンプト頼みにしない）
        responseSchema: MANGA_SCRIPT_SCHEMA,
        // 教材づくりなので、思いつきより依頼に忠実な方を採る
        temperature: 0.4,
      },
    }),
  });

  if (!response.ok) {
    /*
     * 応答本文にキーが混ざる可能性があるので、そのまま外へ出さない。名前（記号）だけ読む——
     * うちの Worker は香港で動くことがあり、Google は香港を対象地域に入れていない（2026-08-17）。
     */
    const { reason } = await classifyUpstreamResponse(response);
    throw new UpstreamError(response.status, reason ?? "upstream");
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (raw.length === 0) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
