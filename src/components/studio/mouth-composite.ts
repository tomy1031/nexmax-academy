"use client";

/**
 * 口の部分だけを重ねて、6枚を1つの絵にそろえる（ブラウザの canvas）
 *
 * ## なぜ要るか
 * 口パクは6枚を切り替えて作るので、**背景・髪・目・服が1枚でも違うと
 * 切り替えのたびに画面がちらつく**。生成AIに「口だけ変えて」と頼んでも、
 * 実際には背景の色まで変わる（2026-08-13、青と白が混ざった絵が出た）。
 *
 * そこで「閉じた口」の絵を土台にして、**口のあたりだけ**を別の絵から
 * 切り抜いて重ねる。土台が1枚なので、背景も顔も必ずそろう。
 * 切り口は ぼかす——四角い継ぎ目が出ると、口より先にそこが目に付く。
 *
 * 顔の位置は生成のたびに少しずれるが、正面のバストアップに揃えて頼んでいるので
 * 口はほぼ同じ場所に来る。ずれても ぼかしの中に収まる。
 */

/** 口のあたり（画像の幅・高さに対する割合）。中心は少し下、横長の楕円。 */
const MOUTH = { cx: 0.5, cy: 0.5, rx: 0.13, ry: 0.1 };

/** ぼかしの幅（短辺に対する割合）。 */
const FEATHER = 0.05;

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // decode 後は canvas に描くだけなので、URL はここで返してよい
    URL.revokeObjectURL(url);
  }
}

/**
 * `base`（口を閉じた絵）に `variant` の口のあたりを重ねた1枚を返す。
 * 大きさは base に合わせる（生成のたびに解像度が変わっても、6枚がそろう）。
 */
export async function compositeMouth(base: Blob, variant: Blob, fileName: string): Promise<File> {
  const [under, over] = await Promise.all([loadImage(base), loadImage(variant)]);
  const width = under.naturalWidth;
  const height = under.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas が つかえません");

  ctx.drawImage(under, 0, 0, width, height);

  // 口のあたりだけを取り出す層。ぼかした楕円で切り抜いてから重ねる
  const patch = document.createElement("canvas");
  patch.width = width;
  patch.height = height;
  const patchCtx = patch.getContext("2d");
  if (!patchCtx) throw new Error("canvas が つかえません");
  patchCtx.drawImage(over, 0, 0, width, height);

  const cx = width * MOUTH.cx;
  const cy = height * MOUTH.cy;
  const rx = width * MOUTH.rx;
  const ry = height * MOUTH.ry;
  const feather = Math.min(width, height) * FEATHER;

  patchCtx.globalCompositeOperation = "destination-in";
  const gradient = patchCtx.createRadialGradient(cx, cy, 0, cx, cy, 1);
  gradient.addColorStop(Math.max(0, 1 - feather / Math.max(rx, ry)), "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  patchCtx.save();
  patchCtx.translate(cx, cy);
  patchCtx.scale(rx + feather, ry + feather);
  patchCtx.translate(-cx, -cy);
  // 拡大した座標系で「半径1」の円を塗る＝もとの座標では楕円になる
  patchCtx.fillStyle = gradient;
  patchCtx.beginPath();
  patchCtx.arc(cx, cy, 1, 0, Math.PI * 2);
  patchCtx.fill();
  patchCtx.restore();

  ctx.drawImage(patch, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.92),
  );
  if (!blob) throw new Error("絵を まとめられませんでした");
  return new File([blob], fileName, { type: "image/webp" });
}
