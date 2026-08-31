/**
 * ログイン判定を「その場での署名検証」に変えたことの検査（2026-08-26）。
 *
 * 変える前は `auth.getUser()` で、ページを開くたびに Supabase の認証サーバへ
 * 1往復していた。授業で20人が一斉に使うと、この往復が Worker の資源上限を
 * 押し上げる（docs/deploy.md §0.7）。
 *
 * ここで確かめたいのは 2つ:
 *   (1) **外へ出ない**——JWKS（公開鍵）を1回取るだけで、以後は往復ゼロ
 *   (2) **安全さが落ちていない**——にせのトークンが素通りしない
 *
 * そのために、この検査では **fetch を乗っ取り、JWKS 以外への通信を失敗にする**。
 * `getUser()` に戻したり、うっかり別の往復を足したりすると、ここが赤くなる。
 */
import { beforeEach, describe, expect, it } from "vitest";

/** にせのプロジェクト。本物へはつながない（fetch を乗っ取っているので出られない）。 */
const PROJECT_REF = "testproject";
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

const { middleware } = await import("@/middleware");
const { AUTH_STATE_HEADER } = await import("@/lib/auth-cookie");
const { NextRequest } = await import("next/server");

const JWKS_URL = `https://${PROJECT_REF}.supabase.co/auth/v1/.well-known/jwks.json`;
const KID = "test-signing-key";

/** 本物と同じ ES256（P-256）の鍵を、検査のあいだだけ作る。 */
async function makeKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
}

const signer = await makeKeyPair();
/** 署名だけ別人がした場合を作るための、関係のない鍵。 */
const stranger = await makeKeyPair();

async function publicJwks(keyPair: CryptoKeyPair) {
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return { keys: [{ ...jwk, kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] }] };
}

const JWKS = await publicJwks(signer);

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function b64urlText(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

/** 学習者のアクセストークン（Supabase が配るものと同じ形）を作る。 */
async function makeToken({
  expiresInSec = 3600,
  signWith = signer,
  sub = "11111111-1111-1111-1111-111111111111",
}: { expiresInSec?: number; signWith?: CryptoKeyPair; sub?: string } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", typ: "JWT", kid: KID };
  const payload = {
    sub,
    aud: "authenticated",
    role: "authenticated",
    iss: `https://${PROJECT_REF}.supabase.co/auth/v1`,
    iat: now,
    exp: now + expiresInSec,
    email: "gakusei@example.com",
  };
  const head = b64urlText(JSON.stringify(header));
  const body = b64urlText(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signWith.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

/** @supabase/ssr が置くセッションクッキーの中身（`base64-` ＋ base64url の JSON）。 */
function sessionCookie(accessToken: string): string {
  const session = {
    access_token: accessToken,
    refresh_token: "refresh-token-not-used-here",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated" },
  };
  return `base64-${b64urlText(JSON.stringify(session))}`;
}

/** 外へ出た通信の記録。JWKS 以外はここに残り、検査が赤くなる。 */
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.startsWith(JWKS_URL)) {
      return new Response(JSON.stringify(JWKS), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // ここに来たら「往復を増やした」ということ。何が呼ばれたか分かるように落とす。
    throw new Error(`外への往復が増えている: ${url}`);
  }) as typeof fetch;
});

/** 学習者がクッキーを持ってステージを開いたときのリクエスト。 */
function requestWithCookie(cookie: string | null, path = "/map") {
  const request = new NextRequest(`https://academy.example.dev${path}`);
  if (cookie) request.cookies.set(`sb-${PROJECT_REF}-auth-token`, cookie);
  return request;
}

/**
 * ミドルウェアの判定。
 *
 * `NextResponse.next({ request: { headers } })` は、上書きした リクエストヘッダを
 * `x-middleware-request-<名前>` に 入れて 返す（実測で 確認）。ログイン済みなら "1"。
 * 通さない ときは タイトルへの 転送に なるので `location` が 入る。
 */
async function judge(cookie: string | null, path = "/map") {
  const response = await middleware(requestWithCookie(cookie, path));
  return {
    state: response.headers.get(`x-middleware-request-${AUTH_STATE_HEADER}`),
    location: response.headers.get("location"),
  };
}

describe("ログイン判定（その場での署名検証）", () => {
  it("正しいトークンは通る。外への往復は JWKS の1回だけ", async () => {
    const result = await judge(sessionCookie(await makeToken()));

    expect(result.state).toBe("1"); // ログイン済みと判定された
    expect(result.location).toBeNull(); // タイトルへ返されていない
    expect(calls).toEqual([JWKS_URL]);
  });

  it("2回目からは JWKS も取りに行かない（往復ゼロ）", async () => {
    const cookie = sessionCookie(await makeToken());
    const first = await judge(cookie); // 1回目で公開鍵をためる
    expect(first.state).toBe("1");
    calls = [];

    for (let i = 0; i < 20; i += 1) {
      // 授業と同じ20人ぶん。ここで1回でも外へ出たら calls に残る。
      expect((await judge(cookie)).state).toBe("1");
    }

    expect(calls).toEqual([]);
  });

  it("中身を書き換えたトークンは弾く（別人になりすませない）", async () => {
    const token = await makeToken();
    const [head, , signature] = token.split(".");
    const forged = JSON.stringify({
      sub: "99999999-9999-9999-9999-999999999999",
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const tampered = `${head}.${b64urlText(forged)}.${signature}`;

    const result = await judge(sessionCookie(tampered));

    expect(result.state).not.toBe("1");
    expect(result.location).toContain("/?next=%2Fmap"); // タイトルへ返す
  });

  it("関係のない鍵で署名したトークンは弾く", async () => {
    const result = await judge(sessionCookie(await makeToken({ signWith: stranger })));

    expect(result.state).not.toBe("1");
    expect(result.location).toContain("/?next=%2Fmap");
  });

  it("期限の切れたトークンは弾く", async () => {
    const result = await judge(sessionCookie(await makeToken({ expiresInSec: -60 })));

    expect(result.state).not.toBe("1");
    expect(result.location).toContain("/?next=%2Fmap");
  });

  it("クッキーが無いときは、そもそも外へ出ない", async () => {
    const result = await judge(null);

    expect(result.location).toContain("/?next=%2Fmap");
    expect(calls).toEqual([]);
  });

  it("API と タイトル画面は、ログイン済みでも 外へ 出ない（願い #17 のまま）", async () => {
    const cookie = sessionCookie(await makeToken());

    expect((await judge(cookie, "/api/version")).location).toBeNull();
    expect(calls).toEqual([]);
  });
});

/**
 * 作りおき（ISR）の 作り直しが 門番を 通ること（2026-08-29）。
 *
 * OpenNext の memoryQueue は 期限切れの ページを 直すとき、Worker 自身へ
 * クッキー無しの `HEAD` を 送る。ここを ログイン画面へ 返して いたので、
 * まなびマップと ステージは、**配布した ときの まま 凍って いた**——先生が スタジオで
 * 「地図に 出さない」に しても、学習者の マップから 永久に 消えなかった。
 */
describe("ISR の 作り直しは 門番を 通す", () => {
  /** memoryQueue が 送るのと 同じ かたちの リクエスト。 */
  function isrRequest(over: { method?: string; token?: string | null; isr?: string | null } = {}) {
    const request = new NextRequest("https://academy.example.dev/map", {
      method: over.method ?? "HEAD",
    });
    const token = over.token === undefined ? "preview-mode-id" : over.token;
    if (token !== null) request.headers.set("x-prerender-revalidate", token);
    const isr = over.isr === undefined ? "1" : over.isr;
    if (isr !== null) request.headers.set("x-isr", isr);
    return request;
  }

  it("クッキーが 無くても 転送されない（＝作り直しが 通る）", async () => {
    const response = await middleware(isrRequest());
    expect(response.headers.get("location")).toBeNull();
  });

  it("合言葉が ちがえば 通さない", async () => {
    process.env.NEXT_PREVIEW_MODE_ID = "the-real-one";
    try {
      const response = await middleware(isrRequest({ token: "guessed" }));
      expect(response.headers.get("location")).toContain("/?next=%2Fmap");
    } finally {
      delete process.env.NEXT_PREVIEW_MODE_ID;
    }
  });

  it("GET には この 通り道を 開けない（本文を 取られない）", async () => {
    const response = await middleware(isrRequest({ method: "GET" }));
    expect(response.headers.get("location")).toContain("/?next=%2Fmap");
  });

  it("しるしの 無い HEAD は これまでどおり 転送する", async () => {
    const response = await middleware(isrRequest({ token: null, isr: null }));
    expect(response.headers.get("location")).toContain("/?next=%2Fmap");
  });
});
