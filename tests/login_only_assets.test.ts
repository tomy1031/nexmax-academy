import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  LOGIN_CHECK_NAME,
  LOGIN_ONLY_DIRS,
  cookieNames,
  isLoginOnly,
  serveLoginOnly,
  type AskApp,
} from "@/lib/login-only-assets";
import type { AssetsBinding } from "@/lib/media-range";

/**
 * ログインした 人だけに 配る 静的ファイル（空気読みゲーム・2026-10-16）の 自動チェック。
 * `public/` の ファイルは ふつう ログインなしで 開けるので、`/tools/kuuki-yomi/*` だけ
 * Worker を 先に 通して 分けて いる。理由は src/lib/login-only-assets.ts の 冒頭。
 *
 * 入口（worker.mjs）は `.open-next/worker.js`（ビルドの あとにしか 無い）を 読むので、
 * ここでは 入口の 中身（serveLoginOnly）を 確かめ、つなぎ方は 入口の 文を 読んで 確かめる。
 * 「ログインが 要る 環境か」の 答えは、本物の middleware に 出させる（Supabase の 設定
 * あり・なしの 2通りを 読み込んで おく）。
 */

const ROOT = process.cwd();
const GAME = "/tools/kuuki-yomi/index.html";
const SESSION = "sb-testproject-auth-token";
const ORIGIN = "https://academy.test";

/** middleware を 読み込む（Supabase の 設定は 読み込んだ ときに 決まる）。 */
async function loadMiddleware(configured: boolean) {
  vi.resetModules();
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    configured ? "https://testproject.supabase.co" : undefined,
  );
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", configured ? "test-anon-key" : undefined);
  const { middleware, config } = await import("@/middleware");
  const { NextRequest } = await import("next/server");
  return {
    config,
    run: (request: Request) => middleware(new NextRequest(request)),
  };
}

const withLogin = await loadMiddleware(true);
const demo = await loadMiddleware(false);
afterAll(() => {
  vi.unstubAllEnvs();
});

/** アプリ本体の 代わり。middleware の 答えを 返し、たずねられた リクエストを 残す。 */
function askWith(answer: (request: Request) => Promise<Response> | Response) {
  const asked: Request[] = [];
  const askApp: AskApp = async (request) => {
    asked.push(request);
    return answer(request);
  };
  return { askApp, asked };
}

/** 静的アセットの 偽物。受けた リクエストを 残し、決めた 応答を 返す。 */
function fakeAssets(respond: (request: Request) => Response = () => new Response("game")) {
  const requests: Request[] = [];
  const assets: AssetsBinding = {
    async fetch(request) {
      requests.push(request);
      return respond(request);
    },
  };
  return { assets, requests };
}

function req(
  pathname: string,
  {
    cookie,
    method = "GET",
    headers = {},
  }: { cookie?: string; method?: string; headers?: Record<string, string> } = {},
) {
  return new Request(`${ORIGIN}${pathname}`, {
    method,
    headers: cookie ? { ...headers, Cookie: cookie } : headers,
  });
}

/** middleware の matcher（1つの 正規表現の 形 `/(…)`）を そのまま 正規表現に して 当てる。 */
function watchedByMiddleware(pathname: string): boolean {
  return withLogin.config.matcher.some((m: string) => new RegExp(`^${m}$`).test(pathname));
}

describe("どの 道を ログインの 内側に するか", () => {
  it("ゲームの フォルダ そのものと、その 中だけ", () => {
    for (const pathname of [
      "/tools/kuuki-yomi",
      "/tools/kuuki-yomi/",
      GAME,
      "/tools/kuuki-yomi/js/main.js",
      "/tools/kuuki-yomi/css/app.css",
    ]) {
      expect(isLoginOnly(pathname), pathname).toBe(true);
    }
  });

  it("ほかの 道は 触らない（ほかの /tools/* も、名前の 似た フォルダも）", async () => {
    for (const pathname of [
      "/tools/hourensou/renraku_slack",
      "/tools/kuuki-yomi-old/index.html",
      "/tools/kuuki-yomix",
      "/tools",
      "/kuuki",
      "/audio/hourensou/q1.wav",
      "/",
    ]) {
      expect(isLoginOnly(pathname), pathname).toBe(false);
      const { assets, requests } = fakeAssets();
      const { askApp, asked } = askWith(() => new Response(null, { status: 404 }));
      expect(await serveLoginOnly(req(pathname), assets, askApp), pathname).toBeNull();
      expect(requests.length + asked.length, pathname).toBe(0);
    }
  });

  it("クッキーは 名前だけを 読む", () => {
    expect(cookieNames(null)).toEqual([]);
    expect(cookieNames(`a=1; ${SESSION}=x=y;  b = 2 ;`)).toEqual([
      { name: "a" },
      { name: SESSION },
      { name: "b" },
    ]);
  });
});

describe("ログインの クッキーが ある → 配信の 応答を そのまま 返す", () => {
  const login = `nexmax.ready=1; ${SESSION}=token`;

  it("見出し（Cache-Control など）も 変えず、アプリには たずねない", async () => {
    const headers = {
      "Content-Type": "text/html",
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: '"abc"',
    };
    const { assets, requests } = fakeAssets(() => new Response("game", { headers }));
    const { askApp, asked } = askWith(withLogin.run);
    const response = await serveLoginOnly(req(GAME, { cookie: login }), assets, askApp);
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("game");
    expect(Object.fromEntries(response!.headers)).toEqual(Object.fromEntries(new Headers(headers)));
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([GAME]);
    expect(asked).toHaveLength(0);
  });

  it("分けて 置かれた クッキー（.0 .1）でも 配る", async () => {
    const { assets } = fakeAssets();
    const cookie = `${SESSION}.0=part1; ${SESSION}.1=part2`;
    const { askApp } = askWith(withLogin.run);
    expect((await serveLoginOnly(req(GAME, { cookie }), assets, askApp))?.status).toBe(200);
  });

  it("取り直しの 問い合わせ（If-None-Match）は そのまま 渡し、304 も そのまま 返す", async () => {
    const { assets, requests } = fakeAssets((request) =>
      request.headers.get("If-None-Match") === '"abc"'
        ? new Response(null, { status: 304, headers: { ETag: '"abc"' } })
        : new Response("game"),
    );
    const { askApp } = askWith(withLogin.run);
    const request = req(GAME, { cookie: login, headers: { "If-None-Match": '"abc"' } });
    const response = await serveLoginOnly(request, assets, askApp);
    expect(response?.status).toBe(304);
    expect(requests[0]?.headers.get("If-None-Match")).toBe('"abc"');
  });

  it("配信の 転送（index.html → フォルダ）は そのまま 返す", async () => {
    const { assets } = fakeAssets(
      () => new Response(null, { status: 307, headers: { Location: "/tools/kuuki-yomi/" } }),
    );
    const { askApp } = askWith(withLogin.run);
    const response = await serveLoginOnly(req(GAME, { cookie: login }), assets, askApp);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe("/tools/kuuki-yomi/");
  });

  it("ファイルが 無ければ（404）アプリ本体へ 回す", async () => {
    const { assets } = fakeAssets(() => new Response("not found", { status: 404 }));
    const { askApp } = askWith(withLogin.run);
    const request = req("/tools/kuuki-yomi/nai.js", { cookie: login });
    expect(await serveLoginOnly(request, assets, askApp)).toBeNull();
  });
});

describe("クッキーが 無い・ログインが 要る 環境 → 最初の 画面へ 307", () => {
  /** middleware が 同じ 道を 返す 先（`/?next=<元の 道>`）。 */
  async function middlewareLocation(pathname: string) {
    const response = await withLogin.run(req(pathname));
    expect(response.status).toBe(307);
    return response.headers.get("Location");
  }

  for (const pathname of [
    GAME,
    "/tools/kuuki-yomi",
    "/tools/kuuki-yomi/",
    "/tools/kuuki-yomi/js/main.js",
  ]) {
    it(`${pathname} は middleware と 同じ 先へ 返し、ファイルは 渡さない`, async () => {
      const { assets, requests } = fakeAssets();
      const { askApp } = askWith(withLogin.run);
      const response = await serveLoginOnly(req(pathname), assets, askApp);
      expect(response?.status).toBe(307);
      const location = response?.headers.get("Location") ?? "";
      expect(location).toBe(await middlewareLocation(pathname));
      expect(new URL(location).searchParams.get("next")).toBe(pathname);
      expect(requests).toHaveLength(0);
    });
  }

  it("ログインと 関係の ない クッキーだけでは 通らない", async () => {
    const { assets, requests } = fakeAssets();
    const { askApp } = askWith(withLogin.run);
    const cookie = `nexmax.ready=1; nexmax.register=1; theme=${SESSION}`;
    expect((await serveLoginOnly(req(GAME, { cookie }), assets, askApp))?.status).toBe(307);
    expect(requests).toHaveLength(0);
  });

  it("絵の ファイルも 返す（middleware は 絵を 見ないが、たずねる 道は 絵で ない）", async () => {
    const pathname = "/tools/kuuki-yomi/img/a.png";
    expect(watchedByMiddleware(pathname)).toBe(false);
    const { assets, requests } = fakeAssets();
    const { askApp } = askWith(withLogin.run);
    expect((await serveLoginOnly(req(pathname), assets, askApp))?.status).toBe(307);
    expect(requests).toHaveLength(0);
  });

  it("作り直しの 合図を 付けた HEAD も 返す（middleware の 作り直し用の 抜け道は 使えない）", async () => {
    const { assets, requests } = fakeAssets();
    const { askApp } = askWith(withLogin.run);
    const request = req(GAME, {
      method: "HEAD",
      headers: { "x-prerender-revalidate": "guess", "x-isr": "1" },
    });
    expect((await serveLoginOnly(request, assets, askApp))?.status).toBe(307);
    expect(requests).toHaveLength(0);
  });

  it("たずねるのは クッキーなしの HEAD で、middleware が 必ず 見る 道", async () => {
    const { assets } = fakeAssets();
    const { askApp, asked } = askWith(withLogin.run);
    await serveLoginOnly(req(GAME, { cookie: "nexmax.ready=1" }), assets, askApp);
    expect(asked).toHaveLength(1);
    const probe = asked[0]!;
    const { pathname } = new URL(probe.url);
    expect(probe.method).toBe("HEAD");
    expect(probe.headers.get("Cookie")).toBeNull();
    expect(pathname).toBe(`/tools/kuuki-yomi/${LOGIN_CHECK_NAME}`);
    expect(pathname.endsWith("/")).toBe(false);
    expect(watchedByMiddleware(pathname)).toBe(true);
  });

  it("たずねる 道に next.config の 転送が かからない", () => {
    // middleware より 先に 転送が かかると、転送は 閉じる 側に 倒すので、デモモードでも
    // 最初の 画面へ 返して しまう
    const text = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf-8");
    const sources = [...text.matchAll(/source:\s*"([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter((source) => source.startsWith("/tools"))).toEqual([]);
  });
});

describe("クッキーが 無い・デモモード（Supabase の 設定なし）→ 止めずに 配る", () => {
  it("middleware が 通すので、入口が そのまま 配る", async () => {
    const { assets, requests } = fakeAssets();
    const { askApp, asked } = askWith(demo.run);
    const response = await serveLoginOnly(req(GAME), assets, askApp);
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("game");
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([GAME]);
    expect(asked).toHaveLength(1);
  });

  it("フォルダの URL（末尾 /）も 入口が 配る（OpenNext に 回すと 転送を くり返す）", async () => {
    const { assets, requests } = fakeAssets();
    const { askApp } = askWith(demo.run);
    const response = await serveLoginOnly(req("/tools/kuuki-yomi/"), assets, askApp);
    expect(response?.status).toBe(200);
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(["/tools/kuuki-yomi/"]);
  });

  it("アプリが「無い」（404）と 答えたときも 通されたと みなす（OpenNext の ふつうの 答え）", async () => {
    const { assets } = fakeAssets();
    const { askApp } = askWith(() => new Response(null, { status: 404 }));
    expect((await serveLoginOnly(req(GAME), assets, askApp))?.status).toBe(200);
  });
});

describe("答えが 分からない ときは 閉じる（最初の 画面へ 返す）", () => {
  const answers: [string, () => Promise<Response> | Response][] = [
    ["別の 転送（308）", () => new Response(null, { status: 308, headers: { Location: "/x" } })],
    ["エラー（500）", () => new Response("error", { status: 500 })],
    ["拒否（401）", () => new Response(null, { status: 401 })],
    [
      "例外",
      () => {
        throw new Error("down");
      },
    ],
  ];
  for (const [label, answer] of answers) {
    it(label, async () => {
      const { assets, requests } = fakeAssets();
      const { askApp } = askWith(answer);
      expect((await serveLoginOnly(req(GAME), assets, askApp))?.status).toBe(307);
      expect(requests).toHaveLength(0);
    });
  }
});

describe("設定と そろって いる", () => {
  /** wrangler.jsonc の run_worker_first（コメントを 外さずに 読める 形で 書いて ある）。 */
  function runWorkerFirst(): string[] {
    const text = fs.readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf-8");
    const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(text)?.[1] ?? "";
    return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
  }

  it("ログインの 内側の フォルダは、Worker を 先に 通す 道に `/道` と `/道/*` の 両方が ある", () => {
    const patterns = runWorkerFirst();
    for (const dir of LOGIN_ONLY_DIRS) {
      expect(patterns, dir).toContain(dir);
      expect(patterns, `${dir}/*`).toContain(`${dir}/*`);
    }
  });

  it("ほかの /tools/* は Worker を 通さない（これまでどおり ログインなしで 開ける）", () => {
    const tools = runWorkerFirst().filter((p) => p.startsWith("/tools"));
    const allowed = LOGIN_ONLY_DIRS.flatMap((dir) => [dir, `${dir}/*`]);
    expect(tools.sort()).toEqual([...allowed].sort());
  });

  it("public/_headers に この 道の 規則が 無い（Worker を 通した 応答には 効かない）", () => {
    // 規則を 足すと、書いたのに 効かない 見出しが できる。付けるなら serveLoginOnly で 付ける
    const text = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf-8");
    const rules = text
      .split("\n")
      .filter((line) => line.startsWith("/"))
      .map((line) => line.trim());
    expect(rules.length).toBeGreaterThan(0);
    const toRegExp = (rule: string) =>
      new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    const hits = rules.filter((rule) =>
      LOGIN_ONLY_DIRS.some((dir) => toRegExp(rule).test(`${dir}/index.html`)),
    );
    expect(hits).toEqual([]);
  });

  it("入口は ログインの 内側の 道を serveLoginOnly へ 回し、配らなければ アプリ本体へ 回す", () => {
    const text = fs.readFileSync(path.join(ROOT, "worker.mjs"), "utf-8");
    expect(text).toContain('from "./src/lib/login-only-assets.ts"');
    expect(text).toContain("const askApp = (probe) => openNext.fetch(probe, env, ctx);");
    expect(text).toContain("const response = await serveLoginOnly(request, env.ASSETS, askApp);");
    expect(text).toContain("return openNext.fetch(request, env, ctx);");
  });

  const dirs = LOGIN_ONLY_DIRS.map((dir) => path.join(ROOT, "public", dir)).filter((dir) =>
    fs.existsSync(dir),
  );
  it.skipIf(dirs.length === 0)(
    "ログインの 内側の フォルダに 絵を 置いて いない（/_next/image が ログインなしで 返す）",
    () => {
      const files = dirs.flatMap((dir) =>
        fs
          .readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => path.join(entry.parentPath, entry.name)),
      );
      expect(files.length).toBeGreaterThan(0);
      const images = files.filter((file) => /\.(?:svg|png|jpe?g|gif|webp|avif|ico)$/i.test(file));
      expect(images, "絵は ログインの 外に 置くか、配り方を 考え直す").toEqual([]);
    },
  );
});
