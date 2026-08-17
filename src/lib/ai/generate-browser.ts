import { readUpstreamCode, reasonFromCode } from "@/lib/ai/upstream-error";

/**
 * ブラウザから Gemini の generateContent を直接たたく（サーバの逃げ道）
 *
 * ## なぜ要るか（2026-08-17）
 * うちの Worker を さばく Cloudflare の 場所は **香港（HKG）**で、Google の Gemini API は
 * 香港を 対応地域に 入れていない。サーバ経由の 呼び出しは
 * `400 FAILED_PRECONDITION / User location is not supported` で 必ず 落ちる。
 * **先生・学習者の 端末は 日本・カンボジアで、どちらも 対応地域**なので、
 * ブラウザから 直接 呼べば 通る。
 *
 * どの colo に 入るかは 選べない（訪問者の 近くで 動く 仕組み）ので、
 * **サーバを 先に ためして、場所で 断られたときだけ ここへ 落ちる**形にする。
 * サーバが 通る 土地（現地の プノンペン・シンガポール など）では 従来どおり。
 *
 * キーは もともと その端末に ある（BYOK）。ここで 新しく 配るものは 無い。
 * 出典: https://ai.google.dev/gemini-api/docs/available-regions
 */

export type BrowserGenerateResult = { ok: true; text: string } | { ok: false; reason: string };

export type BrowserImageResult =
  { ok: true; mimeType: string; data: string } | { ok: false; reason: string };

/** サーバが「場所で 断られた」と言ったか。ブラウザで やり直す 合図。 */
export function isLocationBlocked(reason: string | null | undefined): boolean {
  return reason === "locationNotSupported";
}

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/** 名前が読めなかったときだけ使う、HTTP番号からの当て推量。 */
function fallbackReason(status: number): string {
  if (status === 429) return "quota";
  if (status === 401 || status === 403) return "noPermission";
  if (status === 404) return "modelNotFound";
  // 503 は Google 側の 混雑（UNAVAILABLE）。使いすぎ（429）と 混ぜない——
  // 学習者に 言う ことも、次の 一手も 違う
  if (status === 503) return "overloaded";
  return "upstream";
}

/**
 * 混んでいるとき（503 / UNAVAILABLE）だけ、1回だけ 待って やり直す
 *
 * 2026-08-17 の 本番確認で、同じ 問いを 3回 投げて 2回 503 が 返った。Google 側の
 * 一時的な 混雑で、少し 待つと 通る。会話の 途中で 使う 判定なので、
 * **長く 粘らない**（待たせるより 落ちて、規則ベースの 受け止めに 回すほうがよい）。
 * 使いすぎ（429）は やり直しても 悪化するだけなので 対象に しない。
 */
const RETRY_WAIT_MS = 700;

async function sendWithRetry(request: () => Promise<Response>): Promise<Response> {
  const first = await request();
  if (first.status !== 503) return first;
  await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
  return await request();
}

/**
 * 1回だけ聞く。返事の本文（テキスト）をそのまま返し、**解釈は呼ぶ側**に任せる
 * （サーバ側の route と同じ分担にして、二重に育たないようにする）。
 */
export async function generateFromBrowser({
  apiKey,
  model,
  prompt,
  schema,
  temperature = 0,
  timeoutMs = 12_000,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  schema?: unknown;
  temperature?: number;
  timeoutMs?: number;
}): Promise<BrowserGenerateResult> {
  let response: Response;
  try {
    response = await sendWithRetry(() =>
      fetch(endpointFor(model), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
            temperature,
          },
        }),
      }),
    );
  } catch {
    // 時間切れ・CORS・回線。どれも「つながらなかった」で同じ手当てになる
    return { ok: false, reason: "network" };
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      reason: reasonFromCode(readUpstreamCode(data)) ?? fallbackReason(response.status),
    };
  }

  const parts =
    (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null)
      ?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return { ok: true, text };
}

/**
 * 参照画像を base64 にする。1文字ずつ足すと 1.7MB の絵で中間文字列が数MBになるので、
 * 小分けにして `btoa` に渡す（サーバ側 route が Buffer でやっているのと同じ理由）。
 */
async function inlineReference(
  url: string,
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type") ?? "image/png";
    if (!mimeType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return { inlineData: { mimeType, data: btoa(binary) } };
  } catch {
    // 参照が1枚取れなくても生成そのものは続ける（route と同じ）
    return null;
  }
}

/** ブラウザから絵をつくる。サーバが場所で断られたときの逃げ道。 */
export async function generateImageFromBrowser({
  apiKey,
  model,
  prompt,
  references = [],
  timeoutMs = 120_000,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  references?: readonly string[];
  timeoutMs?: number;
}): Promise<BrowserImageResult> {
  const refParts = await Promise.all(references.map((url) => inlineReference(url)));
  const parts = [
    ...refParts.filter((part): part is { inlineData: { mimeType: string; data: string } } =>
      Boolean(part),
    ),
    { text: prompt },
  ];

  let response: Response;
  try {
    response = await sendWithRetry(() =>
      fetch(endpointFor(model), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      }),
    );
  } catch {
    return { ok: false, reason: "network" };
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      reason: reasonFromCode(readUpstreamCode(data)) ?? fallbackReason(response.status),
    };
  }

  const candidates =
    (
      data as {
        candidates?: {
          content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
        }[];
      } | null
    )?.candidates ?? [];
  for (const part of candidates[0]?.content?.parts ?? []) {
    const inline = part.inlineData;
    if (inline?.data)
      return { ok: true, mimeType: inline.mimeType ?? "image/png", data: inline.data };
  }
  return { ok: false, reason: "noImage" };
}
