import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 作りおきの置き場ごとに、**作り直しを頼むかどうか**が変わること（2026-09-02）。
 *
 * 静的アセットの置き場は読み取り専用で、`set` は必ず失敗する。そこへ既定の
 * memoryQueue を組み合わせると、OpenNext の横取りが「古い」と見るたびに
 * **リクエストの中で `await queue.send()`**、memoryQueue は自分自身へ HEAD を
 * 投げて**まるごとフルSSR**する。書き込みは失敗し、鮮度（＝ビルド時刻）も
 * 変わらないので、**同じページが毎リクエスト永久に作り直され続ける**。
 *
 * これで STG の `/houkoku/link-houkoku_stamp` が Error 1102 になった。
 * `revalidate = 300` の学習者ページは、ビルドの5分後には全部「古い」ためである。
 *
 * **このとき通した検査は役に立たなかった** —— `/` は `force-static`（作り直しが無い）、
 * `/api/health/content` は `force-dynamic`（横取りを通らない）で、どちらもこの罠に
 * 当たらない2種類だった。だから「置き場と組み合わせ」をここで直に固定する。
 */
async function loadQueueName(cacheMode: string | undefined): Promise<string> {
  vi.resetModules();
  if (cacheMode === undefined) delete process.env.OPEN_NEXT_CACHE;
  else process.env.OPEN_NEXT_CACHE = cacheMode;

  const mod = await import("../open-next.config");
  const queue = mod.default.default.override?.queue;
  // resolveQueue は オブジェクトを `() => queue` に畳む（@opennextjs/cloudflare）
  const resolved = typeof queue === "function" ? await queue() : queue;
  if (typeof resolved === "string") return resolved;
  return resolved?.name ?? "(名前なし)";
}

describe("作りおきの置き場と 作り直しの 組み合わせ", () => {
  afterEach(() => {
    delete process.env.OPEN_NEXT_CACHE;
    vi.resetModules();
  });

  it("assets モード（STG・ブランチ確認URL）では 作り直しを頼まない", async () => {
    expect(await loadQueueName("assets")).toBe("noop-queue");
  });

  it("KV モード（本番）では これまでどおり memory-queue で 作り直す", async () => {
    expect(await loadQueueName(undefined)).toBe("memory-queue");
  });
});
