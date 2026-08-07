import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/studio/content/route";
import { isModelName, looksLiveCapable } from "@/lib/ai/models";
import { createEphemeralToken, LiveTokenError } from "@/lib/live/token";

/**
 * APIキーの ためし つなぎ（管理者専用）
 *
 * POST { apiKey, model? } → { ok, step, models, liveModels, live }
 *
 * **なぜ要るか。** キーを登録しても動かないとき、画面には「じゅんびちゅう」としか
 * 出なかった。原因はキーではなく、モデル名が消えていたこと（2026-08-06）と、
 * 短命トークンの本文の書き方が違っていたこと（同日）だったが、それを確かめる手が
 * 1つも無く、先生は自分のキーを疑い続けることになった。
 *
 * ## 診断は「どこで落ちたか」まで返す
 * 理由の名前だけでは足りない。同じ `upstream` でも、モデル一覧で落ちたのか
 * トークン発行で落ちたのかで、次にやることがまるで違う。だから
 * **step（どの段で落ちたか）と upstreamStatus（上流のHTTP番号）**を返す。
 * どちらもキーを含まないし、上流の本文も出さない（AGENTS.md 規律4）。
 */

const MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";

/** どの段で落ちたか。 */
type Step = "auth" | "listModels" | "createToken";

function fail(step: Step, reason: string, status: number, upstreamStatus?: number): NextResponse {
  return NextResponse.json({ ok: false, step, reason, upstreamStatus }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { apiKey?: unknown; model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("auth", "invalidJson", 400);
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return fail("auth", "noKey", 503);

  let models: string[];
  try {
    models = await listModels(apiKey);
  } catch (e) {
    if (e instanceof CheckError) {
      return fail("listModels", e.reason, 502, e.upstreamStatus);
    }
    // fetch そのものが投げた（ネットワーク・DNS・タイムアウト）。上流の番号は無い
    return fail("listModels", "network", 502);
  }

  const liveModels = models.filter(looksLiveCapable);
  const model = isModelName(body.model) ? body.model : (liveModels[0] ?? "");

  // モデルが1つも見えないキーは、この先を試す意味がない
  if (!model) {
    return NextResponse.json({ ok: true, step: "listModels", models, liveModels, live: null });
  }

  let live: { ok: boolean; reason: string | null; upstreamStatus?: number };
  try {
    await createEphemeralToken({ apiKey, model });
    live = { ok: true, reason: null };
  } catch (e) {
    live =
      e instanceof LiveTokenError
        ? { ok: false, reason: e.reason, upstreamStatus: e.status }
        : { ok: false, reason: "network" };
  }

  return NextResponse.json({ ok: true, step: "createToken", models, liveModels, model, live });
}

class CheckError extends Error {
  constructor(
    readonly reason: string,
    readonly upstreamStatus: number,
  ) {
    super(reason);
    this.name = "CheckError";
  }
}

/** そのキーで見えるモデルの名前（`models/` の接頭辞は落とす）。 */
async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch(MODELS_ENDPOINT, { headers: { "x-goog-api-key": apiKey } });
  if (!response.ok) {
    // Google は無効キーに 400 を返す（実測: API key not valid / INVALID_ARGUMENT）
    if (response.status === 400) throw new CheckError("badKey", 400);
    if (response.status === 401 || response.status === 403) {
      throw new CheckError("noPermission", response.status);
    }
    if (response.status === 429) throw new CheckError("rateLimited", 429);
    throw new CheckError("upstream", response.status);
  }
  let data: { models?: { name?: string }[] };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    // 200 なのに本文が読めない。ここを黙って空にすると「モデルが0個」に化ける
    throw new CheckError("badResponse", response.status);
  }
  return (data.models ?? [])
    .map((item) => (item.name ?? "").replace(/^models\//, ""))
    .filter((name) => name.length > 0)
    .sort();
}
