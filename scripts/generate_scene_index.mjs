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

/**
 * 先生に見せる並び。**出発地から日本へ、近い順**（2026-09-07 の指定「順番は揃えて」）。
 *
 * 名前順（既定）だと `area_bund_riverbend`（上海）の次が `area_castle_canal_town`（大阪）に
 * なる——先生は地図を上から順に作るのに、選ぶ絵は行ったり来たりする並びで出てくる。
 * 土地の遠さは絵の中身にしか無いので、機械には決められない。ここに書くしかない。
 *
 * 並べ方: カンボジア → ベトナム（南から北へ）→ マカオ → 香港 → 台湾 → 中国 → 韓国 →
 * 日本（西から東へ）。ここに無いファイルは名前順で後ろに付く（消しても壊れない）。
 */
const SCENE_ORDER = [
  // カンボジア
  "area1_cambodia.webp", // アンコールワット
  "area_riverside_capital.webp", // プノンペン
  "area_pepper_riverside.webp", // カンポット
  "area_crab_shore.webp", // ケップ
  // ベトナム（南から）
  "area_motorbike_avenue.webp", // ホーチミン
  "area_dragon_river.webp", // ダナン
  "area_lake_oldquarter.webp", // ハノイ
  "area3_vietnam.webp", // うみの いわやま（北の湾）
  // マカオ・香港・台湾
  "area_stone_facade_plaza.webp", // マカオ
  "area_harbour_peak.webp", // 香港
  "area5_taiwan.webp", // かいだんの まち
  "area_lantern_night_market.webp", // 台北
  // 中国
  "area_bund_riverbend.webp", // 上海
  "area_misty_peaks.webp", // きりの やまなみ
  "area_long_wall_ridge.webp", // 万里の長城
  // 韓国
  "area_palace_town.webp", // みやこの まち
  "area_palace_river_capital.webp", // ソウル
  "area_volcano_fields.webp", // チェジュ
  // 日本（2026-09-07 の 指定の 順。おおむね 南西から 東へ）
  "area_cedar_moss_forest.webp", // 屋久島
  "area_stall_bay_town.webp", // 福岡
  "area_great_rope_shrine.webp", // 出雲
  "area_sea_torii_delta.webp", // 広島
  "area_port_tower_ridge.webp", // 神戸
  "area_castle_canal_town.webp", // 大阪
  "area_pagoda_lane.webp", // 京都
  "area_matcha_town.webp", // 抹茶の まち
  "area_golden_fish_castle.webp", // 名古屋
  "area_ferris_harbour.webp", // 横浜
  "area_red_tower_city.webp", // 東京
  "japan_goal.webp", // ゴールの 日本（よこ長の 帯）
];

/** 並びの決まり: SCENE_ORDER にあるものが先（その順）、無いものは名前順で後ろ。 */
export function orderScenes(names) {
  const rank = new Map(SCENE_ORDER.map((name, at) => [name, at]));
  return [...names].sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || a.localeCompare(b);
  });
}

export function collectSceneFiles() {
  try {
    return orderScenes(readdirSync(SCENES_DIR).filter((name) => IMAGE_SUFFIX.test(name)));
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
