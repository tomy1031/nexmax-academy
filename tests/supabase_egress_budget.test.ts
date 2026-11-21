import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Supabase の 通信量（egress）の 予算を 守る。
 *
 * 2026-11-20 22:50 UTC、Supabase（Free プラン・月 5GB）が 通信量の 上限を 超えて 止まり、
 * 全員が ログインできなく なった（全要求が 402）。犯人は 本番の 見張り（workers/watch）が
 * 10分ごとに 叩く `/api/health/content` だった。
 *
 *   - 教材の 種類ごとの list* が それぞれ `fetchDbContents()` を 通る
 *   - ページを 組み立てる ときは React の `cache()` が 1回に 畳むが、
 *     **API ルートでは `cache()` が 効かない**（React の 描画の 外では 毎回 本体を 呼ぶ）
 *   - だから 健康しらべ 1回で studio_contents を **約21回** 丸ごと 引いて いた
 *   - 1回 約185KB × 21回 × 1日 144回 ≒ 1日 560MB ≒ 月 17GB（上限の 3倍）
 *
 * ここは「1回の 要求で studio_contents を 丸ごと 引くのは 1回」を 数えて 守る。
 * 増やしたく なったら、ここを 書きかえる 前に 月の 通信量を 見積もる（docs/deploy.md）。
 */

const { plainClientMock, configMock } = vi.hoisted(() => ({
  plainClientMock: vi.fn(),
  configMock: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: plainClientMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => null }));
vi.mock("@/lib/env", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  getSupabasePublicConfig: configMock,
}));

const content = await import("@/lib/content");
const { fetchDbContents, withDbContentScope } = await import("@/lib/content-db");
const { GET: healthGet } = await import("@/app/api/health/content/route");

/** studio_contents を 引いた 回数を 数える Supabase の 替え玉。 */
function countingClient(rows: unknown[] = []) {
  const calls: string[] = [];
  const builder = {
    eq() {
      return builder;
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve(resolve({ data: rows, error: null }));
    },
  };
  const client = {
    from: (table: string) => {
      calls.push(table);
      return { select: () => builder };
    },
  };
  return { client, calls };
}

let db: ReturnType<typeof countingClient>;
beforeEach(() => {
  db = countingClient();
  plainClientMock.mockReset();
  plainClientMock.mockImplementation(() => db.client);
  configMock.mockReset();
  configMock.mockReturnValue({ url: "https://db.example.co", anonKey: "anon" });
});

describe("教材の 健康しらべ（/api/health/content）", () => {
  it("1回の 要求で studio_contents を 引くのは 1回", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    expect(db.calls).toEqual(["studio_contents"]);
  });

  it("引いた 回数・行数・大きさを 答えに 出す（本番で 直ったかを 外から 確かめる ため）", async () => {
    const body = (await (await healthGet()).json()) as {
      db?: { fetches: number; rows: number; bytes: number };
    };
    expect(body.db).toEqual({ fetches: 1, rows: 0, bytes: 2 });
  });
});

describe("withDbContentScope — API ルートで 1回に 畳む", () => {
  /** content.ts が 出して いる 一覧の 関数（list*）を ぜんぶ 呼ぶ。足されても 自動で 入る。 */
  const listFns = Object.entries(content).filter(
    ([name, fn]) => name.startsWith("list") && typeof fn === "function",
  ) as [string, () => Promise<unknown>][];

  it("一覧の 関数は 10本 以上 ある（数え方が 壊れて 空回り して いない）", () => {
    expect(listFns.length).toBeGreaterThanOrEqual(10);
  });

  it("中で 一覧を ぜんぶ 呼んでも、DB は 1回", async () => {
    await withDbContentScope(async () => {
      await Promise.all(listFns.map(([, fn]) => fn()));
      // 続けて もう一度 呼んでも 引き直さない（Promise.all の 外でも 同じ 要求の うち）
      await Promise.all(listFns.map(([, fn]) => fn()));
    });
    expect(db.calls).toEqual(["studio_contents"]);
  });

  it("要求を またいで 使い回さない（先生の 直しが すぐ 出る ように）", async () => {
    await withDbContentScope(() => fetchDbContents());
    await withDbContentScope(() => fetchDbContents());
    expect(db.calls).toEqual(["studio_contents", "studio_contents"]);
  });

  it("公開分と 下書き入りは 別に 数える（下書きは 管理画面だけ）", async () => {
    await withDbContentScope(async () => {
      await fetchDbContents();
      await fetchDbContents({ includeDrafts: true });
    });
    // 下書き入りは Cookie の クライアント（ここでは 無し＝空）なので、公開分の 1回だけ
    expect(db.calls).toEqual(["studio_contents"]);
  });

  it("読めなかった ときも、その 要求の 中では 引き直さない（DB が 止まって いる ときに 叩き続けない）", async () => {
    const failing = {
      from: (table: string) => {
        db.calls.push(table);
        return {
          select: () => ({
            eq() {
              return this;
            },
            then(resolve: (v: { data: null; error: { code: string } }) => unknown) {
              return Promise.resolve(resolve({ data: null, error: { code: "PGRST000" } }));
            },
          }),
        };
      },
    };
    plainClientMock.mockImplementation(() => failing);
    const stats = await withDbContentScope(async (scope) => {
      expect(await fetchDbContents()).toEqual([]);
      expect(await fetchDbContents()).toEqual([]);
      return scope;
    });
    expect(db.calls).toEqual(["studio_contents"]);
    expect(stats).toMatchObject({ fetches: 1, rows: 0, bytes: 0 });
  });

  it("入れ子に しても 外側の 枠を 使う", async () => {
    await withDbContentScope(async () => {
      await fetchDbContents();
      await withDbContentScope(() => fetchDbContents());
    });
    expect(db.calls).toEqual(["studio_contents"]);
  });

  it("大きさは UTF-8 の バイト数で 数える（日本語は 1字 3バイト）", async () => {
    const rows = [{ id: "a", kind: "x", data: { t: "教材" }, status: "published" }];
    db = countingClient(rows);
    const stats = await withDbContentScope(async (s) => (await fetchDbContents(), s));
    expect(stats.rows).toBe(1);
    expect(stats.bytes).toBe(new TextEncoder().encode(JSON.stringify(rows)).length);
    expect(stats.bytes).toBeGreaterThan(JSON.stringify(rows).length);
  });
});

/* ------------------------------------------------------------------ *
 * 置き場所の 見張り（ソースを 読んで 数える）
 * ------------------------------------------------------------------ */

const SRC = join(import.meta.dirname, "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(join(SRC, ".."), f).replaceAll("\\", "/");

describe("API ルートは 1回に 畳む 枠の 中で 教材を 読む", () => {
  /*
   * API ルート（route.ts）は React の 描画の 外で 動くので、`cache()` が 効かない。
   * 教材の 読み出し（@/lib/content・@/lib/content-db）を 使う route.ts は、
   * `withDbContentScope` を 通して いないと 種類の 数だけ DB を 引く。
   */
  const routes = sources.filter((f) => /\/route\.tsx?$/.test(f));
  const readers = routes.filter((f) =>
    /from\s+"@\/lib\/content(-db)?"/.test(readFileSync(f, "utf8")),
  );

  it("教材を 読む API ルートが 見つかる（空回り して いない）", () => {
    expect(readers.map(rel)).toContain("src/app/api/health/content/route.ts");
  });

  it.each(readers.map((f) => [rel(f), f]))("%s は withDbContentScope を 使う", (_name, file) => {
    expect(readFileSync(file, "utf8")).toMatch(/withDbContentScope\(/);
  });
});

describe("studio_contents を 読む 所は 1か所", () => {
  /*
   * 教材の 行（studio_contents.data）は 大きい（2026-11 時点で 公開分 15行・約185KB。
   * 記事 1本で 108KB の 行も ある）。読む 所が 増えると、どこで 何回 引くかが 見えなく なる。
   * 読むのは src/lib/content-db.ts だけ。書く・消す 所（管理画面の 保存 API）は 返す 列を 絞る。
   */
  const ALLOWED: Record<string, string> = {
    "src/lib/content-db.ts": "読む 所（ここだけ）",
    "src/app/api/studio/content/route.ts": "保存と 削除。削除は id・kind だけ 返す",
  };

  it("studio_contents に 触る ファイルは 決めた 所だけ", () => {
    const touching = sources
      .filter((f) => /from\(\s*["']studio_contents["']\s*\)/.test(readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    expect(touching).toEqual(Object.keys(ALLOWED).sort());
  });

  it("読む 所は 1回の 要求の 中で 使い回す 仕組み（React の cache と 要求の 枠）を 通る", () => {
    const src = readFileSync(join(SRC, "lib", "content-db.ts"), "utf8");
    expect(src).toMatch(/cache\(/);
    expect(src).toMatch(/AsyncLocalStorage/);
  });
});
