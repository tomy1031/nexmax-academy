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

/**
 * 静的アセットの 偽物。本物と 同じく **Range を 無視して 200＋全体**を 返す。
 * 中身は `chunk` バイトずつ 届く（本物の 細切れを まねる）。どこまで 読まれたかを 数える。
 */
function fakeAssets(file: Uint8Array, { chunk = 4096, contentLength = true } = {}) {
  const stats = { pulledBytes: 0, cancelled: false };
  const assets: AssetsBinding = {
    async fetch(request) {
      if (!new URL(request.url).pathname.endsWith("/clip.mp4")) {
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
  return { assets, stats };
}

const get = (range?: string, extra: Record<string, string> = {}) =>
  new Request("https://academy.example/video/hourensou/clip.mp4?v=1", {
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
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get(), assets, "/video/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Cache-Control")).toBe(MEDIA_CACHE_CONTROL["/video/"]);
    await expectBody(res, file);
  });

  it("途中の 範囲（bytes=1000-1999）は 206 で その ぶんだけ（細切れの 境目を またぐ）", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get("bytes=1000-1999"), assets, "/video/");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 1000-1999/${file.byteLength}`);
    expect(res.headers.get("Content-Length")).toBe("1000");
    await expectBody(res, file.slice(1000, 2000));
  });

  it("Chrome の 最初の 頼み方（bytes=0-）は 206＋全体", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get("bytes=0-"), assets, "/video/");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 0-${file.byteLength - 1}/${file.byteLength}`,
    );
    await expectBody(res, file);
  });

  it("つまみで 動かした 先から 最後まで（bytes=N-）", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get("bytes=12345-"), assets, "/video/");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Length")).toBe(String(file.byteLength - 12345));
    await expectBody(res, file.slice(12345));
  });

  it("末尾から（bytes=-300）", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get("bytes=-300"), assets, "/video/");
    expect(res.status).toBe(206);
    await expectBody(res, file.slice(-300));
  });

  it("Safari の 最初の 頼み方（bytes=0-1）は 2バイトだけ。残りは 読まずに 止める", async () => {
    const { assets, stats } = fakeAssets(file);
    const res = await serveMedia(get("bytes=0-1"), assets, "/video/");
    expect(res.status).toBe(206);
    await expectBody(res, file.slice(0, 2));
    expect(stats.cancelled).toBe(true);
    expect(stats.pulledBytes).toBeLessThan(file.byteLength);
  });

  it("ファイルの 外は 416（Content-Range: bytes */大きさ）", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get(`bytes=${file.byteLength}-`), assets, "/video/");
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${file.byteLength}`);
  });

  it("複数の 範囲は 全体を 200 で", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get("bytes=0-1,5-6"), assets, "/video/");
    expect(res.status).toBe(200);
    await expectBody(res, file);
  });

  it("If-Range が 手もとの 版と ちがえば 全体、同じなら 途中から", async () => {
    const stale = await serveMedia(
      get("bytes=10-19", { "If-Range": '"old"' }),
      fakeAssets(file).assets,
      "/video/",
    );
    expect(stale.status).toBe(200);
    const fresh = await serveMedia(
      get("bytes=10-19", { "If-Range": ETAG }),
      fakeAssets(file).assets,
      "/video/",
    );
    expect(fresh.status).toBe(206);
    await expectBody(fresh, file.slice(10, 20));
  });

  it("長さが 分からない ときは これまでどおり 全体（範囲を 決められない）", async () => {
    const { assets } = fakeAssets(file, { contentLength: false });
    const res = await serveMedia(get("bytes=10-19"), assets, "/video/");
    expect(res.status).toBe(200);
    await expectBody(res, file);
  });
});

describe("serveMedia — 中身の 無い 応答", () => {
  const file = makeFile(1000);

  it("HEAD は 見出しだけ（途中から 送れる ことを 知らせる）", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(
      new Request("https://academy.example/video/hourensou/clip.mp4", { method: "HEAD" }),
      assets,
      "/video/",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.body).toBeNull();
  });

  it("304 には キャッシュの 決まりを 付ける（手もとの ものを 使いつづけられる）", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(get(undefined, { "If-None-Match": ETAG }), assets, "/audio/");
    expect(res.status).toBe(304);
    expect(res.headers.get("Cache-Control")).toBe(MEDIA_CACHE_CONTROL["/audio/"]);
  });

  it("404 は そのまま（長い キャッシュを 付けない。入口が アプリ本体へ 回す）", async () => {
    const { assets } = fakeAssets(file);
    const res = await serveMedia(
      new Request("https://academy.example/video/nothing.mp4"),
      assets,
      "/video/",
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
    const { assets } = fakeAssets(file, { chunk: 4096 });
    const res = await serveMedia(get("bytes=5000000-"), assets, "/video/");
    expect(res.status).toBe(206);
    await expectBody(res, file.subarray(5_000_000));
    // 細切れ ごとなら 1700回を 超える。1MB ずつなら 読み捨て 5回＋送る 2回（＋終わりの 確かめ）
    expect(workersLike.readAtLeastCalls).toBeLessThanOrEqual(
      Math.ceil(5_000_000 / READ_CHUNK) + Math.ceil(2_000_000 / READ_CHUNK) + 2,
    );
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
