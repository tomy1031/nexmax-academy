#!/usr/bin/env node
/**
 * Google Fonts の 字を 手元（public/fonts/）に 取って きて、@font-face の CSS を 作る。
 *
 * ## なぜ（2026-11-17）
 * `next/font/google` は **ビルドの たびに** Google から CSS と 字の ファイル（約750本）を 取る。
 * GitHub の テスト用の 機械では、Google の 返す CSS が ときどき 違う 形に なり、Next.js の
 * 取り込みが `Cannot read properties of null (reading '1')`（loader.js:122）で 止まる
 *（11/13 に 2回・11/17 に 1回。同じ コミットでも 別の ジョブでは 通る）。
 * 字を リポジトリに 置けば、ビルドは Google に 頼らない。
 *
 * ## 使い方（字を 足す・太さを 変える ときだけ、手で 1回 走らせる。CI では 走らせない）
 *   node scripts/fonts/selfhost_google_fonts.mjs
 * 走らせると public/fonts/<dir>/ を 作り直し、src/app/fonts.css と
 * src/components/quest/quest-dot-font.css を 書き直す。
 *
 * - 取り方は next/font と 同じ（同じ User-Agent → woff2・Google の 分け方の まま）。
 *   日本語の 字は 文字の 範囲（unicode-range）ごとに 分かれて いて、ブラウザは
 *   画面に ある 字の 分だけ 取る。preload は しない（next/font の `preload: false` と 同じ）。
 * - ファイル名は **中身の ハッシュ**（中身が 変われば 名前も 変わる）。public/_headers で
 *   `/fonts/*` を immutable に して いる。
 * - 字の ライセンスは どれも SIL Open Font License（同じ サイトで 配って よい）。
 */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** next/font と 同じ User-Agent（これで woff2 が 返る）。 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36";

const FAMILIES = [
  { family: "M PLUS Rounded 1c", query: "M+PLUS+Rounded+1c:wght@400;500;700;800", dir: "rounded" },
  { family: "Noto Sans JP", query: "Noto+Sans+JP:wght@400;700", dir: "notojp" },
  { family: "DotGothic16", query: "DotGothic16", dir: "dot" },
];

const OUTPUTS = [
  {
    file: "src/app/fonts.css",
    dirs: ["rounded", "notojp"],
    head: [
      "/*",
      " * 丸ゴシック（見出し・UI・本文の 主な 字）と 和文の 予備。",
      " * scripts/fonts/selfhost_google_fonts.mjs が 作る（手で 直さない）。",
      " * 変数の 名前は next/font の ときと 同じ（globals.css が 使う）。",
      " */",
      ":root {",
      '  --font-rounded: "M PLUS Rounded 1c";',
      '  --font-jp: "Noto Sans JP";',
      "}",
    ],
  },
  {
    file: "src/components/quest/quest-dot-font.css",
    dirs: ["dot"],
    head: [
      "/*",
      " * クエストの ドットの 字（DotGothic16）。クエストの 画面だけが 読みこむ。",
      " * scripts/fonts/selfhost_google_fonts.mjs が 作る（手で 直さない）。",
      " */",
      ".quest-dot-font {",
      '  --font-dot: "DotGothic16";',
      "}",
    ],
  },
];

async function fetchOk(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) return res;
    if (attempt === 4) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw new Error(`unreachable ${url}`);
}

/** CSS の @font-face を 取り、字の ファイルを 落として、手元の URL に 書きかえる。 */
async function selfhost({ query, dir }) {
  const css = await (
    await fetchOk(`https://fonts.googleapis.com/css2?family=${query}&display=swap`)
  ).text();
  const blocks = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  if (blocks.length === 0) throw new Error(`@font-face が 無い: ${query}`);
  const outDir = join(ROOT, "public", "fonts", dir);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const out = [];
  const queue = [...blocks];
  const workers = Array.from({ length: 12 }, async () => {
    for (let block = queue.shift(); block; block = queue.shift()) {
      const url = /src:\s*url\(([^)]+)\)/.exec(block)?.[1];
      if (!url) throw new Error(`src の 無い @font-face: ${block.slice(0, 120)}`);
      if (!/\.woff2$/.test(url)) {
        throw new Error(`woff2 で ない URL が 返った（もう 一度 走らせる）: ${url}`);
      }
      const bytes = Buffer.from(await (await fetchOk(url)).arrayBuffer());
      if (bytes.subarray(0, 4).toString("latin1") !== "wOF2") {
        throw new Error(`woff2 で ない 中身: ${url}`);
      }
      const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.woff2`;
      await writeFile(join(outDir, name), bytes);
      out.push({ order: blocks.indexOf(block), css: block.replace(url, `/fonts/${dir}/${name}`) });
    }
  });
  await Promise.all(workers);
  out.sort((a, b) => a.order - b.order);
  return { dir, faces: out.map((one) => one.css), files: out.length };
}

const results = [];
for (const family of FAMILIES) {
  const result = await selfhost(family);
  console.log(`${family.family}: ${result.files} 本`);
  results.push(result);
}

for (const output of OUTPUTS) {
  const faces = results.filter((one) => output.dirs.includes(one.dir)).flatMap((one) => one.faces);
  const text = [...output.head, "", ...faces, ""].join("\n");
  await writeFile(join(ROOT, output.file), text);
  console.log(`${output.file}: @font-face ${faces.length} 個`);
}
