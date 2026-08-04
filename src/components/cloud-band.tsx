"use client";

/**
 * まなびマップの雲。土地の境目と、エリアの四隅を白い霧で覆う。
 *
 * ## 「もこもこの雲」ではなく「霧」にする
 * 同じ大きさの楕円を等間隔に並べると、輪郭がそろって「同じ雲を繋げただけ」に見える。
 * そうならないよう、
 *   1. 大きさ・位置・濃さがすべて不揃いな靄を重ね、
 *   2. `blur` で輪郭を完全に消し、
 *   3. 中心がいちばん濃く、外へ向かうほど滑らかに透明になる
 * という作りにしている。停止点を細かく刻んでいるのは、透明になる途中で縞が出ないようにするため。
 */

/** 靄のかたまり。[中心x%, 中心y%, 横半径px, 縦半径px, 濃さ] — わざと不揃いにする */
const WISPS: readonly [number, number, number, number, number][] = [
  [-6, 54, 230, 50, 0.85],
  [9, 43, 150, 32, 0.62],
  [21, 61, 265, 56, 0.92],
  [34, 39, 128, 26, 0.55],
  [44, 57, 310, 62, 0.95],
  [57, 46, 175, 36, 0.7],
  [68, 63, 250, 52, 0.88],
  [79, 41, 140, 28, 0.58],
  [90, 58, 235, 50, 0.86],
  [103, 47, 190, 40, 0.72],
];

/** 外へ向かって滑らかに消える楕円。停止点を刻んで縞が出ないようにする */
function wispLayer(scale: number, offsetY: number, alpha: number): string {
  return WISPS.map(
    ([x, y, rx, ry, strength]) =>
      `radial-gradient(${rx * scale}px ${ry * scale}px at ${x}% ${y + offsetY}%, ` +
      `rgba(255,255,255,${(strength * alpha).toFixed(3)}) 0%, ` +
      `rgba(255,255,255,${(strength * alpha * 0.82).toFixed(3)}) 28%, ` +
      `rgba(255,255,255,${(strength * alpha * 0.5).toFixed(3)}) 52%, ` +
      `rgba(255,255,255,${(strength * alpha * 0.18).toFixed(3)}) 74%, ` +
      `rgba(255,255,255,0) 100%)`,
  ).join(", ");
}

/** 上下端へ向かって透明になるマスク。ぼかしたあとも帯の外へ霧が漏れないようにする */
const BAND_MASK =
  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.25) 12%, #000 34%, #000 66%, rgba(0,0,0,.25) 88%, transparent 100%)";

/**
 * エリアとエリアのあいだの雲海。土地の境目をこれで作る。
 *
 * エリアの下端にまたがるように重ねて置く（レイアウトの流れには入れない）。こうすると
 * 背景画像の切り口が霧に隠れるので、画像の端がどんな色でも継ぎ目が見えない。
 */
export function CloudBand({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 z-20 h-[clamp(240px,28vh,380px)] ${className}`}
      style={{ maskImage: BAND_MASK, WebkitMaskImage: BAND_MASK }}
    >
      {/* 芯。中心がいちばん濃く、上下へ長く裾を引いて消える */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,.12) 18%," +
            " rgba(255,255,255,.45) 33%, rgba(255,255,255,.86) 47%, rgba(255,255,255,.86) 53%," +
            " rgba(255,255,255,.45) 67%, rgba(255,255,255,.12) 82%, rgba(255,255,255,0) 100%)",
        }}
      />
      {/* 霧のムラ。大きさも位置もばらばらな靄を、強くぼかして輪郭を消す */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: wispLayer(1.5, 5, 0.55), filter: "blur(28px)" }}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: wispLayer(1.05, -6, 0.7), filter: "blur(18px)" }}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: wispLayer(0.72, 2, 0.5), filter: "blur(11px)" }}
      />
    </div>
  );
}

/**
 * エリアの四隅にかかる霧。景色を「霧の窓」からのぞいているように見せて、
 * 画像の角（＝切り口）が四角く出るのを隠す。
 */
export function CloudCorners() {
  // 隅ごとに大きさの違う楕円を2つ、中心から外へ滑らかに消えるように重ねる
  const corner = (x: number, y: number, alpha: number) =>
    `radial-gradient(closest-side at ${x}% ${y}%, ` +
    `rgba(255,255,255,${alpha}) 0%, ` +
    `rgba(255,255,255,${(alpha * 0.7).toFixed(3)}) 30%, ` +
    `rgba(255,255,255,${(alpha * 0.35).toFixed(3)}) 58%, ` +
    `rgba(255,255,255,${(alpha * 0.12).toFixed(3)}) 80%, ` +
    `rgba(255,255,255,0) 100%)`;

  const corners = [
    [0, 0],
    [100, 0],
    [0, 100],
    [100, 100],
  ] as const;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20"
      style={{
        backgroundImage: [
          ...corners.map(([x, y]) => corner(x, y, 0.72)),
          ...corners.map(([x, y]) => corner(x, y, 0.5)),
        ].join(", "),
        backgroundSize: "30% 34%, 30% 34%, 30% 34%, 30% 34%, 52% 19%, 52% 19%, 52% 19%, 52% 19%",
        backgroundPosition:
          "left top, right top, left bottom, right bottom, left top, right top, left bottom, right bottom",
        backgroundRepeat: "no-repeat",
        filter: "blur(14px)",
      }}
    />
  );
}
