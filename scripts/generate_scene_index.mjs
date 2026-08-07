#!/usr/bin/env node
/**
 * public/img/scenes/ の画像一覧を TS モジュールに焼き込む（実行: npm run gen:content）
 *
 * 管理画面の「エリアの絵」で**サーバーにすでにある絵から選ぶ**ために要る。
 * 一覧を実行時に readdirSync で作ると、Cloudflare Workers には fs が無いので
 * 必ず空になり、先生には「絵が1枚も無い」ようにしか見えない
 *（generate_content_index.mjs と同じ罠。あちらは実際に踏んで教材が全部消えた）。
 *
 * 生成物は**コミットする**。ずれていないかは `npm run lint:content` が検査する。
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SCENES_DIR = join(ROOT, "public", "img", "scenes");
export const SCENE_GENERATED_PATH = join(ROOT, "src", "content", "scene-images.generated.ts");

/** 背景に使える画像だけ。README や下書きの元画像は出さない。 */
const IMAGE_SUFFIX = /\.(webp|png|jpg|jpeg)$/i;

export function collectSceneFiles() {
  try {
    return readdirSync(SCENES_DIR)
      .filter((name) => IMAGE_SUFFIX.test(name))
      .sort();
  } catch {
    return [];
  }
}

export function buildSceneSource() {
  const files = collectSceneFiles();
  const body = files.map((name) => `  "/img/scenes/${name}",`).join("\n");

  return `/**
 * 自動生成。手で編集しない（\`npm run gen:content\` で作り直す）。
 *
 * public/img/scenes/ に置いてある背景画像の一覧。管理画面の「エリアの絵」で
 * 「サーバーにある絵から選ぶ」に使う。実行環境の fs に依存しないよう焼き込む
 *（Cloudflare Workers には fs が無い — scripts/generate_scene_index.mjs）。
 */

export const SCENE_IMAGES: readonly string[] = [
${body}
];
`;
}

function main() {
  writeFileSync(SCENE_GENERATED_PATH, buildSceneSource());
  console.log(
    `${relative(ROOT, SCENE_GENERATED_PATH)} を書き出しました（${collectSceneFiles().length} 枚）`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("generate_scene_index.mjs")) main();
