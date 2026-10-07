"use client";

import { memo, useId } from "react";

/**
 * まなびマップの雲。土地の境目には積雲の雲海を、エリアの四隅には白い霧をかける。
 *
 * ## 境目は「霧」から「積雲の雲海」へ（2026-10-07）
 * 以前は輪郭をぼかしきった霧にしていた（同じ楕円を並べた雲が「同じ雲を繋げただけ」に
 * 見えたため）。ユーザーから参考画像（土地にもくもくの雲がかぶさり、雲の底が靄に溶けて
 * 次の土地が透ける絵）が届き、境目を積雲に作り替えた。同じ雲の繰り返しに見えないよう、
 *   1. 雲は「こぶの集まった山」を単位にし、山の幅・高さ・こぶの大きさをすべて乱数で揺らす
 *   2. 奥・中・手前の3列に重ね、列ごとに山の位置をずらす
 *   3. 境目ごとに乱数の種（`seed`）を変え、どの境目も違う形にする
 * という作りにしている。乱数は種から決まるので、描くたびに形が変わることはない。
 *
 * ## 立体感の出しかた
 * こぶ1つ1つを「上が白く、下が青い影」のグラデーションで塗り、上にあるこぶから順に描く。
 * 下のこぶの白い頭が上のこぶの影に重なり、こぶ同士の谷に影の筋ができる。
 * 縁は `feTurbulence` で少しけば立たせ、ベクターの真円に見えないようにしている。
 *
 * ## 土地の建物に雲をかけない（緩衝の空白）
 * 最初の版は雲の山が境目から約160px上まで伸び、上の土地の建物に大きくかぶさっていた
 * （同日のユーザー指摘「建物に被りすぎ」）。土地の絵は境目の約95〜130px上から空色に
 * 溶け始めるので、雲のてっぺんは `CLOUD_CEILING`（境目の約80px上）より上へ出さない。
 * 溶け始めから雲のてっぺんまでは淡い空だけの帯にして、土地と雲のあいだの空白にする。
 */

/** 雲の絵の座標系。横長にして、幅の広い画面でも左右が切れないようにする */
const VIEW_W = 3600;
const VIEW_H = 600;
const VIEW_MID = VIEW_W / 2;

/** こぶの塗り。far=奥の列（青みが強い）、puff=中の列、low=手前の列（下の影が深い） */
type Shade = "far" | "puff" | "low";

type Billow = { x: number; y: number; r: number; shade: Shade };

type CloudRow = {
  /** 山の裾の高さ */
  base: number;
  /** 山の高さ・幅・こぶの半径の幅（この中で乱数で決める） */
  height: readonly [number, number];
  width: readonly [number, number];
  radius: readonly [number, number];
  shade: Shade;
  /** 中央の谷の深さ（0=谷なし, 1=いちばん深い） */
  valley: number;
};

/**
 * 雲のてっぺんの上限（雲の座標。境目は `VIEW_H / 2`）。これより上は淡い空だけにして、
 * 上の土地の建物に雲をかけない。奥の列の「裾 − 高さの最大」がこれに一致する
 */
const CLOUD_CEILING = 160;

/** 奥から手前へ。奥ほど山が高く、手前ほど低い */
const ROWS: readonly CloudRow[] = [
  {
    base: 270,
    height: [40, 270 - CLOUD_CEILING],
    width: [420, 760],
    radius: [60, 90],
    shade: "far",
    valley: 1,
  },
  {
    base: 345,
    height: [25, 100],
    width: [400, 720],
    radius: [70, 100],
    shade: "puff",
    valley: 0.7,
  },
  {
    base: 420,
    height: [15, 90],
    width: [380, 700],
    radius: [75, 105],
    shade: "low",
    valley: 0.3,
  },
];

/** 中央の谷の幅と、谷底で山の高さを何割まで下げるか */
const VALLEY_HALF_WIDTH = 420;
const VALLEY_FLOOR = 0.35;

/** 種から決まる乱数（mulberry32）。同じ種なら毎回同じ雲になる */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1つの山（積雲のかたまり）。稜線にこぶを並べ、その下を段々にこぶで土台まで埋める */
function addMass(
  random: () => number,
  out: Billow[],
  {
    cx,
    base,
    width,
    height,
    radius,
    shade,
  }: {
    cx: number;
    base: number;
    width: number;
    height: number;
    radius: number;
    shade: Shade;
  },
) {
  const count = Math.max(4, Math.round(width / (radius * 1.05)));
  for (let i = 0; i <= count; i++) {
    const t = Math.min(1, Math.max(0, i / count + (random() - 0.5) * (0.5 / count)));
    const rise = Math.sin(Math.PI * t);
    const x = cx - width / 2 + t * width;
    // 山の肩ほどこぶを小さくし、頂上ほど大きくする
    const r = radius * (0.4 + 0.6 * rise ** 0.6) * (0.72 + random() * 0.56);
    const top = base - height * rise ** 0.8;
    out.push({ x, y: top + r * (0.92 + random() * 0.16), r, shade });

    // ときどき肩に小さいこぶをのせて、稜線を単調にしない
    if (rise > 0.45 && random() < 0.35) {
      const small = r * (0.38 + random() * 0.2);
      const side = random() < 0.5 ? -1 : 1;
      out.push({
        x: x + side * r * (0.55 + random() * 0.2),
        y: top + r * 0.35 + small * 0.2,
        r: small,
        shade,
      });
    }

    // 稜線のこぶの下を、少しずつずらしたこぶで土台まで埋める（下のこぶほど手前）
    let y = top + r * (1.85 + random() * 0.2);
    while (y < base) {
      const fill = r * (0.95 + random() * 0.35);
      out.push({ x: x + (random() - 0.5) * r * 0.9, y, r: fill, shade });
      y += fill * (0.75 + random() * 0.25);
    }
  }
}

function between(random: () => number, [min, max]: readonly [number, number]) {
  return min + (max - min) * random();
}

/** 雲海のこぶを、奥の列から順に返す。同じ種の結果は使い回す（境目は何本もある） */
const billowCache = new Map<number, readonly Billow[]>();

function billowsFor(seed: number): readonly Billow[] {
  const cached = billowCache.get(seed);
  if (cached) return cached;

  const random = seededRandom(seed);
  // 中央ほど山を低くする。航路の通る真ん中に谷ができ、左右の山が高く見える
  const valleyAt = (x: number, depth: number) =>
    1 - depth * (1 - VALLEY_FLOOR) * (1 - Math.min(1, Math.abs(x - VIEW_MID) / VALLEY_HALF_WIDTH));

  const billows: Billow[] = [];
  for (const row of ROWS) {
    const rowBillows: Billow[] = [];
    // 中央の谷をはさんで、左右へ山を置いていく
    for (const direction of [-1, 1]) {
      let cx = VIEW_MID + direction * between(random, [180, 360]);
      while (cx > -400 && cx < VIEW_W + 400) {
        const width = between(random, row.width);
        addMass(random, rowBillows, {
          cx,
          base: row.base,
          width,
          height: between(random, row.height) * valleyAt(cx, row.valley),
          radius: between(random, row.radius),
          shade: row.shade,
        });
        cx += direction * width * between(random, [0.5, 0.78]);
      }
    }
    // 上にあるこぶから描く（下のこぶが上のこぶの影に重なり、谷が生まれる）
    rowBillows.sort((a, b) => a.y - a.r - (b.y - b.r));
    billows.push(...rowBillows);
  }

  const rounded = billows.map((billow) => ({
    ...billow,
    x: Math.round(billow.x * 10) / 10,
    // 肩にのせた小さいこぶも、てっぺんの上限を越えないように下ろす
    y: Math.round(Math.max(billow.y, CLOUD_CEILING + billow.r) * 10) / 10,
    r: Math.round(billow.r * 10) / 10,
  }));
  billowCache.set(seed, rounded);
  return rounded;
}

/** こぶの陰影。上は白いまま、下だけが青い影になる（光は左上から） */
const SHADES: Record<Shade, readonly [number, string][]> = {
  far: [
    [0, "#fdfeff"],
    [0.6, "#f4f8fc"],
    [0.78, "#d8e4f0"],
    [1, "#a3bbd5"],
  ],
  puff: [
    [0, "#ffffff"],
    [0.56, "#ffffff"],
    [0.7, "#ecf2f8"],
    [0.85, "#c6d6e7"],
    [1, "#9cb4ce"],
  ],
  low: [
    [0, "#ffffff"],
    [0.5, "#f8fbfd"],
    [0.68, "#e4edf6"],
    [0.85, "#c2d3e5"],
    [1, "#9fb6cf"],
  ],
};

/** 縦方向のグラデーション（[位置, 色, 不透明度]）を、雲の座標系のまま塗る */
function VerticalGradient({
  id,
  from,
  to,
  stops,
}: {
  id: string;
  from: number;
  to: number;
  stops: readonly [number, string, number][];
}) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1={from} x2="0" y2={to}>
      {stops.map(([offset, color, opacity]) => (
        <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
      ))}
    </linearGradient>
  );
}

/** 雲の外側へ広めに取る塗りの範囲（左右の端で雲や靄が途切れないように） */
const BLEED = 300;

/** 淡い空を塗りはじめる高さ。ここから雲のてっぺんまでが、土地と雲のあいだの空白になる */
const SKY_TOP = CLOUD_CEILING - 100;

/**
 * エリアとエリアのあいだの雲海。土地の境目をこれで作る。
 *
 * エリアの下端にまたがるように重ねて置く（レイアウトの流れには入れない）。上の土地には
 * 雲の山がかぶさり、下の土地は雲の底の靄ごしに透けて見える。背景画像の切り口（空色に
 * 溶かしてある所）は、雲と、雲の向こうの淡い空で隠れる。
 *
 * 絵は帯の高さに合わせて縮尺を決め、横は中央から左右へはみ出させる。画面の幅で
 * こぶの大きさが変わらないので、スマホでも雲が「綿のかたまり」にならない。
 */
export const CloudBand = memo(function CloudBand({
  className = "",
  seed = 1,
}: {
  className?: string;
  /** 雲の形を決める種。境目ごとに変えて、同じ雲が並ばないようにする */
  seed?: number;
}) {
  const id = `cloud${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const billows = billowsFor(seed);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 z-20 h-[clamp(300px,38vh,440px)] ${className}`}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute top-0 left-1/2 aspect-[6/1] h-full w-auto max-w-none -translate-x-1/2 overflow-visible"
      >
        <defs>
          {(Object.keys(SHADES) as Shade[]).map((shade) => (
            <radialGradient key={shade} id={`${id}-${shade}`} cx="0.44" cy="0.16" r="0.96">
              {SHADES[shade].map(([offset, color]) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </radialGradient>
          ))}
          {/* 土地と雲のあいだの空白と、雲のすきまに見える淡い空。画像の切り口の濃い空色を
              ここで和らげる。雲のてっぺん（CLOUD_CEILING）の少し上から淡くしはじめる */}
          <VerticalGradient
            id={`${id}-sky`}
            from={SKY_TOP}
            to={540}
            stops={[
              [0, "#e2f1fa", 0],
              [0.22, "#e2f1fa", 0.7],
              [0.45, "#e2f1fa", 0.9],
              [1, "#e2f1fa", 0],
            ]}
          />
          {/* 雲の底を下へ向かって消す */}
          <VerticalGradient
            id={`${id}-fade`}
            from={0}
            to={VIEW_H}
            stops={[
              [0, "#ffffff", 1],
              [0.7, "#ffffff", 1],
              [0.84, "#999999", 1],
              [0.98, "#000000", 1],
            ]}
          />
          <mask
            id={`${id}-mask`}
            maskUnits="userSpaceOnUse"
            x={-BLEED}
            y={-BLEED}
            width={VIEW_W + BLEED * 2}
            height={VIEW_H + BLEED * 2}
          >
            <rect
              x={-BLEED}
              y={-BLEED}
              width={VIEW_W + BLEED * 2}
              height={VIEW_H + BLEED * 2}
              fill={`url(#${id}-fade)`}
            />
          </mask>
          {/* 雲の底の靄。下の土地を霞ませながら透かす */}
          <VerticalGradient
            id={`${id}-haze`}
            from={VIEW_H * 0.6}
            to={VIEW_H}
            stops={[
              [0, "#dbeaf6", 0],
              [0.35, "#d7e8f5", 0.5],
              [0.65, "#d2e5f4", 0.2],
              [1, "#d2e5f4", 0],
            ]}
          />
          {/* こぶの縁を少しけば立たせる */}
          <filter
            id={`${id}-fluff`}
            x="-2%"
            y="-30%"
            width="104%"
            height="160%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.022"
              numOctaves={3}
              seed={seed}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={20}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation={1.2} />
          </filter>
        </defs>

        <rect
          x={-BLEED}
          y={SKY_TOP}
          width={VIEW_W + BLEED * 2}
          height={540 - SKY_TOP}
          fill={`url(#${id}-sky)`}
        />
        <g mask={`url(#${id}-mask)`}>
          <g filter={`url(#${id}-fluff)`}>
            {billows.map((billow, index) => (
              <circle
                key={index}
                cx={billow.x}
                cy={billow.y}
                r={billow.r}
                fill={`url(#${id}-${billow.shade})`}
              />
            ))}
          </g>
        </g>
        <rect
          x={-BLEED}
          y={VIEW_H * 0.6}
          width={VIEW_W + BLEED * 2}
          height={VIEW_H * 0.4}
          fill={`url(#${id}-haze)`}
        />
      </svg>
    </div>
  );
});

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
