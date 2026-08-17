import { readUpstreamCode, reasonFromCode } from "@/lib/ai/upstream-error";

/**
 * そのキーで見えるモデルの一覧
 *
 * ## なぜブラウザからも引けるようにするか（2026-08-17）
 * うちの Worker は Cloudflare の**香港（HKG）**で動いている。Google の Gemini API は
 * 香港からの呼び出しを受け付けない（対応地域の一覧に無い）ため、サーバ経由の確認は
 * `400 FAILED_PRECONDITION / User location is not supported` で必ず落ちる。
 *
 * **先生のパソコンは日本やカンボジアにあり、どちらも対応地域**なので、
 * ブラウザから直接引けば通る。キーはもともとその端末にある（BYOK）ので、
 * ここで新しく配るものは無い。
 *
 * 出典: https://ai.google.dev/gemini-api/docs/available-regions
 */

export const MODELS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";

export type ListModelsResult = { ok: true; models: string[] } | { ok: false; reason: string };

/** 応答の本文から、モデルの名前だけを取り出す（`models/` の接頭辞は落とす）。 */
export function modelNamesFrom(data: { models?: { name?: string }[] } | null): string[] {
  return (data?.models ?? [])
    .map((item) => (item.name ?? "").replace(/^models\//, ""))
    .filter((name) => name.length > 0)
    .sort();
}

/** 名前が読めなかったときだけ使う、HTTP番号からの当て推量。 */
function fallbackReason(status: number): string {
  if (status === 400) return "invalidRequest";
  if (status === 401 || status === 403) return "noPermission";
  if (status === 404) return "modelNotFound";
  if (status === 429) return "rateLimited";
  return "upstream";
}

/**
 * ブラウザから直接 モデル一覧を引く。サーバが「場所が対象外」で落ちたときの逃げ道。
 * 失敗しても投げない——呼ぶ側は理由の名前で画面を出し分ける。
 */
export async function listModelsFromBrowser(apiKey: string): Promise<ListModelsResult> {
  let response: Response;
  try {
    response = await fetch(MODELS_ENDPOINT, { headers: { "x-goog-api-key": apiKey } });
  } catch {
    // ここは CORS で止められた場合も通る。ネットワークと区別できない
    return { ok: false, reason: "network" };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = reasonFromCode(readUpstreamCode(body)) ?? fallbackReason(response.status);
    return { ok: false, reason };
  }
  return { ok: true, models: modelNamesFrom(body as { models?: { name?: string }[] } | null) };
}
