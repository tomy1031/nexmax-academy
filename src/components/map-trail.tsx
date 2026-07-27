"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * エリア1つぶんの「足跡」。
 *
 * 道は エリア上端 (xIn, 0%) → 中央のステージ (xNode, 50%) → エリア下端 (xOut, 100%) を
 * なめらかに結ぶ。上端・下端で傾きが 0 になる曲線を使うので、エリアをまたいでも道が折れない。
 *
 * 足跡は「もう歩いたところ」と「これから歩くところ」で色を変える。どこまで進んだかが
 * 地図を見ただけで分かるようにするための、進捗そのものの表示（01ガイド P2: 演出は学習に紐づける）。
 */

/** 歩いた足跡（葉グリーン）と、これからの足跡（うすい白）の境目は学習者の現在地 */
const WALKED_COLOR = "#3aa458";
const WALKED_GLOW = "#58c273";
const AHEAD_COLOR = "#ffffff";
/** まだ歩いていない足跡の縁取り。明るい島の上でも輪郭が消えないようにする */
const OUTLINE_COLOR = "rgba(0,79,141,.45)";

/** 足跡1つあたりのおおよその間隔（px）。実寸から個数を決めるので画面幅で密度が変わらない */
const FOOTPRINT_SPACING_PX = 30;
const DEFAULT_FOOTPRINT_COUNT = 14;

/** 左右の足のふり幅（px、進行方向に対して垂直） */
const STRIDE_PX = 7;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * エリア内の位置 t（0=上端, 1=下端）における道の x 座標（%）。
 * `nodeT` はステージの丸がある高さ。上端・nodeT・下端で傾きが 0 になるので、
 * エリアをまたいでも丸のところでも道が折れない。
 */
function trailX(t: number, xIn: number, xNode: number, xOut: number, nodeT: number): number {
  if (t <= nodeT) return xIn + (xNode - xIn) * smoothstep(t / nodeT);
  return xNode + (xOut - xNode) * smoothstep((t - nodeT) / (1 - nodeT));
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function Footprint({
  x,
  y,
  angle,
  walked,
}: {
  x: number;
  y: number;
  angle: number;
  walked: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 34"
      className="absolute h-[26px] w-[18px] -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        rotate: `${angle}deg`,
        color: walked ? WALKED_COLOR : AHEAD_COLOR,
        opacity: walked ? 1 : 0.72,
        // 島の上でも海の上でも見えるように、歩いた足跡は光らせ、まだの足跡は影で縁取る
        filter: walked
          ? `drop-shadow(0 0 6px ${WALKED_GLOW})`
          : "drop-shadow(0 1px 2px rgba(0,60,107,.55))",
      }}
    >
      {/* 土踏まず側（大きい方）と、つま先側。2つの楕円だけで小さくても足跡に見える */}
      <g
        fill="currentColor"
        stroke={walked ? "#ffffff" : OUTLINE_COLOR}
        strokeWidth={walked ? 2.4 : 1.6}
      >
        <ellipse cx="12" cy="22" rx="7.5" ry="10.5" />
        <ellipse cx="12" cy="6" rx="6" ry="4.5" />
      </g>
    </svg>
  );
}

export function AreaTrail({
  xIn,
  xNode,
  xOut,
  nodeT,
  areaIndex,
  walkedUntil,
}: {
  xIn: number;
  xNode: number;
  xOut: number;
  /** ステージの丸がある高さ（0=上端, 1=下端）。道はここで向きを変える */
  nodeT: number;
  /** このエリアの通し番号。walkedUntil と同じ「エリア番号 + エリア内の t」の目盛で比べる */
  areaIndex: number;
  /** 学習者の現在地。エリア番号 + エリア内の t（例: 2.3 = 3番目のエリアのステージのところ） */
  walkedUntil: number;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();

  const footprints = useMemo(() => {
    const count = size
      ? Math.max(6, Math.round(size.height / FOOTPRINT_SPACING_PX))
      : DEFAULT_FOOTPRINT_COUNT;
    const width = size?.width ?? 0;
    const height = size?.height ?? 0;

    return Array.from({ length: count }, (_, index) => {
      // 上端・下端ちょうどには置かない（隣のエリアの足跡と重なるため）
      const t = (index + 0.5) / count;
      const x = trailX(t, xIn, xNode, xOut, nodeT);
      const y = t * 100;

      // 進行方向は前後の点から求める。px に直さないと縦長のエリアで角度が狂う
      const delta = 0.5 / count;
      const ahead = trailX(Math.min(1, t + delta), xIn, xNode, xOut, nodeT);
      const behind = trailX(Math.max(0, t - delta), xIn, xNode, xOut, nodeT);
      const dx = ((ahead - behind) / 100) * width;
      const dy = (Math.min(1, t + delta) - Math.max(0, t - delta)) * height;
      // 足跡の絵は「上向き」なので、真下に進むとき 180 度になるように測る
      const angle = size ? (Math.atan2(dx, -dy) * 180) / Math.PI : 180;

      // 左右の足を進行方向の垂直方向にずらす
      const side = index % 2 === 0 ? 1 : -1;
      const length = Math.hypot(dx, dy) || 1;
      const offsetX = size ? ((side * STRIDE_PX * dy) / length / (width || 1)) * 100 : 0;
      const offsetY = size ? ((-side * STRIDE_PX * dx) / length / (height || 1)) * 100 : 0;

      return {
        key: index,
        x: x + offsetX,
        y: y + offsetY,
        angle,
        walked: areaIndex + t <= walkedUntil,
      };
    });
  }, [size, xIn, xNode, xOut, nodeT, areaIndex, walkedUntil]);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {footprints.map((footprint) => (
        <Footprint
          key={footprint.key}
          x={footprint.x}
          y={footprint.y}
          angle={footprint.angle}
          walked={footprint.walked}
        />
      ))}
    </div>
  );
}
