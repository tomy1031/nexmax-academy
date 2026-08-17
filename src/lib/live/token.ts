/**
 * Gemini Live の短命トークン発行（サーバ専用）
 *
 * 方針（AGENTS.md 規律4 / 設計03 §2）:
 *  - APIキーはクライアントに出さない。共有のサーバーキーも持たない（BYOK）。
 *  - サーバが本人のキーで短命トークンを作り、ブラウザはそのトークンだけを使って
 *    Live の WebSocket に直接つなぐ。サーバは音声を中継しない
 *    （Cloudflare Workers 等に載せ替えても長時間接続を抱えないため）。
 *
 * ## モデルで縛るのをやめた（2026-08-06）
 * 以前は `liveConnectConstraints: { model }` を付けてトークンを1モデルに縛っていた。
 * これは**2重に間違っていた**。有効なキーでも 400 INVALID_ARGUMENT になり、
 * たいわも音声づくりも一度も動かなかった:
 *
 *  1. REST では model に `models/` の接頭辞が要る（Python/JS の SDK は不要）。
 *     付けずに送っていた。
 *  2. `liveConnectConstraints` の中の `config` は**必須**。省いていた。
 *     出典: https://ai.google.dev/gemini-api/docs/ephemeral-tokens
 *
 * 形を直せば通るが、縛ったトークンの接続先は
 * `.../v1alpha.GenerativeService.BidiGenerateContentConstrained` に変わる。
 * 音声づくり（src/lib/audio/live-tts.ts）は素の WebSocket を
 * `v1beta...BidiGenerateContent` に張るので、縛った瞬間にそちらが壊れる。
 *
 * 縛りをやめても、トークンは**1回しか使えず30分で切れる**。守れる範囲は
 * ほとんど変わらないので、動くほうを採った。戻すときは、接続先の出し分けも
 * 同時に直すこと。
 */

import {
  classifyUpstreamResponse,
  NO_UPSTREAM_CODE,
  type UpstreamCode,
} from "@/lib/ai/upstream-error";

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
  | "tokenRejected"
  | "noPermission"
  | "modelNotFound"
  | "rateLimited"
  | "upstream"
  // 上流が名前を付けてきたとき（src/lib/ai/upstream-error.ts）
  | "badKey"
  | "keyExpired"
  | "keyRestricted"
  | "apiDisabled"
  | "locationNotSupported";

export class LiveTokenError extends Error {
  constructor(
    readonly reason: LiveTokenReason,
    readonly status: number,
    readonly code: UpstreamCode = NO_UPSTREAM_CODE,
  ) {
    super(reason);
    this.name = "LiveTokenError";
  }
}

/**
 * 上流のHTTPステータスを、先生が次の一手を決められる粒度に畳む。
 * **上流が名前を付けてきたときはそちらが勝つ**（`reasonFromCode`）。ここは
 * 名前が読めなかったときの受け皿。
 *
 * 400 を「キーが違う」と言い切らない。このエンドポイントの 400 は
 * 「キーが無効」でも「本文の形が違う」でも返るうえ、**キーの形式が新しい
 * （`AQ.` で始まる）と、モデル一覧は引けるのにトークンだけ作れない**という
 * 既知の挙動もある。言い切ると、正しいキーを何度も入れ直すことになる。
 * 参考: https://discuss.ai.google.dev/t/authtokens-create-fails-with-invalid-argument-for-new-format-api-keys-aq-xxx-but-works-with-legacy-keys-aizasy/141133
 */
function reasonFor(status: number): LiveTokenReason {
  if (status === 400) return "tokenRejected";
  if (status === 401 || status === 403) return "noPermission";
  if (status === 404) return "modelNotFound";
  if (status === 429) return "rateLimited";
  return "upstream";
}

/**
 * 本人のAPIキーで短命トークンを作る。キー自体は戻り値に含めない。
 *
 * `model` は受け取るが、いまはトークンに縛りを掛けない（上の注記）。
 * 呼ぶ側が「どのモデルにつなぐつもりか」を持っておくために残してある。
 */
export async function createEphemeralToken({
  apiKey,
  now = new Date(),
}: {
  apiKey: string;
  model?: string;
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
    body: JSON.stringify({ uses: 1, expireTime, newSessionExpireTime }),
  });

  if (!response.ok) {
    // 応答本文にキーが混ざる可能性があるので、そのまま外へ出さない。
    // ただし**なぜ失敗したか**は返す——ここを潰すと、キーを入れた先生には
    // 「だめだった」としか見えず、原因を確かめる手が1つも無くなる（実際にそうなった）。
    // 名前（記号）だけは読み取って、読めたらそれを理由にする。
    const { reason, code } = await classifyUpstreamResponse(response);
    throw new LiveTokenError(
      (reason as LiveTokenReason | null) ?? reasonFor(response.status),
      response.status,
      code,
    );
  }

  const data = (await response.json()) as { name?: string };
  if (!data.name) throw new LiveTokenError("upstream", 502);

  return { token: data.name, expiresAt: expireTime };
}
