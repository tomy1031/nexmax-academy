/**
 * Gemini Live の短命トークン発行（サーバ専用）
 *
 * 方針（AGENTS.md 規律4 / 設計03 §2）:
 *  - APIキーはクライアントに出さない。共有のサーバーキーも持たない（BYOK）。
 *  - サーバが本人のキーで短命トークンを作り、ブラウザはそのトークンだけを使って
 *    Live の WebSocket に直接つなぐ。サーバは音声を中継しない
 *    （Cloudflare Workers 等に載せ替えても長時間接続を抱えないため）。
 */

const AUTH_TOKENS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";

/** トークンの有効時間。授業1コマ分より短く、使い回されないようにする。 */
const TOKEN_TTL_MINUTES = 30;
/** このトークンで新しいセッションを開始できる時間。 */
const NEW_SESSION_WINDOW_MINUTES = 2;

export interface EphemeralToken {
  /** ブラウザが API キーの代わりに使う値。 */
  readonly token: string;
  readonly expiresAt: string;
}

/**
 * 失敗の種類。画面に出す言い方はクライアント側が決める（issue-text と同じ流儀）。
 * キーそのものや上流の本文は**含めない**。
 */
export type LiveTokenReason =
  "badKey" | "noPermission" | "modelNotFound" | "rateLimited" | "upstream";

export class LiveTokenError extends Error {
  constructor(
    readonly reason: LiveTokenReason,
    readonly status: number,
  ) {
    super(reason);
    this.name = "LiveTokenError";
  }
}

/**
 * 上流のHTTPステータスを、先生が次の一手を決められる粒度に畳む。
 *
 * 400 はこのエンドポイントでは実質「キーが違う」（Google は無効キーに 400 を返す。
 * 実測: `API key not valid` が 400 INVALID_ARGUMENT）。
 */
function reasonFor(status: number): LiveTokenReason {
  if (status === 400) return "badKey";
  if (status === 401 || status === 403) return "noPermission";
  if (status === 404) return "modelNotFound";
  if (status === 429) return "rateLimited";
  return "upstream";
}

/**
 * 本人のAPIキーで短命トークンを作る。キー自体は戻り値に含めない。
 */
export async function createEphemeralToken({
  apiKey,
  model,
  now = new Date(),
}: {
  apiKey: string;
  model: string;
  now?: Date;
}): Promise<EphemeralToken> {
  const expireTime = new Date(now.getTime() + TOKEN_TTL_MINUTES * 60_000).toISOString();
  const newSessionExpireTime = new Date(
    now.getTime() + NEW_SESSION_WINDOW_MINUTES * 60_000,
  ).toISOString();

  const response = await fetch(AUTH_TOKENS_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      uses: 1,
      expireTime,
      newSessionExpireTime,
      // このトークンでできることをモデル1つに絞る
      liveConnectConstraints: { model },
    }),
  });

  if (!response.ok) {
    // 応答本文にキーが混ざる可能性があるので、そのまま外へ出さない。
    // ただし**なぜ失敗したか**は返す——ここを潰すと、キーを入れた先生には
    // 「だめだった」としか見えず、キーが違うのか・モデルが無いのか・
    // 使いすぎなのかを確かめる手が1つも無くなる（実際にそうなった）。
    throw new LiveTokenError(reasonFor(response.status), response.status);
  }

  const data = (await response.json()) as { name?: string };
  if (!data.name) throw new LiveTokenError("upstream", 502);

  return { token: data.name, expiresAt: expireTime };
}
