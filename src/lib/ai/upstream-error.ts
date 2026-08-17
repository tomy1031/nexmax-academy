/**
 * Google の エラー本文から「機械向けの名前」だけを取り出す
 *
 * ## なぜ要るか（2026-08-17）
 * キーの ためし つなぎ が 400 を返したとき、こちらは 中身を 読まずに すべて
 * `badKey`（＝キーが違う）と言い切っていた。ところが この API の 400 は
 * **キーが正しくても**返る:
 *
 *  - 発行したてのキー（しばらく `API_KEY_INVALID` を返すことがある）
 *  - `User location is not supported for the API use`（`FAILED_PRECONDITION`）。
 *    ためし つなぎ は**サーバから**投げるので、Google が見る国は先生のPCではない。
 *  - キー以外の 引数の 不備（`INVALID_ARGUMENT`）
 *
 * 言い切ると、正しいキーを持つ先生が 何度も コピーし直すことになる（実際にそうなった）。
 *
 * ## 外へ出してよいのは「名前」だけ
 * 上流の本文（`message`）にはキーが混ざりうる（AGENTS.md 規律4）。ここで取り出すのは
 * `error.status` と `error.details[].reason` の**大文字の記号だけ**で、形の合わない
 * ものは捨てる。文章は一切通さない。
 */

/** Google が付けた機械向けの名前。どちらも記号で、文章もキーも含まない。 */
export interface UpstreamCode {
  /** google.rpc.Code の名前。例: `FAILED_PRECONDITION` */
  readonly status: string | null;
  /** ErrorInfo.reason。例: `API_KEY_INVALID` */
  readonly reason: string | null;
}

export const NO_UPSTREAM_CODE: UpstreamCode = { status: null, reason: null };

/**
 * 通してよい形。大文字・数字・下線だけの短い記号に限る。
 * 文章（空白や句読点を含む）・キー（小文字や `.` を含む）はこの形にならない。
 */
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

function safeCode(value: unknown): string | null {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : null;
}

/** エラー応答の本文（JSON）から、機械向けの名前だけを拾う。 */
export function readUpstreamCode(body: unknown): UpstreamCode {
  if (typeof body !== "object" || body === null) return NO_UPSTREAM_CODE;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return NO_UPSTREAM_CODE;

  const status = safeCode((error as { status?: unknown }).status);
  const details = (error as { details?: unknown }).details;
  const reason = Array.isArray(details)
    ? (details
        .map((item) =>
          typeof item === "object" && item !== null
            ? safeCode((item as { reason?: unknown }).reason)
            : null,
        )
        .find((value) => value !== null) ?? null)
    : null;

  return { status, reason };
}

/**
 * 名前から失敗の理由を決める。**決められなければ `null`** を返し、
 * 呼ぶ側が HTTP の番号で決める（同じ 400 でも、モデル一覧と トークン発行では
 * 次にやることが違うため、ここで一本化しない）。
 */
export function reasonFromCode(code: UpstreamCode): string | null {
  switch (code.reason) {
    case "API_KEY_INVALID":
      return "badKey";
    case "API_KEY_EXPIRED":
      return "keyExpired";
    case "API_KEY_HTTP_REFERRER_BLOCKED":
    case "API_KEY_IP_ADDRESS_BLOCKED":
    case "API_KEY_ANDROID_APP_BLOCKED":
    case "API_KEY_IOS_APP_BLOCKED":
    case "API_KEY_SERVICE_BLOCKED":
      return "keyRestricted";
    case "SERVICE_DISABLED":
      return "apiDisabled";
    default:
      break;
  }

  switch (code.status) {
    // この API の FAILED_PRECONDITION は「呼び出し元の国が対象外」を指す。
    // 出典: https://ai.google.dev/gemini-api/docs/troubleshooting
    case "FAILED_PRECONDITION":
      return "locationNotSupported";
    case "PERMISSION_DENIED":
    case "UNAUTHENTICATED":
      return "noPermission";
    case "RESOURCE_EXHAUSTED":
      return "rateLimited";
    case "NOT_FOUND":
      return "modelNotFound";
    default:
      return null;
  }
}

/** エラー応答から、理由と名前を一度に取る。 */
export async function classifyUpstreamResponse(
  response: Response,
): Promise<{ reason: string | null; code: UpstreamCode }> {
  const body: unknown = await response.json().catch(() => null);
  const code = readUpstreamCode(body);
  return { reason: reasonFromCode(code), code };
}
