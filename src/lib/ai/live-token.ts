import { readUpstreamCode, reasonFromCode } from "@/lib/ai/upstream-error";

/**
 * Gemini Live の短命トークン（ブラウザで作る）
 *
 * ## サーバを通さない（2026-08-17）
 * 以前はサーバ（`/api/live/token`）で交換していた。ねらいは「アプリのコードに
 * 共有キーを置かない」ことで、それは今も守っている——キーは**先生・学習者の端末に
 * だけ**ある（BYOK）。
 *
 * 変えた理由は2つ。
 *
 *  1. **場所**。うちの Worker は訪問者の近くで動き、そこが香港だと Google は断る
 *     （Gemini の対応地域に香港は無い）。端末から呼べば通る。
 *  2. **キーの通り道**。サーバで交換すると、キーが香港のデータセンターを通って
 *     復号される。通さなければ、その心配自体が無くなる。
 *
 * トークンの効き目は変わらない——**1回だけ使えて30分で切れる**。長く使えるキーを
 * Live の接続先へ直接投げない、という当初の目的はここでも守っている。
 *
 * ## モデルで縛らない（2026-08-06 の判断を引き継ぐ）
 * `liveConnectConstraints` を付けると接続先が `…BidiGenerateContentConstrained` に
 * 変わり、音声づくり（素のモデル名でつなぐ）が壊れる。縛らなくても
 * 「1回・30分」の制限は効く。
 * 出典: https://ai.google.dev/gemini-api/docs/ephemeral-tokens
 */

const AUTH_TOKENS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";

/** トークンの有効時間。授業1コマ分より短く、使い回されないようにする。 */
const TOKEN_TTL_MINUTES = 30;
/** このトークンで新しいセッションを開始できる時間。 */
const NEW_SESSION_WINDOW_MINUTES = 2;

export type LiveTokenResult =
  { ok: true; token: string; expiresAt: string } | { ok: false; reason: string };

/** 名前が読めなかったときだけ使う、HTTP番号からの当て推量。 */
function fallbackReason(status: number): string {
  // 400 を「キーが違う」と言い切らない。新形式（AQ.）のキーでここだけ落ちる例がある
  if (status === 400) return "tokenRejected";
  if (status === 401 || status === 403) return "noPermission";
  if (status === 404) return "modelNotFound";
  if (status === 429) return "rateLimited";
  return "upstream";
}

/** 本人のキーで短命トークンを作る。失敗しても投げない（呼ぶ側が理由で出し分ける）。 */
export async function createLiveToken({
  apiKey,
  now = new Date(),
}: {
  apiKey: string;
  now?: Date;
}): Promise<LiveTokenResult> {
  const expireTime = new Date(now.getTime() + TOKEN_TTL_MINUTES * 60_000).toISOString();
  const newSessionExpireTime = new Date(
    now.getTime() + NEW_SESSION_WINDOW_MINUTES * 60_000,
  ).toISOString();

  let response: Response;
  try {
    response = await fetch(AUTH_TOKENS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ uses: 1, expireTime, newSessionExpireTime }),
    });
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

  const name = (data as { name?: string } | null)?.name;
  if (!name) return { ok: false, reason: "upstream" };
  return { ok: true, token: name, expiresAt: expireTime };
}
