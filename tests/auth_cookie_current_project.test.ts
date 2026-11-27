import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Supabase を新しいプロジェクトへ移したあと、古いプロジェクトのクッキーだけが
 * 残っている端末を「ログインずみ」と見ない（2026-11-27・授業中の事故）。
 *
 * 見誤ると、タイトル画面は「つづきから」を出すのに、押した先のミドルウェアは
 * セッションを見つけられずにタイトルへ戻す——を繰り返す。
 */
const NEW_REF = "newprojectref";
const OLD_REF = "oldprojectref";

async function loadAuthCookie(url: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", url ? "test-anon-key" : undefined);
  return import("@/lib/auth-cookie");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hasAuthCookie はいまのプロジェクトのクッキーだけを見る", () => {
  it("古いプロジェクトのクッキーだけでは、ログインずみと見ない", async () => {
    const { hasAuthCookie } = await loadAuthCookie(`https://${NEW_REF}.supabase.co`);
    expect(
      hasAuthCookie([
        { name: `sb-${OLD_REF}-auth-token.0` },
        { name: `sb-${OLD_REF}-auth-token.1` },
        { name: "nexmax.ready" },
      ]),
    ).toBe(false);
  });

  it("いまのプロジェクトのクッキー（分割 .0 も）はログインずみと見る", async () => {
    const { hasAuthCookie } = await loadAuthCookie(`https://${NEW_REF}.supabase.co`);
    expect(hasAuthCookie([{ name: `sb-${NEW_REF}-auth-token` }])).toBe(true);
    expect(
      hasAuthCookie([{ name: `sb-${OLD_REF}-auth-token` }, { name: `sb-${NEW_REF}-auth-token.0` }]),
    ).toBe(true);
  });

  it("似た名前（ref の前後に文字がある）には当たらない", async () => {
    const { hasAuthCookie } = await loadAuthCookie(`https://${NEW_REF}.supabase.co`);
    expect(hasAuthCookie([{ name: `sb-x${NEW_REF}-auth-token` }])).toBe(false);
    expect(hasAuthCookie([{ name: `sb-${NEW_REF}x-auth-token` }])).toBe(false);
  });

  it("Supabase の設定が無いときは、これまでどおり ref を問わない", async () => {
    const { hasAuthCookie } = await loadAuthCookie(undefined);
    expect(hasAuthCookie([{ name: `sb-${OLD_REF}-auth-token` }])).toBe(true);
  });

  it("ブラウザ側（タイトル画面の判定）も古いクッキーだけなら未ログイン", async () => {
    const { hasAuthCookieInBrowser } = await loadAuthCookie(`https://${NEW_REF}.supabase.co`);
    vi.stubGlobal("document", {
      cookie: `nexmax.ready=1; sb-${OLD_REF}-auth-token.0=a; sb-${OLD_REF}-auth-token.1=b`,
    });
    expect(hasAuthCookieInBrowser()).toBe(false);
    vi.stubGlobal("document", { cookie: `nexmax.ready=1; sb-${NEW_REF}-auth-token=a` });
    expect(hasAuthCookieInBrowser()).toBe(true);
  });
});
