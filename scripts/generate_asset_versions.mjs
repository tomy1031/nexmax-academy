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
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, sep } from "node:path";

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
