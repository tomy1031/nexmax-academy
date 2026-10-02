/**
 * 資産（音・絵）の 中身から 短い 版番号を 作る — キャッシュを 自動で 切りかえる ため。
 *
 * ## なぜ 要るか（2026-09-04 に 実発生）
 * リスニングの 音を 作り直して STG へ 出したのに、**古い 音が 鳴った**。
 * `public/_headers` が `/audio/*` に `stale-while-revalidate=86400` を 付けて いて、
 * **最大 24時間、古い ファイルを そのまま 返しながら 裏で 更新する**ため。
 * URL が 変わらない かぎり、差しかえても 学習者には 届かない。
 *
 * ## なぜ 「全部 短く する」では 直さないのか
 * `_headers` を 一律で 短くすると、**変えて いない 資産まで 毎回 取り直させる**。
 * 教室の 回線は 細い（設計01）。だから **中身の ハッシュを URL に 付けて**、
 * 変わった ファイルだけ 新しい URL に なる 形に する（`?v=xxxxxxxx`）。
 * そのうえで `_headers` は `immutable` に できる。
 *
 * 出すのは `src/content/asset-versions.generated.ts`。346本で gzip 数KB——
 * Worker の 3MiB 枠（AGENTS.md デプロイ 罠5）に対して 誤差の 大きさ。
 *
 * ## 音・動画の 大きさと 名札も ここで 出す（2026-09-30）
 * Worker が 音・動画を 途中から 送る（206）には ファイルの 大きさが 要るが、
 * `env.ASSETS.fetch` の 応答には Content-Length が 付かない
 *（src/lib/media-range.ts・docs/deploy.md §0.17）。だから 大きさを 焼いて おく
 *（`src/content/media-files.generated.ts`）。あわせて 配信の ETag の 先頭
 *（scripts/lib/asset_etag.mjs）も 焼き、Worker は ETag が 合う ときだけ 大きさを 信じる。
 * 表と 実物の 食いちがいは tests/media_range.test.ts が 1本ずつ 止める。
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { assetEtag, ETAG_PREFIX_LENGTH } from "./lib/asset_etag.mjs";

/** 版番号を 付ける 置き場（教材が 指す 資産だけ。`_next` は Next.js が すでに 付けて いる）。 */
const ROOTS = ["audio", "img"];

/** @returns {string[]} public からの 相対パス（posix 区切り） */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const versions = {};
for (const root of ROOTS) {
  const base = join("public", root);
  let files = [];
  try {
    files = walk(base);
  } catch {
    continue; // その 置き場が まだ 無い ことも ある
  }
  for (const file of files) {
    const url = `/${file.split(sep).slice(1).join(posix.sep)}`;
    versions[url] = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
  }
}

const sorted = Object.keys(versions).sort();
const body = sorted.map((url) => `  ${JSON.stringify(url)}: ${JSON.stringify(versions[url])},`);
writeFileSync(
  join("src", "content", "asset-versions.generated.ts"),
  `// 自動生成（scripts/generate_asset_versions.mjs）。手で 直さない。\n` +
    `// 資産の 中身の ハッシュ。URL に \`?v=\` として 付け、差しかえが 学習者に 届くようにする。\n` +
    `export const ASSET_VERSIONS: Readonly<Record<string, string>> = {\n${body.join("\n")}\n};\n`,
  "utf8",
);
console.log(`資産の 版番号: ${sorted.length}本を 書き出しました`);

/** 途中から 送る（206）置き場。wrangler.jsonc の `run_worker_first` と 同じ。 */
const MEDIA_ROOTS = ["audio", "video"];

/** @type {Record<string, [number, string]>} 道 → [大きさ, ETag の 先頭] */
const media = {};
for (const root of MEDIA_ROOTS) {
  let files = [];
  try {
    files = walk(join("public", root));
  } catch {
    continue;
  }
  for (const file of files) {
    const parts = file.split(sep).slice(1);
    // `.DS_Store` など 見えない ファイルは 配らない もの なので 入れない
    if (parts.some((part) => part.startsWith("."))) continue;
    media[`/${parts.join(posix.sep)}`] = [
      statSync(file).size,
      assetEtag(file).slice(0, ETAG_PREFIX_LENGTH),
    ];
  }
}

const mediaSorted = Object.keys(media).sort();
const mediaBody = mediaSorted.map((url) => {
  const [size, etag] = media[url];
  return `  ${JSON.stringify(url)}: [${size}, ${JSON.stringify(etag)}],`;
});
writeFileSync(
  join("src", "content", "media-files.generated.ts"),
  `// 自動生成（scripts/generate_asset_versions.mjs）。手で 直さない。\n` +
    `// 音・動画の [大きさ（バイト）, 配信の ETag の 先頭]。Worker が 途中から 送る（206）ときに 使う\n` +
    `// （src/lib/media-range.ts）。ETag が 合わない ときは 大きさを 信じない。\n` +
    `export const MEDIA_FILES: Readonly<Record<string, readonly [size: number, etag: string]>> = {\n${mediaBody.join("\n")}\n};\n`,
  "utf8",
);
console.log(`音・動画の 大きさと 名札: ${mediaSorted.length}本を 書き出しました`);
