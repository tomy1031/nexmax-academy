/**
 * アプリの 入口（Cloudflare Workers）— 2026-09-30
 *
 * OpenNext が ビルドで 作る `.open-next/worker.js` を 包む（OpenNext の 公式の 形:
 * https://opennext.js.org/cloudflare/howtos/custom-worker）。ページの 扱いは 何も 変えない。
 *
 * ここで 横取りするのは **教材の 音と 動画だけ**（`/audio/*` `/video/*`）。
 * 途中から 送れる（206）ように する ため——理由と 中身は `src/lib/media-range.ts`、
 * 経緯と 数字は docs/deploy.md §0.17。この 2つの 道だけ Worker を 先に 通す
 * 設定は `wrangler.jsonc` の `assets.run_worker_first`。ほかの `public/` の
 * ファイルは これまでどおり Worker を 通らない（CPU 0・回数に 数えない）。
 *
 * - ファイルが 無い（404）ときは アプリ本体へ 回す。アセットが 先だった ころと
 *   同じ 行き先（Next の 404 画面・`/[stage]` の ページ）に なる。
 * - OpenNext の Durable Object（`DOQueueHandler` など）は 出さない。この アプリは
 *   memoryQueue で、`wrangler.jsonc` に DO の 束縛が 無い。
 * - `.mjs` に して あるのは、`tsc` に `.open-next/`（ビルドの あとにしか 無い）を
 *   読みに 行かせない ため（tsconfig は .ts/.tsx/.mts だけを 見る）。
 */
import openNext from "./.open-next/worker.js";
import { mediaPrefix, serveMedia } from "./src/lib/media-range.ts";

const worker = {
  async fetch(request, env, ctx) {
    const prefix = mediaPrefix(new URL(request.url).pathname);
    if (prefix) {
      const response = await serveMedia(request, env.ASSETS, prefix);
      if (response.status !== 404) return response;
      await response.body?.cancel();
    }
    return openNext.fetch(request, env, ctx);
  },
};

export default worker;
