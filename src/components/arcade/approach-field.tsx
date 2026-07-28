"use client";

import { useEffect, useRef, useState } from "react";
import { fieldPreset } from "./fields";

/**
 * 「用語が奥から迫ってくる」中心体験（旧 wordtest_revice.md §26）。
 *
 * 迫ってくるのは必ずIT用語そのもので、敵やバグには置き換えない。
 * 演出は CSS の遠近法とスケールだけで作り、WebGL を使わない。
 */
export function ApproachField({
  term,
  reading,
  showFurigana,
  /** 1（遠い）→ 0（目の前）。useCountdown の残り割合をそのまま渡す。 */
  remaining,
  field,
  /** 読みが決まったあと。用語を止めて手前に置いておく。 */
  frozen = false,
  children,
}: {
  term: string;
  reading: string;
  showFurigana: boolean;
  remaining: number;
  field: string;
  frozen?: boolean;
  children?: React.ReactNode;
}) {
  const preset = fieldPreset(field);
  const reduced = usePrefersReducedMotion();

  // 近づくほど 0 → 1。動きを減らす設定では最初から手前に置く。
  const progress = reduced || frozen ? 1 : 1 - remaining;
  const scale = 0.28 + progress * 0.92;
  const blur = Math.max(0, (1 - progress) * 5);
  const lift = (1 - progress) * -22;

  return (
    <div
      className="relative isolate w-full overflow-hidden rounded-[var(--radius-card)] border-2"
      style={{
        borderColor: "var(--color-hairline)",
        background: `linear-gradient(180deg, ${preset.sky[0]} 0%, ${preset.sky[1]} 62%, ${preset.ground} 100%)`,
        aspectRatio: "16 / 9",
        // 入力欄と4択が同じ画面に収まるように高さを抑える（スクロールさせない）
        maxHeight: "44dvh",
        perspective: "700px",
      }}
    >
      {/* 遠近グリッドの地面 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] opacity-60"
        style={{
          background: `repeating-linear-gradient(to right, ${preset.grid} 0 2px, transparent 2px 64px),
                       repeating-linear-gradient(to bottom, ${preset.grid} 0 2px, transparent 2px 48px)`,
          transform: "rotateX(72deg)",
          transformOrigin: "bottom center",
          maskImage: "linear-gradient(to bottom, transparent, black 40%)",
        }}
      />
      {/* 地平線のかすみ */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[48%] h-24"
        style={{
          background: `radial-gradient(60% 100% at 50% 100%, ${preset.glow}aa, transparent 70%)`,
        }}
      />

      {/* 迫ってくる用語 */}
      <div className="absolute inset-0 grid place-items-center px-4">
        <div
          className="text-center will-change-transform"
          style={{
            transform: `translate3d(0, ${lift}%, 0) scale(${scale})`,
            filter: `blur(${blur}px)`,
            transition: reduced ? "none" : "filter 120ms linear",
          }}
        >
          <span
            className="inline-block px-6 py-3 text-5xl leading-tight font-extrabold sm:text-7xl"
            style={{
              color: preset.ink,
              textShadow: `0 0 22px ${preset.glow}, 0 2px 0 rgba(255,255,255,.55)`,
            }}
          >
            {showFurigana ? (
              <ruby>
                {term}
                <rt style={{ color: preset.ink, opacity: 0.85 }}>{reading}</rt>
              </ruby>
            ) : (
              term
            )}
          </span>
        </div>
      </div>

      {/* 景色の名前 */}
      <span
        className="absolute top-3 left-3 rounded-full bg-white/75 px-3 py-1 text-xs font-extrabold"
        style={{ color: preset.ink }}
      >
        {preset.label}
      </span>

      {children}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const queryRef = useRef<MediaQueryList | null>(null);

  useEffect(() => {
    queryRef.current = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(queryRef.current?.matches ?? false);
    update();
    queryRef.current.addEventListener("change", update);
    return () => queryRef.current?.removeEventListener("change", update);
  }, []);

  return reduced;
}
