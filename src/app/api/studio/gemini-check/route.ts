import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/studio/content/route";
import { isModelName, looksLiveCapable } from "@/lib/ai/models";
import { createEphemeralToken, LiveTokenError } from "@/lib/live/token";

/**
 * APIキーの ためし つなぎ（管理者専用）
 *
 * POST { apiKey, model? } → { ok, models: string[], live: {ok, reason} }
 *
 * **なぜ要るか。** キーを登録しても動かないとき、これまで画面には
 * 「じゅんびちゅう」としか出なかった。原因はキーではなく**モデル名が消えていた**
 * ことだったが（2026-08-06。preview 版が差し替わっていた）、それを確かめる手が
 * 1つも無く、先生は自分のキーを疑い続けることになった。
 *
 * ここでは2つを分けて調べる:
 *  1. そのキーで**どのモデルが見えるか**（ListModels）
 *  2. 選んだモデルで**トークンが発行できるか**（Live に実際つなげるか）
 *
 * キーも上流の応答本文も返さない（AGENTS.md 規律4）。モデル名は秘密ではないので返す。
 */

const MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { apiKey?: unknown; model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("invalidJson", 400);
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return fail("noKey", 503);

  let models: string[];
  try {
    models = await listModels(apiKey);
  } catch (e) {
    // ここで落ちるのはキーの問題がほとんど。理由の名前だけ返す
    return fail(e instanceof CheckError ? e.reason : "upstream", 502);
  }

  const liveModels = models.filter(looksLiveCapable);
  const model = isModelName(body.model) ? body.model : (liveModels[0] ?? "");

  // モデルが1つも見えないキーは、この先を試す意味がない
  if (!model) {
    return NextResponse.json({ ok: true, models, liveModels, live: null });
  }

  let live: { ok: boolean; reason: string | null };
  try {
    await createEphemeralToken({ apiKey, model });
    live = { ok: true, reason: null };
  } catch (e) {
    live = { ok: false, reason: e instanceof LiveTokenError ? e.reason : "upstream" };
  }

  return NextResponse.json({ ok: true, models, liveModels, model, live });
}

class CheckError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "CheckError";
  }
}

/** そのキーで見えるモデルの名前（`models/` の接頭辞は落とす）。 */
async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch(MODELS_ENDPOINT, { headers: { "x-goog-api-key": apiKey } });
  if (!response.ok) {
    // Google は無効キーに 400 を返す（実測: API key not valid / INVALID_ARGUMENT）
    if (response.status === 400) throw new CheckError("badKey");
    if (response.status === 401 || response.status === 403) throw new CheckError("noPermission");
    if (response.status === 429) throw new CheckError("rateLimited");
    throw new CheckError("upstream");
  }
  const data = (await response.json()) as { models?: { name?: string }[] };
  return (data.models ?? [])
    .map((item) => (item.name ?? "").replace(/^models\//, ""))
    .filter((name) => name.length > 0)
    .sort();
}
