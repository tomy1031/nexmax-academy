"use client";

import { CLOUD_WHITE } from "@/content/areas";

/**
 * エリアとエリアのあいだの「雲海」。土地の境目をこれで作る。
 *
 * エリアの下端にまたがるように重ねて置く（レイアウトの流れには入らない）。こうすると
 * 背景画像の切り口が雲に隠れるので、画像の端がどんな色でも継ぎ目が見えない。
 *
 * もくもく感は、大きさと位置をずらした楕円グラデーションを重ねて出す。楕円で指定して
 * いるので、画面幅が変わっても雲がつぶれた形にならない。
 */

/** 雲のかたまり。[中心x%, 中心y%, 横半径px, 縦半径px] */
const PUFFS: readonly [number, number, number, number][] = [
  [6, 62, 130, 54],
  [19, 44, 104, 46],
  [31, 66, 122, 50],
  [44, 40, 116, 52],
  [56, 64, 134, 56],
  [69, 43, 108, 46],
  [81, 63, 126, 52],
  [94, 47, 112, 48],
];

function puffLayer(opacity: number, offsetY: number, scale: number): string {
  return PUFFS.map(
    ([x, y, rx, ry]) =>
      `radial-gradient(${rx * scale}px ${ry * scale}px at ${x}% ${y + offsetY}%, ` +
      `rgba(255,255,255,${opacity}) 55%, rgba(255,255,255,0) 72%)`,
  ).join(", ");
}

export function CloudBand({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 z-20 h-[clamp(150px,19vh,240px)] ${className}`}
    >
      {/* 奥の層。うすく大きく広げて、雲海の「厚み」を出す */}
      <div className="absolute inset-0" style={{ backgroundImage: puffLayer(0.55, 4, 1.25) }} />
      {/* 手前の層。輪郭のはっきりしたもくもく */}
      <div className="absolute inset-0" style={{ backgroundImage: puffLayer(0.95, 0, 1) }} />
      {/* 帯の中心をしっかり白で埋めて、雲のすきまから景色が透けないようにする */}
      <div
        className="absolute inset-x-0 top-1/2 h-1/3 -translate-y-1/2"
        style={{
          background: `linear-gradient(to bottom, rgba(255,255,255,0), ${CLOUD_WHITE}, rgba(255,255,255,0))`,
        }}
      />
    </div>
  );
}
