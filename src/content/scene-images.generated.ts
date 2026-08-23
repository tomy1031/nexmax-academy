/**
 * 自動生成。手で編集しない（`npm run gen:content` で作り直す）。
 *
 * public/img/scenes/ に置いてある背景画像の一覧。管理画面の「エリアの絵」で
 * 「サーバーにある絵から選ぶ」に使う。実行環境の fs に依存しないよう焼き込む
 *（Cloudflare Workers には fs が無い — scripts/generate_scene_index.mjs）。
 */

export const SCENE_IMAGES: readonly string[] = [
  "/img/scenes/area1_cambodia.webp",
  "/img/scenes/area3_vietnam.webp",
  "/img/scenes/area5_taiwan.webp",
  "/img/scenes/area_misty_peaks.webp",
  "/img/scenes/area_palace_town.webp",
  "/img/scenes/area_riverside_capital.webp",
  "/img/scenes/japan_goal.webp",
  "/img/scenes/map_cambodia.webp",
  "/img/scenes/map_japan.webp",
  "/img/scenes/office_president.webp",
  "/img/scenes/title_keyart.webp",
  "/img/scenes/welcome_bg.webp",
];
