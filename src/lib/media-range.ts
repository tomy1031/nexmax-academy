/**
 * 教材の 音と 動画を「途中から」送る（HTTP Range・206）— 2026-09-30
 *
 * ## なぜ 要るか
 * Cloudflare Workers の 静的アセットは `Range: bytes=…` を 無視して、いつも
 * **200＋全体**を 返す（`Accept-Ranges` も 付かない。本番・STG で 実測。配信の
 * 中身〔workers-shared の asset-worker〕にも Range の 処理が 無い）。
 * - Chrome・Edge は これを「位置を 動かせない 音・動画」と みなし、つまみを
 *   動かしても 0秒に 戻す（`seekable` = `[0,0]`。学習者の 大半が Windows の Chrome）。
 * - iPhone の Safari は 配信側が Range に 応える ことを 前提に している（Apple の
 *   要件）。応えないと 再生そのものに 失敗する ことが ある。
 *
 * そこで `/audio/*` と `/video/*` だけ Worker を 先に 通し（`wrangler.jsonc` の
 * `assets.run_worker_first`・入口は `worker.mjs`）、ここで 切り出して 206 を 返す。
 *
 * ## CPU を 使わない（無料枠は 1リクエスト 10ms。docs/deploy.md §0.13）
 * - 全体（Chrome の 最初の `bytes=0-`）は 中身に 触らず そのまま 流す。
 * - 途中からの ときは、手前を **1MB ずつ まとめて** 読み捨て、送る ぶんも 1MB ずつ
 *   流す。届いた 細切れ（数KB）ごとに JS を 回すと、7MB の 動画で 千回を 超える。
 *   まとめ読みは Workers だけに ある `readAtLeast` を 使う（無い 所＝テストの Node
 *   では ふつうの BYOB 読みを くり返す）。
 *
 * ## ファイルの 大きさは 焼いた 表から 引く
 * `env.ASSETS.fetch` の 応答には **Content-Length が 付かない**（asset-worker が 付けるのは
 * ETag・Content-Type・Cache-Control・CF-Cache-Status だけで、束縛ごしでは 長さの 見出しも
 * 生まれない。2026-09-30 に workerd で 確認）。大きさが 無いと `bytes=N-` の 終わりも
 * `Content-Range` の 全体も 書けないので、`npm run gen:content` が 焼く
 * `MEDIA_FILES`（src/content/media-files.generated.ts）を 使う。
 *
 * **表の 大きさは、配信の ETag が 表と 合う ときだけ 信じる。** 表が 古い（差しかえた
 * のに 焼き直して いない）まま 出ると、うその Content-Range で 再生が 途中で 壊れる——
 * 今より 悪い。ETag は wrangler が 中身から 作る 名札で、同じ 計算を 表に 焼いて ある
 * （scripts/lib/asset_etag.mjs）。合わない・表に 無い ときは これまでどおり 全体を 200 で
 * 送り、途中から 送れるとは 名乗らない。表と 実物の 食いちがいは テストも 1本ずつ 止める。
 *
 * ## `_headers` の Cache-Control を ここでも 付ける
 * Worker を 通した 応答には `_headers` が 効かない（Cloudflare の 資料）。付け忘れると
 * 開くたびに 取り直しに なり、教室の 細い 回線を 食う。値は `public/_headers` と
 * 同じに する（`tests/media_range.test.ts` が 突き合わせる）。
 */

// `@/` は 使わない——worker.mjs を 束ねる wrangler は tsconfig の paths を 知らない
import { MEDIA_FILES } from "../content/media-files.generated";

/** Worker を 先に 通す 道と、その Cache-Control（`public/_headers` と 同じ 値）。 */
export const MEDIA_CACHE_CONTROL = {
  "/audio/": "public,max-age=31536000,immutable",
  "/video/": "public,max-age=86400,stale-while-revalidate=604800",
} as const;

export type MediaPrefix = keyof typeof MEDIA_CACHE_CONTROL;

/** まとめて 読む 大きさ。これで 7MB の 読み捨ても 7回で 済む。 */
export const READ_CHUNK = 1024 * 1024;

/** 道 → [大きさ（バイト）, 配信の ETag の 先頭]（`MEDIA_FILES` と 同じ 形）。 */
export type MediaFiles = Readonly<Record<string, readonly [size: number, etag: string]>>;

/** 教材の 音・動画の 道なら その 頭（`/audio/` か `/video/`）、ちがえば `null`。 */
export function mediaPrefix(pathname: string): MediaPrefix | null {
  for (const prefix of Object.keys(MEDIA_CACHE_CONTROL) as MediaPrefix[]) {
    if (pathname.startsWith(prefix)) return prefix;
  }
  return null;
}

export type ByteRange = { start: number; end: number };

/**
 * `Range` を 読む（RFC 9110 §14.1.2。`end` は ふくむ）。
 * - `null` … 読まない（無い・bytes 以外・複数・形が くずれて いる）→ 全体を 200 で 返す
 * - `"unsatisfiable"` … 範囲が ファイルの 外 → 416
 */
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  // 複数の 範囲（`,` 入り）も ここで 外れる——まとめて 返す 形は 作らず、全体を 送る
  const matched = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!matched) return null;
  const [, first = "", last = ""] = matched;
  if (first === "" && last === "") return null;

  if (first === "") {
    // 末尾から N バイト（`bytes=-500`）
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(first);
  // 終わりが 始まりより 前（`bytes=5-2`）は 形が くずれて いる。終わりを 省いた
  // （`bytes=N-`）ときは ここで 比べない——N が 大きさ以上なら 下で 416 に する
  if (last !== "" && Number(last) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end: last === "" ? size - 1 : Math.min(Number(last), size - 1) };
}

/** `ASSETS` の 束縛（`env.ASSETS`）。テストでは 偽物を 渡す。 */
export type AssetsBinding = { fetch(request: Request): Promise<Response> };

/**
 * 音・動画を 返す。`Range` が あれば その ぶんだけ 206 で、無ければ 全体を 200 で。
 * 404 など 中身の 無い 応答は そのまま 返す（呼ぶ 側が アプリ本体へ 回す）。
 * `files` は テストが 差しかえる ための もの（ふだんは 焼いた 表）。
 */
export async function serveMedia(
  request: Request,
  assets: AssetsBinding,
  prefix: MediaPrefix,
  files: MediaFiles = MEDIA_FILES,
): Promise<Response> {
  const upstream = await assets.fetch(request);
  // 404 に 長い キャッシュを 付けない。付けて よいのは 中身が ある とき（と 304）だけ
  if (upstream.status !== 200 && upstream.status !== 206 && upstream.status !== 304) {
    return upstream;
  }

  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", MEDIA_CACHE_CONTROL[prefix]);
  const pass = (status: number, body: ReadableStream<Uint8Array> | null) =>
    new Response(body, { status, headers });

  // 配信元が 自分で 切った（206）・304 は 見出しだけ 足して 返す
  if (upstream.status !== 200) return pass(upstream.status, upstream.body);

  // 大きさが 分からないと 範囲を 決められない——これまでどおり 全体を 送り、
  // 途中から 送れるとは 名乗らない（名乗ると ブラウザが 途中からを 頼み、毎回 全体を 取り直す）
  const size = sizeOf(request, upstream, files);
  if (size === null) return pass(200, upstream.body);
  headers.set("Accept-Ranges", "bytes");

  if (request.method === "HEAD") {
    headers.set("Content-Length", String(size));
    return pass(200, null);
  }
  if (request.method !== "GET" || !upstream.body || !ifRangeAllows(request, upstream)) {
    return pass(200, upstream.body);
  }

  const range = parseRange(request.headers.get("Range"), size);
  if (range === null) return pass(200, upstream.body);
  if (range === "unsatisfiable") {
    await upstream.body.cancel();
    // 中身の 無い 答えに 1年の キャッシュや 動画の 種類を 残さない
    headers.delete("Cache-Control");
    headers.delete("Content-Type");
    headers.delete("Content-Length");
    headers.set("Content-Range", `bytes */${size}`);
    return pass(416, null);
  }

  const { start, end } = range;
  const length = end - start + 1;
  // 全体を 頼まれた（Chrome の 最初の `bytes=0-`）なら 中身に 触らない
  const body =
    start === 0 && end === size - 1 ? upstream.body : await sliceBody(upstream.body, start, length);
  if (!body) return pass(200, upstream.body);

  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(length));
  return pass(206, body);
}

/**
 * ファイルの 大きさ（バイト）。分からなければ `null`。
 * 配信元が いつか 長さを 付ける ように なったら そちらを 信じ、無ければ 焼いた 表を 引く
 * （表は 配信の ETag が 合う ときだけ——古い 表の 大きさで うその 範囲を 書かない）。
 */
function sizeOf(request: Request, upstream: Response, files: MediaFiles): number | null {
  const header = upstream.headers.get("Content-Length");
  if (header !== null) {
    const size = Number(header);
    return Number.isSafeInteger(size) && size >= 0 ? size : null;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return null;
  }
  const entry = files[pathname];
  const etag = upstream.headers.get("ETag")?.replace(/^W\//, "").replace(/"/g, "");
  if (!entry || !etag || !etag.startsWith(entry[1])) return null;
  return entry[0];
}

/**
 * `If-Range` が 付いて いたら、手もとの 版（強い ETag）と 同じ ときだけ 途中から 送る。
 * 日付や 弱い ETag では 比べられないので 全体を 送る（RFC 9110 §13.1.5）。
 */
function ifRangeAllows(request: Request, upstream: Response): boolean {
  const ifRange = request.headers.get("If-Range");
  if (!ifRange) return true;
  const etag = upstream.headers.get("ETag");
  return etag !== null && !etag.startsWith("W/") && ifRange.trim() === etag;
}

/** Workers の BYOB 読み。`readAtLeast` は Workers だけの 拡張（Node には 無い）。 */
type ByobReader = ReadableStreamBYOBReader & {
  readAtLeast?: (
    minBytes: number,
    view: Uint8Array<ArrayBuffer>,
  ) => Promise<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>>;
};

/**
 * `start` バイト目から `length` バイトを 流す。
 * BYOB で 読めない（バイトの 流れで ない）ときは `null`——呼ぶ 側が 全体を 送る
 * （この 時点では まだ 1バイトも 読んで いないので、元の 流れを そのまま 使える）。
 */
async function sliceBody(
  body: ReadableStream<Uint8Array>,
  start: number,
  length: number,
): Promise<ReadableStream<Uint8Array> | null> {
  let reader: ByobReader;
  try {
    reader = body.getReader({ mode: "byob" }) as ByobReader;
  } catch {
    return null;
  }

  // 手前を 読み捨てる
  for (let skip = start; skip > 0;) {
    const got = await readUpTo(reader, Math.min(skip, READ_CHUNK));
    if (got.byteLength === 0) {
      await reader.cancel();
      throw new Error(`音・動画が 短すぎます（${start} バイト目まで ありません）`);
    }
    skip -= got.byteLength;
  }

  let remaining = length;
  const sliced = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const got = await readUpTo(reader, Math.min(remaining, READ_CHUNK));
      remaining -= got.byteLength;
      if (got.byteLength > 0) controller.enqueue(got);
      if (remaining <= 0 || got.byteLength === 0) {
        controller.close();
        // 送り終えた。範囲の 後ろは 読まずに 止める
        await reader.cancel().catch(() => {});
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
    },
  });
  return withFixedLength(sliced, length);
}

/** `length` バイト（終わりが 先に 来たら そこまで）を 1つの 塊に 読む。 */
async function readUpTo(reader: ByobReader, length: number): Promise<Uint8Array<ArrayBuffer>> {
  let buffer = new ArrayBuffer(length);
  let filled = 0;
  while (filled < length) {
    const view = new Uint8Array(buffer, filled, length - filled);
    // BYOB は 渡した 箱を 取り上げて 返して くる。次は 返って きた 箱に 読む
    const { value, done } = reader.readAtLeast
      ? await reader.readAtLeast(view.byteLength, view)
      : await reader.read(view);
    if (!value) throw new Error("音・動画の 読み取りが 取り消されました");
    buffer = value.buffer;
    filled += value.byteLength;
    if (done) break;
  }
  return new Uint8Array(buffer, 0, filled);
}

/**
 * Workers では 長さの 決まった 流れに 通して `Content-Length` を 付ける
 *（`FixedLengthStream`。JS で 作った 流れは そのままだと 長さの 無い 送り方に なる）。
 */
function withFixedLength(
  stream: ReadableStream<Uint8Array>,
  length: number,
): ReadableStream<Uint8Array> {
  const Fixed = (
    globalThis as {
      FixedLengthStream?: new (length: number) => TransformStream<Uint8Array, Uint8Array>;
    }
  ).FixedLengthStream;
  return Fixed ? stream.pipeThrough(new Fixed(length)) : stream;
}
