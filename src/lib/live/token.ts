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

export class LiveTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LiveTokenError";
  }
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
    // 応答本文にキーが混ざる可能性があるので、そのまま外へ出さない
    throw new LiveTokenError("短命トークンの発行に失敗しました", response.status);
  }

  const data = (await response.json()) as { name?: string };
  if (!data.name) throw new LiveTokenError("短命トークンの形式が想定と違います", 502);

  return { token: data.name, expiresAt: expireTime };
}
