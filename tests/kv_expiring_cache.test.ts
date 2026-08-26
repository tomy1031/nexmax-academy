/**
 * 作りおきの置き場に 有効期限を 付けた ことの 検査（2026-08-26）。
 *
 * いちばん 怖いのは **書く鍵と 読む鍵が ずれる** こと。ずれても 画面は
 * 正しく 出る（毎回 作り直すだけ）ので、**目では 気づけない**。
 * だから ここで 機械に 見張らせる:
 *
 *   (1) 置くときに 期限が 付いている（付いていないと 永久に 溜まる）
 *   (2) 置く鍵が **元の実装の 鍵と 1文字も 違わない**
 *   (3) 読み出しと 消しは 元の実装に そのまま 渡している
 *   (4) 結び先が 無いときも 落ちない
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** KV への `put` を 記録する にせの 結び先。 */
type Put = { key: string; value: string; options?: { expirationTtl?: number } };
let puts: Put[] = [];

const kvStub = {
  put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
    puts.push({ key, value, options });
  }),
};

/** 結び先を 差し替えられるようにする（無いときの 道も 試すため）。 */
let bindingPresent = true;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: bindingPresent ? { NEXT_INC_CACHE_KV: kvStub } : {} }),
}));

/** 元の実装。`set` が 呼ばれたら 分かるように 見張る。 */
const originalSet = vi.fn(async () => {});
const originalGet = vi.fn(async () => null);
const originalDelete = vi.fn(async () => {});

vi.mock("@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache", () => {
  class KVIncrementalCache {
    name = "cf-kv-incremental-cache";
    get = originalGet;
    delete = originalDelete;
    set = originalSet;
    /**
     * わざと **本物とは 似ても 似つかない 形**にする。
     *
     * ここを 本物そっくりに すると、「自前で 鍵を 組み直した 実装」でも
     * 偶然 一致して 検査を すり抜ける。借りて いる ことだけを 見たいので、
     * 借りなければ 絶対に 作れない 文字列に する。
     */
    getKVKey(key: string, cacheType?: string) {
      return `((BORROWED))|${key}|${cacheType ?? "cache"}`;
    }
  }
  return { default: new KVIncrementalCache() };
});

const { default: cache, TTL_SECONDS, TTL_DAYS } = await import("@/lib/cache/kv-expiring-cache");
const { default: original } =
  await import("@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache");

beforeEach(() => {
  puts = [];
  bindingPresent = true;
  originalSet.mockClear();
  originalGet.mockClear();
  originalDelete.mockClear();
});

describe("作りおきの置き場（期限つき）", () => {
  it("置くときに 期限が 付く", async () => {
    await cache.set("/map", { value: "x" } as never, "cache");

    expect(puts).toHaveLength(1);
    expect(puts[0]?.options?.expirationTtl).toBe(TTL_SECONDS);
  });

  it("期限は 7日（増えかたの 計算と そろえる）", () => {
    expect(TTL_DAYS).toBe(7);
    expect(TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it("置く鍵が 元の実装の 鍵と 同じ（ここがずれると 永久に 当たらない）", async () => {
    await cache.set("/arcade/kaisha", { value: "x" } as never, "cache");

    // 元の実装に 同じ 引数で 鍵を 作らせ、1文字も 違わない ことを 見る
    const expected = (original as unknown as { getKVKey(k: string, t?: string): string }).getKVKey(
      "/arcade/kaisha",
      "cache",
    );
    expect(puts[0]?.key).toBe(expected);
  });

  it("種別（fetch など）も 鍵に 反映される", async () => {
    await cache.set("/x", { value: "x" } as never, "fetch");

    expect(puts[0]?.key).toBe("((BORROWED))|/x|fetch");
  });

  it("中身は 元の形（value と lastModified）を 保つ", async () => {
    await cache.set("/map", { value: "x" } as never, "cache");

    const stored = JSON.parse(puts[0]!.value);
    expect(stored).toHaveProperty("value");
    expect(typeof stored.lastModified).toBe("number");
  });

  it("読み出しと 消しは 元の実装に そのまま 渡す", async () => {
    await cache.get("/map", "cache");
    await cache.delete("/map");

    expect(originalGet).toHaveBeenCalledWith("/map", "cache");
    expect(originalDelete).toHaveBeenCalledWith("/map");
    // 読み出しでは 置きに 行かない
    expect(puts).toHaveLength(0);
  });

  it("結び先が 無いときは 元の実装に 任せる（落ちない）", async () => {
    bindingPresent = false;

    await expect(cache.set("/map", { value: "x" } as never, "cache")).resolves.toBeUndefined();
    expect(originalSet).toHaveBeenCalled();
    expect(puts).toHaveLength(0);
  });

  it("KV が 失敗しても 学習を 止めない", async () => {
    kvStub.put.mockImplementationOnce(async () => {
      throw new Error("KV put failed");
    });

    await expect(cache.set("/map", { value: "x" } as never, "cache")).resolves.toBeUndefined();
  });
});
