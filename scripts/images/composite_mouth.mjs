/**
 * 口パク 6枚を 1枚の 顔に そろえる（口の まわりだけ 重ねる）。
 *
 * ## なぜ要るか
 * `VisemeFace` は 6枚を 1秒に 何回も 切りかえる。生成した 6枚を そのまま 置くと、
 * 髪・影・あごの 線が 少しずつ ちがい、**切りかえの たびに 画面が ちらつく**
 *（ニャムさんの 旧 6枚は、あごと 耳の 線が 2重に 見えて いた）。
 * スタジオの `mouth-composite.ts` と 同じく「閉じた 口の 絵を 土台に、口の まわりだけ 重ねる」。
 * ここでは さらに 2つ 足す:
 *
 * 1. **位置合わせ** … 生成の たびに 顔が 数ピクセル・数% ずれる。口の まわりを 除いた
 *    顔ぜんたいで 土台に 一番 重なる ずらし（平行移動＋拡大）を 探してから 切りぬく。
 *    ずれた まま 重ねると、口が 鼻や あごから 浮いて 見える。
 * 2. **色合わせ** … 切り口の 輪の 平均色の 差を 引く。肌の 色が 少し ちがうと、
 *    ぼかしても 楕円の 形が 見えて しまう。
 *
 * 口の 場所（楕円）は **人ごとに 目で 決めて 渡す**（`--mouth cx,cy,rx,ry`。画像に 対する 割合）。
 * 差から 自動で 見つける 作りも 試したが、生成の たびに めがね・フードの えり・首の 線も
 * ゆれるので、楕円が めがねや 首まで 広がり、**めがねごと 切りかわって ちらつく**
 *（奥田さんの 試しで 3回 外した）。preview.png の 閉じた 口に 赤い 楕円が 出るので、
 * 口が **不透明な 内側（半径の 65%）** に 収まって いるかを 目で 見て 決める。
 * 決めた 値は docs/skills/codex_image_generation.md §6.8 の 表に 残す。
 *
 * 使い方:
 *   node scripts/images/composite_mouth.mjs <生の PNG の フォルダ> <id> <出力フォルダ> --mouth 0.491,0.542,0.1,0.06
 *   （入力は <id>_mouth_<形>.png。出力は <形>.png と 見くらべ用の preview.png）
 */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const SHAPES = ["closed", "a", "i", "u", "e", "o"];
const SIZE = 1024;
/** 動かさない（位置合わせで 得が 無い ときの 答え）。 */
const IDENTITY = Object.freeze({ s: 1, dx: 0, dy: 0 });

const args = process.argv.slice(2);
const mouthAt = args.indexOf("--mouth");
const fixedMouth = mouthAt >= 0 ? args.splice(mouthAt, 2)[1].split(",").map(Number) : null;
const [rawDir, id, outDir] = args;
if (!rawDir || !id || !outDir || fixedMouth?.length !== 4 || fixedMouth.some(Number.isNaN)) {
  console.error(
    "usage: node scripts/images/composite_mouth.mjs <rawDir> <id> <outDir> --mouth cx,cy,rx,ry",
  );
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

async function loadRgb(file) {
  const { data } = await sharp(file)
    .resize(SIZE, SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

/** 輝度を 縦横 1/step に 縮めて 返す。 */
function grayOf(rgb, step) {
  const n = SIZE / step;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      let sum = 0;
      for (let yy = 0; yy < step; yy += 1) {
        for (let xx = 0; xx < step; xx += 1) {
          const i = ((y * step + yy) * SIZE + (x * step + xx)) * 3;
          sum += 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
        }
      }
      out[y * n + x] = sum / (step * step);
    }
  }
  return out;
}

/** 土台の 座標 (x,y) に 来る 変種の 座標。中心 まわりに 拡大 s・平行移動 (dx,dy)。 */
function sourceOf(x, y, n, t) {
  const c = n / 2;
  return [(x - c - t.dx) / t.s + c, (y - c - t.dy) / t.s + c];
}

/** 口の まわりを 除いた 顔の 差（小さいほど 重なる）。 */
function misfit(base, variant, n, t, mouth) {
  let sum = 0;
  let count = 0;
  const lo = Math.floor(n * 0.12);
  const hi = Math.ceil(n * 0.88);
  for (let y = lo; y < hi; y += 1) {
    for (let x = lo; x < hi; x += 1) {
      const ex = (x / n - mouth.cx) / (mouth.rx * 1.6);
      const ey = (y / n - mouth.cy) / (mouth.ry * 2.2);
      if (ex * ex + ey * ey < 1) continue;
      const [sx, sy] = sourceOf(x, y, n, t);
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix < 0 || iy < 0 || ix >= n || iy >= n) continue;
      const d = base[y * n + x] - variant[iy * n + ix];
      sum += d * d;
      count += 1;
    }
  }
  return count === 0 ? Infinity : sum / count;
}

function align(baseRgb, variantRgb, mouth) {
  let best = { s: 1, dx: 0, dy: 0 };
  // 粗く（1/8）→ 細かく（1/4）→ もっと 細かく（1/2）
  for (const [step, scales, shifts] of [
    [8, [0.9, 0.93, 0.96, 0.98, 1, 1.02, 1.04, 1.07, 1.1], 6],
    [4, [-0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015], 3],
    [2, [-0.004, -0.002, 0, 0.002, 0.004], 2],
  ]) {
    const n = SIZE / step;
    const base = grayOf(baseRgb, step);
    const variant = grayOf(variantRgb, step);
    const center = { s: best.s, dx: (best.dx * n) / SIZE, dy: (best.dy * n) / SIZE };
    let score = Infinity;
    let found = center;
    for (const ds of scales) {
      const s = step === 8 ? ds : center.s + ds;
      for (let oy = -shifts; oy <= shifts; oy += 1) {
        for (let ox = -shifts; ox <= shifts; ox += 1) {
          const t = { s, dx: center.dx + ox, dy: center.dy + oy };
          const m = misfit(base, variant, n, t, mouth);
          if (m < score) {
            score = m;
            found = t;
          }
        }
      }
    }
    best = { s: found.s, dx: (found.dx * SIZE) / n, dy: (found.dy * SIZE) / n };
    /*
     * いちばん 細かい 段で「動かさない」と 比べる。**3% 以上 よく ならない なら 動かさない。**
     * 0.999倍のような 意味の ない ずらしでも、写し直すと 線が 半画素 ずれて
     * フードや 首の 線が 5枚 そろって 差に なり、口の 場所を 見まちがえた（奥田さんの 試し）。
     */
    if (step === 2) {
      const identity = misfit(base, variant, n, IDENTITY, mouth);
      if (score >= identity * 0.97) best = IDENTITY;
    }
  }
  return best;
}

/** 変種を 土台の 座標に 写す（双一次補間）。動かさない ときは 元の 画素の まま。 */
function warp(rgb, t) {
  if (t === IDENTITY) return rgb;
  const out = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const [sx, sy] = sourceOf(x, y, SIZE, t);
      const x0 = Math.max(0, Math.min(SIZE - 2, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(SIZE - 2, Math.floor(sy)));
      const fx = Math.max(0, Math.min(1, sx - x0));
      const fy = Math.max(0, Math.min(1, sy - y0));
      for (let c = 0; c < 3; c += 1) {
        const p = (yy, xx) => rgb[(yy * SIZE + xx) * 3 + c];
        const top = p(y0, x0) * (1 - fx) + p(y0, x0 + 1) * fx;
        const bottom = p(y0 + 1, x0) * (1 - fx) + p(y0 + 1, x0 + 1) * fx;
        out[(y * SIZE + x) * 3 + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return out;
}

/** 楕円の 中は 変種、外は 土台。へりは ぼかし、輪の 平均色の 差を 引いて 肌の 色を そろえる。 */
function blend(baseRgb, warped, mouth) {
  const feather = 0.35; // 楕円の 外側 35% を ぼかしに 使う
  const cx = mouth.cx * SIZE;
  const cy = mouth.cy * SIZE;
  const rx = mouth.rx * SIZE;
  const ry = mouth.ry * SIZE;
  const alphaAt = (x, y) => {
    const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (r >= 1) return 0;
    if (r <= 1 - feather) return 1;
    const t = (1 - r) / feather;
    return t * t * (3 - 2 * t);
  };
  // 色の 差は ぼかしの 輪で 測る
  const offset = [0, 0, 0];
  let ring = 0;
  for (let y = Math.floor(cy - ry); y < cy + ry; y += 1) {
    for (let x = Math.floor(cx - rx); x < cx + rx; x += 1) {
      const a = alphaAt(x, y);
      if (a <= 0 || a >= 1) continue;
      const i = (y * SIZE + x) * 3;
      for (let c = 0; c < 3; c += 1) offset[c] += warped[i + c] - baseRgb[i + c];
      ring += 1;
    }
  }
  if (ring > 0) for (let c = 0; c < 3; c += 1) offset[c] /= ring;
  const out = Buffer.from(baseRgb);
  for (let y = Math.floor(cy - ry); y < cy + ry; y += 1) {
    for (let x = Math.floor(cx - rx); x < cx + rx; x += 1) {
      const a = alphaAt(x, y);
      if (a <= 0) continue;
      const i = (y * SIZE + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        const v = warped[i + c] - offset[c];
        out[i + c] = Math.round(baseRgb[i + c] * (1 - a) + Math.max(0, Math.min(255, v)) * a);
      }
    }
  }
  return { out, offset };
}

const toPng = (rgb, file) =>
  sharp(rgb, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toFile(file);

const raw = Object.fromEntries(
  await Promise.all(
    SHAPES.map(async (shape) => [
      shape,
      await loadRgb(path.join(rawDir, `${id}_mouth_${shape}.png`)),
    ]),
  ),
);
const base = raw.closed;

const [cx, cy, rx, ry] = fixedMouth;
const mouth = { cx, cy, rx, ry };

// 位置合わせは 1回だけ（口の まわりは 広めに 除いて 合わせる）
const aligned = Object.fromEntries(
  SHAPES.slice(1).map((shape) => {
    const t = align(base, raw[shape], mouth);
    return [shape, { t, warped: warp(raw[shape], t) }];
  }),
);
console.log(
  `${id}: mouth`,
  Object.fromEntries(Object.entries(mouth).map(([k, v]) => [k, +v.toFixed(3)])),
);

await toPng(base, path.join(outDir, "closed.png"));
const frames = [path.join(outDir, "closed.png")];
for (const shape of SHAPES.slice(1)) {
  const { t, warped } = aligned[shape];
  const { out, offset } = blend(base, warped, mouth);
  const file = path.join(outDir, `${shape}.png`);
  await toPng(out, file);
  frames.push(file);
  console.log(
    `  ${shape}: scale ${t.s.toFixed(3)} shift ${t.dx.toFixed(1)},${t.dy.toFixed(1)} color ${offset.map((v) => v.toFixed(1)).join(",")}`,
  );
}

// 見くらべ用: 上段は 全身の 縮小、下段は 口の まわりの 拡大
const TILE = 256;
const crop = {
  left: Math.round((mouth.cx - mouth.rx * 2) * SIZE),
  top: Math.round((mouth.cy - mouth.ry * 2.5) * SIZE),
  width: Math.round(mouth.rx * 4 * SIZE),
  height: Math.round(mouth.ry * 5 * SIZE),
};
const tiles = [];
for (const [at, file] of frames.entries()) {
  tiles.push({ input: await sharp(file).resize(TILE, TILE).toBuffer(), left: at * TILE, top: 0 });
  tiles.push({
    input: await sharp(file).extract(crop).resize(TILE, TILE, { fit: "fill" }).toBuffer(),
    left: at * TILE,
    top: TILE,
  });
}
// 閉じた 口の 拡大に、重ねた 楕円（ぼかしの 外周）を 赤い 線で 描く
const toTile = (value, from, span) => ((value - from) / span) * TILE;
const ellipse = Buffer.from(
  `<svg width="${TILE}" height="${TILE}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${toTile(mouth.cx * SIZE, crop.left, crop.width)}" cy="${toTile(mouth.cy * SIZE, crop.top, crop.height)}" rx="${(mouth.rx * SIZE * TILE) / crop.width}" ry="${(mouth.ry * SIZE * TILE) / crop.height}" fill="none" stroke="red" stroke-width="2"/></svg>`,
);
tiles.push({ input: ellipse, left: 0, top: TILE });
await sharp({
  create: { width: TILE * 6, height: TILE * 2, channels: 3, background: "#ffffff" },
})
  .composite(tiles)
  .png()
  .toFile(path.join(outDir, "preview.png"));
console.log(`  preview: ${path.join(outDir, "preview.png")}`);
