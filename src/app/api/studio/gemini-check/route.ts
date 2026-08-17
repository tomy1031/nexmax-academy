import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/studio/content/route";
import { isModelName, looksLiveCapable } from "@/lib/ai/models";
import {
  classifyUpstreamResponse,
  NO_UPSTREAM_CODE,
  type UpstreamCode,
} from "@/lib/ai/upstream-error";
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
 *
 * ## 400 を「キーが違う」と言い切らない（2026-08-17）
 * 以前はモデル一覧が 400 なら無条件に `badKey` と言っていた。この API の 400 は
 * **正しいキーでも**返る（発行したて・呼び出し元の国が対象外・引数の不備）。
 * 正しいキーを持つ先生が、何度もコピーし直す羽目になった。いまは上流の
 * **機械向けの名前だけ**（`API_KEY_INVALID` などの記号）を読んで理由を分け、
 * 読み取れないときは `invalidRequest`（＝キーの正しさは不明）に留める。
 * 詳しくは src/lib/ai/upstream-error.ts。
 */

const MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";

/** どの段で落ちたか。 */
type Step = "auth" | "listModels" | "createToken";

function fail(
  step: Step,
  reason: string,
  status: number,
  upstream?: { status: number; code: UpstreamCode },
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      step,
      reason,
      upstreamStatus: upstream?.status,
      // 上流が付けた名前（記号だけ）。原因の切り分けに要る。文章もキーも含まない
      upstreamCode: upstream?.code.status ?? undefined,
      upstreamReason: upstream?.code.reason ?? undefined,
    },
    { status },
  );
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
      return fail("listModels", e.reason, 502, { status: e.upstreamStatus, code: e.code });
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

  let live: {
    ok: boolean;
    reason: string | null;
    upstreamStatus?: number;
    upstreamCode?: string;
    upstreamReason?: string;
  };
  try {
    await createEphemeralToken({ apiKey, model });
    live = { ok: true, reason: null };
  } catch (e) {
    live =
      e instanceof LiveTokenError
        ? {
            ok: false,
            reason: e.reason,
            upstreamStatus: e.status,
            upstreamCode: e.code.status ?? undefined,
            upstreamReason: e.code.reason ?? undefined,
          }
        : { ok: false, reason: "network" };
  }

  return NextResponse.json({ ok: true, step: "createToken", models, liveModels, model, live });
}

class CheckError extends Error {
  constructor(
    readonly reason: string,
    readonly upstreamStatus: number,
    readonly code: UpstreamCode = NO_UPSTREAM_CODE,
  ) {
    super(reason);
    this.name = "CheckError";
  }
}

/** 名前が読めなかったときだけ使う、HTTP番号からの当て推量。 */
function fallbackReason(status: number): string {
  if (status === 400) return "invalidRequest"; // キーが違うとは限らない
  if (status === 401 || status === 403) return "noPermission";
  if (status === 404) return "modelNotFound";
  if (status === 429) return "rateLimited";
  return "upstream";
}

/** そのキーで見えるモデルの名前（`models/` の接頭辞は落とす）。 */
async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch(MODELS_ENDPOINT, { headers: { "x-goog-api-key": apiKey } });
  if (!response.ok) {
    const { reason, code } = await classifyUpstreamResponse(response);
    throw new CheckError(reason ?? fallbackReason(response.status), response.status, code);
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
