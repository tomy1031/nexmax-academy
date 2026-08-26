/**
 * 本人確認を「その場の 署名検証」に そろえたことの 検査（2026-08-26）。
 *
 * 変える前は `auth.getUser()` で、**呼ぶたびに Supabase の 認証サーバへ 1往復**
 * していた。学習者の 道には これが 何度も あり、マップを 開くだけで 2回
 *（`map-shell` 自身と、その 中の `fetchOwnProfile`）飛んで いた。
 *
 * 効くのは 2つの 天井:
 *   - Cloudflare … サーバ側の 往復は Worker の 仕事を 増やす
 *   - **Supabase の IP ごとの 上限** … 教室は 1本の 回線＝1つの IP から 出るので、
 *     20人が 同じ 枠を 削り合う（docs/deploy.md §0.10）
 *
 * ここで 押さえたいのは 1つ: **`getUser()` に 戻したら 赤く なる**こと。
 * だから にせの クライアントを 渡し、`getUser` が 呼ばれたら その場で 投げる。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SUB = "11111111-2222-3333-4444-555555555555";

/** 呼ばれた回数を数えるための入れもの。 */
let claimsCalls = 0;
let selectedId: string | null = null;

/**
 * にせの Supabase クライアント。
 * **`getUser` は「呼ばれたら失敗」**——往復が戻ってきたことを検査で捕まえる。
 */
function fakeClient(claims: Record<string, unknown> | null) {
  return {
    auth: {
      getClaims: async () => {
        claimsCalls += 1;
        return { data: claims ? { claims } : null, error: null };
      },
      getUser: async () => {
        throw new Error("getUser() は 呼ばない（認証サーバへの 往復に 戻っている）");
      },
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => {
          selectedId = value;
          return { maybeSingle: async () => ({ data: { id: value }, error: null }) };
        },
      }),
    }),
  };
}

let currentClaims: Record<string, unknown> | null = { sub: SUB, email: "a@example.com" };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => fakeClient(currentClaims),
}));

const { readOwnId, requireOwnId, readOwnClaims } = await import("@/lib/supabase/claims");
const { fetchOwnProfile } = await import("@/lib/profile-db");
const { createClient } = await import("@/lib/supabase/client");

beforeEach(() => {
  claimsCalls = 0;
  selectedId = null;
  currentClaims = { sub: SUB, email: "a@example.com" };
});

describe("本人の id は その場で 決める", () => {
  it("署名の 中みから id を 取り出す（外へ 出ない）", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readOwnId(createClient() as any)).toBe(SUB);
    expect(claimsCalls).toBe(1);
  });

  it("ログインして いなければ null", async () => {
    currentClaims = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readOwnId(createClient() as any)).toBeNull();
  });

  it("書き込みの 前は、ログインして いなければ 投げる", async () => {
    currentClaims = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(requireOwnId(createClient() as any)).rejects.toThrow("Authentication is required");
  });

  it("email や user_metadata も 署名の 中みから そろう（なまえの 下ごしらえに 使う）", async () => {
    currentClaims = { sub: SUB, email: "b@example.com", user_metadata: { full_name: "Sophea" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claims = await readOwnClaims(createClient() as any);
    expect(claims?.email).toBe("b@example.com");
    expect(claims?.user_metadata).toEqual({ full_name: "Sophea" });
  });
});

describe("じぶんの行を 読むのに 認証サーバへ 往復しない", () => {
  it("`getUser()` を 呼ばずに、署名の id で 行を 引く", async () => {
    // にせのクライアントは getUser が呼ばれたら投げる。通れば往復していない。
    const profile = await fetchOwnProfile();
    expect(profile).toEqual({ id: SUB });
    expect(selectedId).toBe(SUB);
    expect(claimsCalls).toBe(1);
  });

  it("ログインして いなければ null（画面は そこで /welcome へ 送る）", async () => {
    currentClaims = null;
    expect(await fetchOwnProfile()).toBeNull();
  });
});
