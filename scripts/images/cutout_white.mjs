/**
 * 白い 背景の 立ち絵を **切りぬく**（アルファを 起こす）。
 *
 * なぜ 要るか: 立ち絵は 1024x1536 の **アルファ付き**で 欲しい
 *（docs/skills/codex_image_generation.md §6.6）。ところが image_gen は
 * `transparent background (alpha)` と 書いても **RGB で 返す ことが ある**。
 * 同 §6.6 は「その1枚だけ 消して 撮り直す」と 書いて あるが、ヘンディさんの
 * 立ち絵では **3回 続けて RGB**（2026-08-28）。1回目は 透明の つもりで
 * **市松模様を 絵として 描いて きた**——撮り直しでは 抜けられなかった。
 *
 * そこで、背景が 真っ白に なった 絵を 機械で 切りぬく。
 *
 * ## なぜ「色で 抜く」のでは なく「へりから 塗りつぶす」のか
 *
 * 白を 一律に 抜くと **白い ワイシャツも 消える**。人物の 中の 白は 濃い 線で
 * 囲まれて いるので、**画像の へりから つながって いる 白だけ**を 抜けば 残る。
 * だから 4辺から の flood fill にして ある。
 *
 * ふちの ギザギザは、塗りつぶした ところに 接する 「白っぽい」画素の 明るさから
 * 半透明を 作って ならす（2px の ぼかし。1px だと 髪の さきに 白い ふちが 残った）。
 *
 * 使い方:
 *   node scripts/images/cutout_white.mjs <入力.png> <出力.png> [背景とみなす明るさ]
 *
 * 3つめの 数字は「ここより 明るければ 背景」の しきい値（既定 236）。市松模様を
 * 描いて きた 絵は 白(254)と 薄い灰(241)が 交互に なる ので、既定は その 両方を
 * 拾える ところに 置いて ある（244 に すると 灰の ますが 残る——実発生）。
 */
import process from "node:process";
import sharp from "sharp";

const [inPath, outPath, lumArg] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: node scripts/images/cutout_white.mjs <入力.png> <出力.png> [明るさ]");
  process.exit(1);
}

/** ここより 明るく、ここより 色みが 無ければ「背景の 白」とみなす。 */
const BG_LUM = Number(lumArg ?? 236);
const BG_SAT = 12;
/**
 * ふちの ぼかしに 使う 範囲（この 明るさまで 半透明に する）。
 * ここを 高く すると **髪の さきに 白い ふちが 残る**ので、少し 低めに 取る。
 */
const EDGE_LUM = 205;
/** ぼかしの 幅（画素）。1 だと 髪の ギザギザに 白が 残った。 */
const EDGE_PASSES = 2;

const { data, info } = await sharp(inPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = W * H;

const lum = new Uint8Array(px);
const sat = new Uint8Array(px);
for (let i = 0; i < px; i += 1) {
  const r = data[i * 4];
  const g = data[i * 4 + 1];
  const b = data[i * 4 + 2];
  lum[i] = Math.round((r * 299 + g * 587 + b * 114) / 1000);
  sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
}

// へりから つながる 白を 塗りつぶす（4近傍）。
const bg = new Uint8Array(px);
const queue = new Int32Array(px);
let head = 0;
let tail = 0;
const push = (i) => {
  if (bg[i] || lum[i] < BG_LUM || sat[i] > BG_SAT) return;
  bg[i] = 1;
  queue[tail] = i;
  tail += 1;
};
for (let x = 0; x < W; x += 1) {
  push(x);
  push((H - 1) * W + x);
}
for (let y = 0; y < H; y += 1) {
  push(y * W);
  push(y * W + W - 1);
}
while (head < tail) {
  const i = queue[head];
  head += 1;
  const x = i % W;
  const y = (i - x) / W;
  if (x > 0) push(i - 1);
  if (x < W - 1) push(i + 1);
  if (y > 0) push(i - W);
  if (y < H - 1) push(i + W);
}

// ふちを ならす: 塗りつぶしに 接する 白っぽい 画素を 明るさで 半透明に する。
const alpha = new Uint8Array(px).fill(255);
for (let i = 0; i < px; i += 1) if (bg[i]) alpha[i] = 0;
for (let pass = 0; pass < EDGE_PASSES; pass += 1) {
  const prev = alpha.slice();
  for (let i = 0; i < px; i += 1) {
    if (bg[i] || prev[i] < 255 || lum[i] < EDGE_LUM || sat[i] > BG_SAT * 3) continue;
    const x = i % W;
    const y = (i - x) / W;
    const touching =
      (x > 0 && prev[i - 1] < 255) ||
      (x < W - 1 && prev[i + 1] < 255) ||
      (y > 0 && prev[i - W] < 255) ||
      (y < H - 1 && prev[i + W] < 255);
    if (!touching) continue;
    const t = (lum[i] - EDGE_LUM) / (BG_LUM - EDGE_LUM);
    alpha[i] = Math.max(0, Math.min(255, Math.round(255 * (1 - t))));
  }
}

for (let i = 0; i < px; i += 1) data[i * 4 + 3] = alpha[i];

await sharp(data, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(outPath);

let clear = 0;
for (let i = 0; i < px; i += 1) if (alpha[i] === 0) clear += 1;
console.log(`${outPath}: 透明 ${((clear / px) * 100).toFixed(1)}% (${W}x${H})`);
