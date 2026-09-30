import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MEDIA_CACHE_CONTROL,
  READ_CHUNK,
  mediaPrefix,
  parseRange,
  serveMedia,
  type AssetsBinding,
} from "@/lib/media-range";
import { MEDIA_SIZES } from "@/content/media-sizes.generated";

/**
 * 教材の 音・動画を 途中から 送る（206）見張り。
 * 配信の 静的アセットが Range を 無視する（200＋全体）ので、Worker で 切り出して いる。
 * 理由は src/lib/media-range.ts の 冒頭・docs/deploy.md §0.17。
 */

const ROOT = process.cwd();
const ETAG = '"abc123"';

/** 0,1,2,… と 並ぶ 中身（どこを 切り出したかを 値で 確かめられる）。 */
function makeFile(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = i % 251;
  return bytes;
}

const CLIP = "/video/hourensou/clip.mp4";

/**
 * 静的アセットの 偽物。本物と 同じく **Range を 無視して 200＋全体**を 返し、
 * **Content-Length を 付けない**（asset-worker が 付けるのは ETag・Content-Type・
 * Cache-Control・CF-Cache-Status だけ。束縛ごしでは 長さの 見出しも 生まれない）。
 * 大きさは 焼いた 表（`sizes`）で 渡す。中身は `chunk` バイトずつ 届く（本物の 細切れを
 * まねる）。どこまで 読まれたかを 数える。
 */
function fakeAssets(file: Uint8Array, { chunk = 4096, contentLength = false } = {}) {
  const stats = { pulledBytes: 0, cancelled: false };
  const assets: AssetsBinding = {
    async fetch(request) {
      if (new URL(request.url).pathname !== CLIP) {
        return new Response("not found", { status: 404 });
      }
      const headers = new Headers({ ETag: ETAG, "Content-Type": "video/mp4" });
      if (contentLength) headers.set("Content-Length", String(file.byteLength));
      if (request.headers.get("If-None-Match") === ETAG) {
        return new Response(null, { status: 304, headers });
      }
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      let offset = 0;
      const body = new ReadableStream({
        type: "bytes",
        pull(controller: ReadableByteStreamController) {
          if (offset >= file.byteLength) {
            controller.close();
            controller.byobRequest?.respond(0);
            return;
          }
          const next = file.slice(offset, offset + chunk);
          offset += next.byteLength;
          stats.pulledBytes += next.byteLength;
          controller.enqueue(next);
        },
        cancel() {
          stats.cancelled = true;
        },
      });
      return new Response(body, { status: 200, headers });
    },
  };
  const sizes: Record<string, number> = { [CLIP]: file.byteLength };
  return { assets, stats, sizes };
}

const get = (range?: string, extra: Record<string, string> = {}) =>
  new Request(`https://academy.example${CLIP}?v=1`, {
    headers: { ...(range ? { Range: range } : {}), ...extra },
  });

async function bytesOf(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

/** 中身を まとめて 比べる（大きな 配列を toEqual で 1つずつ 比べると 遅い）。 */
async function expectBody(response: Response, expected: Uint8Array) {
  const sent = Buffer.from(await bytesOf(response));
  expect(sent.byteLength).toBe(expected.byteLength);
  expect(sent.equals(Buffer.from(expected))).toBe(true);
}

describe("parseRange（Range の 読み取り）", () => {
  it.each([
    ["bytes=0-1", 100, { start: 0, end: 1 }],
    ["bytes=10-", 100, { start: 10, end: 99 }],
    ["bytes=90-500", 100, { start: 90, end: 99 }],
    ["bytes=-30", 100, { start: 70, end: 99 }],
    ["bytes=-500", 100, { start: 0, end: 99 }],
    ["BYTES=5-6", 100, { start: 5, end: 6 }],
  ])("%s（大きさ %d）→ %o", (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected);
  });

  it.each([
    [null],
    ["bytes=0-1,5-6"], // 複数は 全体で 返す
    ["items=0-1"],
    ["bytes=5-2"], // 形が くずれて いる
    ["bytes=-"],
    ["bytes=a-b"],
  ])("%s は 読まない（全体を 送る）", (header) => {
    expect(parseRange(header, 100)).toBeNull();
  });

  it.each([["bytes=100-"], ["bytes=150-200"], ["bytes=-0"]])(
    "%s は ファイルの 外（416）",
    (header) => {
      expect(parseRange(header, 100)).toBe("unsatisfiable");
    },
  );
});

describe("mediaPrefix（Worker が 横取りする 道）", () => {
  it.each([
    ["/audio/hourensou/renraku.wav", "/audio/"],
    ["/video/hourensou/soudan_skit.mp4", "/video/"],
    ["/audio", null],
    ["/audiox/a.wav", null],
    ["/img/a.webp", null],
    ["/houkoku/listening", null],
  ])("%s → %s", (pathname, expected) => {
    expect(mediaPrefix(pathname)).toBe(expected);
  });
});

/**
 * Workers には `readAtLeast`（まとめ読み）と `FixedLengthStream`（長さの 決まった 流れ）が
 * あり、Node には 無い。どちらの 道でも 同じ 中身が 出る ことを 確かめる。
 * 偽物は Workers の ふるまい（「少なくとも N バイト 読むまで 待つ」「長さが ちがえば 失敗」）を まねる。
 */
const workersLike = {
  install() {
    const proto = ReadableStreamBYOBReader.prototype as unknown as Record<string, unknown>;
    proto.readAtLeast = async function (
      this: ReadableStreamBYOBReader,
      minBytes: number,
      view: Uint8Array<ArrayBuffer>,
    ) {
      workersLike.readAtLeastCalls++;
      // 読むと 箱が 取り上げられ、元の view の 長さは 0 に なる。先に 控えて おく
      const { byteOffset, byteLength } = view;
      let buffer = view.buffer;
      let filled = 0;
      while (filled < minBytes) {
        const { value, done } = await this.read(
          new Uint8Array(buffer, byteOffset + filled, byteLength - filled),
        );
        buffer = value!.buffer;
        filled += value!.byteLength;
        if (done) return { value: new Uint8Array(buffer, byteOffset, filled), done: true };
      }
      return { value: new Uint8Array(buffer, byteOffset, filled), done: false };
    };
    (globalThis as Record<string, unknown>).FixedLengthStream = class extends TransformStream<
      Uint8Array,
      Uint8Array
    > {
      constructor(expected: number) {
        let seen = 0;
        super({
          transform(chunk, controller) {
            seen += chunk.byteLength;
            if (seen > expected) throw new Error("FixedLengthStream: 長すぎる");
            controller.enqueue(chunk);
          },
          flush() {
            if (seen !== expected) throw new Error(`FixedLengthStream: ${seen}≠${expected}`);
          },
        });
      }
    };
  },
  uninstall() {
    delete (ReadableStreamBYOBReader.prototype as unknown as Record<string, unknown>).readAtLeast;
    delete (globalThis as Record<string, unknown>).FixedLengthStream;
  },
  readAtLeastCalls: 0,
};

describe.each([
  ["Node（readAtLeast なし）", false],
  ["Workers と 同じ 道（readAtLeast・FixedLengthStream あり）", true],
])("serveMedia — %s", (_label, likeWorkers) => {
  beforeEach(() => {
    workersLike.readAtLeastCalls = 0;
    if (likeWorkers) workersLike.install();
  });
  afterEach(() => {
    if (likeWorkers) workersLike.uninstall();
  });

  // 4KB の 細切れで 13個ぶん（境目を またぐ 切り出しを 確かめる）
  const file = makeFile(50_000);

  it("Range が 無ければ 200＋全体。途中から 送れる ことと キャッシュの 決まりを 足す", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(get(), assets, "/video/", sizes);
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Cache-Control")).toBe(MEDIA_CACHE_CONTROL["/video/"]);
    await expectBody(res, file);
  });

  it("途中の 範囲（bytes=1000-1999）は 206 で その ぶんだけ（細切れの 境目を またぐ）", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(get("bytes=1000-1999"), assets, "/video/", sizes);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 1000-1999/${file.byteLength}`);
    expect(res.headers.get("Content-Length")).toBe("1000");
    await expectBody(res, file.slice(1000, 2000));
  });

  it("Chrome の 最初の 頼み方（bytes=0-）は 206＋全体", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(get("bytes=0-"), assets, "/video/", sizes);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 0-${file.byteLength - 1}/${file.byteLength}`,
    );
    await expectBody(res, file);
  });

  it("つまみで 動かした 先から 最後まで（bytes=N-）", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(get("bytes=12345-"), assets, "/video/", sizes);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Length")).toBe(String(file.byteLength - 12345));
    await expectBody(res, file.slice(12345));
  });

  it("末尾から（bytes=-300）", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(get("bytes=-300"), assets, "/video/", sizes);
    expect(res.status).toBe(206);
    await expectBody(res, file.slice(-300));
  });

  it("Safari の 最初の 頼み方（bytes=0-1）は 2バイトだけ。残りは 読まずに 止める", async () => {
    const { assets, stats, sizes } = fakeAssets(file);
    const res = await serveMedia(get("bytes=0-1"), assets, "/video/", sizes);
    expect(res.status).toBe(206);
    await expectBody(res, file.slice(0, 2));
    expect(stats.cancelled).toBe(true);
    expect(stats.pulledBytes).toBeLessThan(file.byteLength);
  });

  it("ファイルの 外は 416（Content-Range: bytes */大きさ）。1年の キャッシュや 種類を 残さない", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(get(`bytes=${file.byteLength}-`), assets, "/video/", sizes);
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${file.byteLength}`);
    expect(res.headers.get("Cache-Control")).toBeNull();
    expect(res.headers.get("Content-Type")).toBeNull();
  });

  it("複数の 範囲は 全体を 200 で", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(get("bytes=0-1,5-6"), assets, "/video/", sizes);
    expect(res.status).toBe(200);
    await expectBody(res, file);
  });

  it("If-Range が 手もとの 版と ちがえば 全体、同じなら 途中から", async () => {
    const { assets, sizes } = fakeAssets(file);
    const stale = await serveMedia(
      get("bytes=10-19", { "If-Range": '"old"' }),
      assets,
      "/video/",
      sizes,
    );
    expect(stale.status).toBe(200);
    const fresh = await serveMedia(
      get("bytes=10-19", { "If-Range": ETAG }),
      fakeAssets(file).assets,
      "/video/",
      sizes,
    );
    expect(fresh.status).toBe(206);
    await expectBody(fresh, file.slice(10, 20));
  });

  it("大きさの 表に 無い ときは これまでどおり 200＋全体。途中から 送れるとは 名乗らない", async () => {
    // 名乗ると ブラウザが 途中からを 頼み、動かす たびに 全体を 取り直す（見た目だけ 直る）
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get("bytes=10-19"), assets, "/video/", {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe(MEDIA_CACHE_CONTROL["/video/"]);
    await expectBody(res, file);
  });

  it("配信元が いつか Content-Length を 付けたら、表に 無くても そちらで 206", async () => {
    const { assets } = fakeAssets(file, { contentLength: true });
    const res = await serveMedia(get("bytes=10-19"), assets, "/video/", {});
    expect(res.status).toBe(206);
    await expectBody(res, file.slice(10, 20));
  });
});

describe("serveMedia — 中身の 無い 応答", () => {
  const file = makeFile(1000);

  it("HEAD は 見出しだけ（途中から 送れる ことと 大きさを 知らせる）", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(
      new Request(`https://academy.example${CLIP}`, { method: "HEAD" }),
      assets,
      "/video/",
      sizes,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Length")).toBe(String(file.byteLength));
    expect(res.body).toBeNull();
  });

  it("304 には キャッシュの 決まりを 付ける（手もとの ものを 使いつづけられる）", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(
      get(undefined, { "If-None-Match": ETAG }),
      assets,
      "/audio/",
      sizes,
    );
    expect(res.status).toBe(304);
    expect(res.headers.get("Cache-Control")).toBe(MEDIA_CACHE_CONTROL["/audio/"]);
  });

  it("404 は そのまま（長い キャッシュを 付けない。入口が アプリ本体へ 回す）", async () => {
    const { assets, sizes } = fakeAssets(file);
    const res = await serveMedia(
      new Request("https://academy.example/video/nothing.mp4"),
      assets,
      "/video/",
      sizes,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });
});

describe("CPU を 使わない（無料枠は 1リクエスト 10ms）", () => {
  beforeEach(() => {
    workersLike.readAtLeastCalls = 0;
    workersLike.install();
  });
  afterEach(() => workersLike.uninstall());

  it("7MB の 動画の 途中から 送っても、JS で 読むのは 1MB ずつ（4KB の 細切れ ごとに 回さない）", async () => {
    const file = makeFile(7_000_000);
    const { assets, sizes } = fakeAssets(file, { chunk: 4096 });
    const res = await serveMedia(get("bytes=5000000-"), assets, "/video/", sizes);
    expect(res.status).toBe(206);
    await expectBody(res, file.subarray(5_000_000));
    // 細切れ ごとなら 1700回を 超える。1MB ずつなら 読み捨て 5回＋送る 2回（＋終わりの 確かめ）
    // 0回（＝Workers の まとめ読みを 通って いない）でも 上限以下には なるので、下も 見る
    expect(workersLike.readAtLeastCalls).toBeGreaterThan(0);
    expect(workersLike.readAtLeastCalls).toBeLessThanOrEqual(
      Math.ceil(5_000_000 / READ_CHUNK) + Math.ceil(2_000_000 / READ_CHUNK) + 2,
    );
  });
});

describe("大きさの 表（src/content/media-sizes.generated.ts）は 実物と 同じ", () => {
  /** public/audio・public/video の 実物（見えない ファイルは 配らないので 除く）。 */
  function actualSizes(): Record<string, number> {
    const out: Record<string, number> = {};
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith(".")) continue;
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else
          out[`/${path.relative(path.join(ROOT, "public"), full).split(path.sep).join("/")}`] =
            fs.statSync(full).size;
      }
    };
    for (const root of Object.keys(MEDIA_CACHE_CONTROL)) {
      const dir = path.join(ROOT, "public", root);
      if (fs.existsSync(dir)) walk(dir);
    }
    return out;
  }

  it("1本ずつ 大きさが 合って いて、足りない ものも 余る ものも 無い", () => {
    // 食いちがうと Content-Range が うそに なり、再生が 途中で 壊れる。
    // 落ちたら `npm run gen:content` を 回して media-sizes.generated.ts を 入れる
    const actual = actualSizes();
    expect(Object.keys(actual).length).toBeGreaterThan(0);
    const wrong = Object.keys({ ...actual, ...MEDIA_SIZES })
      .filter((url) => actual[url] !== MEDIA_SIZES[url])
      .map((url) => `${url}: 表=${MEDIA_SIZES[url] ?? "なし"} 実物=${actual[url] ?? "なし"}`);
    expect(wrong, "npm run gen:content で 作り直す").toEqual([]);
  });
});

describe("設定と そろって いる", () => {
  it("Cache-Control は public/_headers と 同じ（Worker を 通すと _headers が 効かない）", () => {
    const text = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf-8");
    for (const [prefix, value] of Object.entries(MEDIA_CACHE_CONTROL)) {
      const block = new RegExp(`^${prefix}\\*\\n\\s+Cache-Control:\\s*(.+)$`, "m").exec(text);
      expect(block?.[1]?.trim(), `${prefix}* の Cache-Control`).toBe(value);
    }
  });

  it("wrangler.jsonc は 入口に worker.mjs を 使い、音・動画だけ Worker を 先に 通す", () => {
    const text = fs.readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf-8");
    expect(/"main":\s*"([^"]+)"/.exec(text)?.[1]).toBe("worker.mjs");
    const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(text)?.[1] ?? "";
    const patterns = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(patterns.sort()).toEqual(Object.keys(MEDIA_CACHE_CONTROL).map((p) => `${p}*`));
  });

  it("入口は OpenNext を 包み、音・動画を serveMedia へ 回す", () => {
    const text = fs.readFileSync(path.join(ROOT, "worker.mjs"), "utf-8");
    expect(text).toContain('from "./.open-next/worker.js"');
    expect(text).toContain("serveMedia(");
  });
});
