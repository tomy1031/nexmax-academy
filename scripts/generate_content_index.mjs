#!/usr/bin/env node
/**
 * content/ の JSON を1つの TS モジュールに焼き込む（実行: npm run gen:content）
 *
 * なぜ必要か:
 *   `src/lib/content.ts` は以前 `readdirSync(content/)` で JSON を読んでいた。
 *   ビルド時の静的生成だけなら動くが、ページに `revalidate` を付けた時点で
 *   **サーバ側の再生成がリクエスト中に走る**。Cloudflare Workers には fs が無いので
 *   readdirSync は失敗し、try/catch が空配列にして黙って通す。結果、デプロイ先では
 *   git 由来の教材が丸ごと消える（詳細ページが404、マップはコードの既定値に後退）。
 *   実測: 2026-08-05、確認URLで /stage/m2-asakai・/manga/… が全て404、
 *   /map の STEP 3 が「朝会と報告」から「報告」に戻っていた。
 *
 *   バンドルに入る TS モジュールへ焼き込めば、実行環境の fs に依存しなくなる。
 *   DB由来（スタジオ公開分）は今までどおり実行時に取りに行く（設計07 §11.1）。
 *
 * 生成物は**コミットする**。ビルド順に依存させないため。
 * 中身がずれていないかは `npm run lint:content` が検査する（ずれたら error）。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content");
export const GENERATED_PATH = join(ROOT, "src", "content", "git-contents.generated.ts");

/** content/ 配下の *.json を、パス順に安定して集める。 */
export function collectContentFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".json")) files.push(full);
    }
  };
  try {
    walk(CONTENT_DIR);
  } catch {
    return [];
  }
  return files;
}

/** 生成するファイルの中身を組み立てる（比較にも使うので純関数にしておく）。 */
export function buildGeneratedSource() {
  const files = collectContentFiles();
  const items = files.map((file) => ({
    file: relative(ROOT, file).split("\\").join("/"),
    data: JSON.parse(readFileSync(file, "utf8")),
  }));

  const body = items.map((item) => `  // ${item.file}\n  ${JSON.stringify(item.data)},`).join("\n");

  return `/**
 * 自動生成。手で編集しない（\`npm run gen:content\` で作り直す）。
 *
 * content/ の JSON をバンドルへ焼き込んだもの。実行環境の fs に依存せず読むための
 * ファイルである（Cloudflare Workers には fs が無い — scripts/generate_content_index.mjs）。
 * ずれていたら \`npm run lint:content\` が error で落とす。
 */

/** content/ の JSON をそのまま並べたもの（スキーマ検証は読み手が行う）。 */
export const GIT_CONTENTS: readonly unknown[] = [
${body}
];
`;
}

function main() {
  const source = buildGeneratedSource();
  writeFileSync(GENERATED_PATH, source);
  const count = collectContentFiles().length;
  console.log(`${relative(ROOT, GENERATED_PATH)} を書き出しました（${count} ファイル）`);
}

if (process.argv[1] && process.argv[1].endsWith("generate_content_index.mjs")) main();
