/**
 * Cloudflare の 静的アセットが 付ける ETag を、手もとで 同じに 作る（2026-09-30）。
 *
 * wrangler は アセットを 上げる ときに `blake3(base64(中身) + 拡張子)` の 先頭 32桁を
 * 名札に する（node_modules/wrangler の `hashFile`）。配信の ETag は この 名札 そのもの
 * （本番の soudan_30min_a.mp4・soudan_30min_b.mp4 で 一致を 確認）。
 *
 * 音・動画の 表（src/content/media-files.generated.ts）に この 先頭を 焼いて おくと、
 * Worker が「表の 大きさは いま 配って いる ファイルの ものか」を 実行時に 確かめられる
 * （src/lib/media-range.ts）。表が 古くても 途中から 送るのを やめるだけで、うその
 * Content-Range で 再生を 壊さない。
 *
 * blake3 は wrangler が 使って いる ものを wrangler から たどって 読む（同じ 計算に
 * そろえる ため。package.json には 足さない）。wrangler が 計算を 変えたら 表と 合わなく
 * なり、途中から 送る のが 止まる（壊れは しない）。docs/deploy.md §0.17 の curl で 気づける。
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname } from "node:path";

const require = createRequire(import.meta.url);
const { hash } = createRequire(require.resolve("wrangler/package.json"))("blake3-wasm");

/** 表に 焼く 桁数。食いちがいに 気づければ よいので 8桁（32bit）で 足りる。 */
export const ETAG_PREFIX_LENGTH = 8;

/**
 * wrangler と 同じ 名札（32桁の 16進）。
 * @param {string} file
 * @returns {string}
 */
export function assetEtag(file) {
  const contents = readFileSync(file);
  return hash(contents.toString("base64") + extname(file).substring(1))
    .toString("hex")
    .slice(0, 32);
}
