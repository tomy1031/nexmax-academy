"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * エリア1つぶんの「空路」。
 *
 * 曲線そのものは呼び出し側（`map-shell`）が地図全体で1本の波として定義し、ここは
 * そのエリアぶんを切り出して破線を並べるだけにする。区間ごとに曲線を作ると、
 * エリアの境目で波が切れて折れ線に見えるため。
 *
 * 航路は「もう飛んだところ」と「これから飛ぶところ」で色を変える。どこまで進んだかが
 * 地図を見ただけで分かるようにするための、進捗そのものの表示（01ガイド P2）。
 * 現在地には飛行機を1機だけ置く。
 */

const FLOWN_COLOR = "#3aa458";
const FLOWN_GLOW = "#58c273";
const AHEAD_COLOR = "#ffffff";

/** 破線1本ぶんのおおよその間隔（px）。実寸から本数を決めるので画面幅で密度が変わらない */
const DASH_SPACING_PX = 22;
const DEFAULT_DASH_COUNT = 16;

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

/** 航路の破線1本。進行方向に沿った短い線分 */
function Dash({ x, y, angle, flown }: { x: number; y: number; angle: number; flown: boolean }) {
  return (
    <span
      className="absolute block -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: 4,
        height: 15,
        rotate: `${angle}deg`,
        backgroundColor: flown ? FLOWN_COLOR : AHEAD_COLOR,
        // 縁取りを付けないと、明るい背景の上で白い破線が消えてしまう
        boxShadow: flown
          ? `0 0 0 1.5px rgba(255,255,255,.9), 0 0 7px ${FLOWN_GLOW}`
          : "0 0 0 1.5px rgba(0,79,141,.45), 0 1px 3px rgba(0,79,141,.35)",
      }}
    />
  );
}

/** いま学習者がいる位置に立つ飛行機 */
function Plane({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_2px_4px_rgba(0,79,141,.45)]"
      style={{ left: `${x}%`, top: `${y}%`, rotate: `${angle}deg` }}
    >
      {/* 上向きの機体。rotate で進行方向に向ける */}
      <path
        d="M12 1.6c1.05 0 1.9 1.5 1.9 3.35v3.2l7.3 4.3v2.4l-7.3-2.3v4.2l2.5 1.85v1.9L12 19.2l-4.4 1.3v-1.9l2.5-1.85v-4.2l-7.3 2.3v-2.4l7.3-4.3v-3.2C10.1 3.1 10.95 1.6 12 1.6z"
        fill="#ffffff"
        stroke="#004f8d"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AreaTrail({
  xAt,
  areaIndex,
  flownUntil,
}: {
  /**
   * エリア内の位置 t（0=上端, 1=下端）における航路の x 座標（%）を返す。
   * 呼び出し側が**地図全体で1本の曲線**として定義し、その一部を切り出して渡す。
   * ここで区間ごとに補間すると、エリアの境目で波が切れてカクつく。
   */
  xAt: (t: number) => number;
  /** このエリアの通し番号。flownUntil と同じ「エリア番号 + エリア内の t」の目盛で比べる */
  areaIndex: number;
  /** 学習者の現在地。エリア番号 + エリア内の t（例: 2.5 = 3番目のエリアのステージのところ） */
  flownUntil: number;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();

  /** 位置 t における進行方向（deg）。px に直さないと縦長のエリアで角度が狂う */
  const angleAt = useMemo(() => {
    const width = size?.width ?? 0;
    const height = size?.height ?? 0;
    return (t: number, delta: number) => {
      if (!size) return 180;
      const t2 = Math.min(1, t + delta);
      const t1 = Math.max(0, t - delta);
      const dx = ((xAt(t2) - xAt(t1)) / 100) * width;
      const dy = (t2 - t1) * height;
      // 絵は「上向き」なので、真下に進むとき 180 度になるように測る
      return (Math.atan2(dx, -dy) * 180) / Math.PI;
    };
  }, [size, xAt]);

  const dashes = useMemo(() => {
    const count = size
      ? Math.max(6, Math.round(size.height / DASH_SPACING_PX))
      : DEFAULT_DASH_COUNT;

    return Array.from({ length: count }, (_, index) => {
      // 上端・下端ちょうどには置かない（隣のエリアの破線と重なるため）
      const t = (index + 0.5) / count;
      return {
        key: index,
        x: xAt(t),
        y: t * 100,
        angle: angleAt(t, 0.5 / count),
        flown: areaIndex + t <= flownUntil,
      };
    });
  }, [size, xAt, areaIndex, flownUntil, angleAt]);

  // 現在地がこのエリアの中にあるときだけ飛行機を出す。
  // ステージの丸のわずかに手前に置く（真上に重ねると丸に隠れて見えないため）。
  const planeT = flownUntil - areaIndex;
  const drawT = Math.min(1, Math.max(0, planeT - 0.07));
  const plane =
    planeT >= 0 && planeT <= 1
      ? {
          x: xAt(drawT),
          y: drawT * 100,
          angle: angleAt(drawT, 0.02),
        }
      : null;

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-25">
      {dashes.map((dash) => (
        <Dash key={dash.key} x={dash.x} y={dash.y} angle={dash.angle} flown={dash.flown} />
      ))}
      {plane && <Plane x={plane.x} y={plane.y} angle={plane.angle} />}
    </div>
  );
}
