import { describe, expect, it } from "vitest";
import { RELOAD_GAP_MS, RELOAD_MARK, isStaleAssetError, takeReloadTicket } from "@/lib/stale-asset";

/** sessionStorage の 代わり（テストは node 環境なので 自分で 用意する）。 */
function fakeStore(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(RELOAD_MARK, initial);
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("isStaleAssetError", () => {
  it("webpack の ChunkLoadError を 見分ける（実際に 出た もの）", () => {
    const error = new Error(
      "Loading chunk 5823 failed.\n(error: https://staging-academy.nexmax.workers.dev/_next/static/chunks/app/map/page-106e9023f0b62dd6.js)",
    );
    error.name = "ChunkLoadError";
    expect(isStaleAssetError(error)).toBe(true);
  });

  it("名前が 付いていなくても 文言で 見分ける", () => {
    expect(isStaleAssetError(new Error("Loading CSS chunk 42 failed."))).toBe(true);
    expect(
      isStaleAssetError(new Error("Failed to fetch dynamically imported module: /_next/x.js")),
    ).toBe(true);
    expect(isStaleAssetError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isStaleAssetError(new Error("Importing a module script failed."))).toBe(true);
  });

  it("ふつうの 不具合では 読み直さない（原因が 見えなくなるため）", () => {
    expect(isStaleAssetError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleAssetError(new TypeError("fetch failed"))).toBe(false);
    // 本番の サーバ側エラーは 文面が 伏せられ digest だけ になる
    const server = Object.assign(new Error("An error occurred in the Server Components render."), {
      digest: "123456",
    });
    expect(isStaleAssetError(server)).toBe(false);
  });

  it("エラーで ない ものを 渡されても 落ちない", () => {
    expect(isStaleAssetError(null)).toBe(false);
    expect(isStaleAssetError(undefined)).toBe(false);
    expect(isStaleAssetError(123)).toBe(false);
    expect(isStaleAssetError("Loading chunk 1 failed")).toBe(true);
  });
});

describe("takeReloadTicket", () => {
  it("1回目は 読み直す（しるしを 残す）", () => {
    const store = fakeStore();
    expect(takeReloadTicket(store, 1_000)).toBe(true);
    expect(store.map.get(RELOAD_MARK)).toBe("1000");
  });

  it("読み直した 直後の 2回目は 読み直さない（ループを 作らない）", () => {
    const store = fakeStore(String(1_000));
    expect(takeReloadTicket(store, 1_000 + RELOAD_GAP_MS - 1)).toBe(false);
  });

  it("時間が 経てば また 読み直せる（別の デプロイで また 入れ替わる）", () => {
    const store = fakeStore(String(1_000));
    expect(takeReloadTicket(store, 1_000 + RELOAD_GAP_MS)).toBe(true);
    expect(store.map.get(RELOAD_MARK)).toBe(String(1_000 + RELOAD_GAP_MS));
  });

  it("しるしが 壊れていても 1回は 読み直す", () => {
    const store = fakeStore("こわれた");
    expect(takeReloadTicket(store, 5_000)).toBe(true);
  });

  it("保存できない ブラウザでは 読み直さない（ボタンに 落とす）", () => {
    expect(takeReloadTicket(null, 1_000)).toBe(false);
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(takeReloadTicket(broken, 1_000)).toBe(false);
  });
});
