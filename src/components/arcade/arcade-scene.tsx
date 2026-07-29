"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { fieldPreset } from "./fields";

/**
 * ことばアーケードの舞台。画面いっぱいを使う。
 *
 * 旧アプリの中心体験は「巨大な用語が奥から自分に迫ってくる」こと。
 * これはページの中の小さな枠では成立しない（枠に入れた瞬間に緊張感が消える）。
 * だから舞台は fixed inset-0 の全画面オーバーレイにする。
 *
 * 視線の階層は コントラストで作る:
 *   用語（最大・最強コントラスト） > 入力欄 > 四隅のHUD（影を弱めた小カード）
 * 画面中央は用語のために空けておき、そこに情報を置かない。
 */
export function ArcadeScene({ field, children }: { field: string; children: ReactNode }) {
  const preset = fieldPreset(field);

  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${preset.sky[0]} 0%, ${preset.sky[1]} 52%)`,
        perspective: "760px",
      }}
    >
      {/* 床 — 地平線に向かって目地がすぼまり、手前ほど広がる */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${preset.ground[1]} 0%, ${preset.ground[0]} 100%)`,
          // 地平線ぎわは空となじませ、境目の直線を消す
          maskImage: "linear-gradient(to bottom, transparent 0%, black 12%)",
        }}
      >
        <div
          className="absolute inset-x-[-60%] bottom-0 h-[280%]"
          style={{
            background: `repeating-linear-gradient(to right, ${preset.grid} 0 3px, transparent 3px 120px),
                         repeating-linear-gradient(to bottom, ${preset.grid} 0 3px, transparent 3px 96px)`,
            opacity: 0.5,
            transform: "rotateX(76deg)",
            transformOrigin: "bottom center",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 22%)",
          }}
        />
      </div>

      {/* 水平線のかすみ — 用語が出てくる場所を示す */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[36%] h-40"
        style={{
          background: `radial-gradient(60% 100% at 50% 78%, ${preset.glow}, transparent 70%)`,
          opacity: 0.85,
        }}
      />

      {/* 景色の名前 */}
      <span
        className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-4 py-1 text-xs font-black"
        style={{ color: preset.ink }}
      >
        {preset.label}
      </span>

      {children}
    </div>
  );
}

/**
 * 迫ってくる用語。
 *
 * 遠くの小さく薄い文字から、手前の巨大な文字へ。
 * 変化させる transform は1つ（scale と translateY の合成）だけにして、
 * 低スペック端末でもコマ落ちしにくくする。
 */
export function ApproachingTerm({
  term,
  reading,
  showFurigana,
  /** 1（水平線）→ 0（目の前）。カウントダウンの残り割合をそのまま渡す。 */
  remaining,
  field,
  /** 読みが決まったあと。用語を手前で止める。 */
  frozen = false,
  /** 取りそこねた。水に落とす。 */
  missed = false,
}: {
  term: string;
  reading: string;
  showFurigana: boolean;
  remaining: number;
  field: string;
  frozen?: boolean;
  missed?: boolean;
}) {
  const preset = fieldPreset(field);
  const reduced = usePrefersReducedMotion();

  const progress = reduced || frozen ? 1 : 1 - remaining;
  // 読みが決まったら、旧アプリと同じく用語を上へ逃がして下半分を4択に明け渡す
  const scale = frozen ? 0.78 : 0.22 + progress * 1.03;
  const lift = frozen ? -34 : (1 - progress) * -26;
  const opacity = 0.45 + progress * 0.55;
  // 目の前に届く直前だけ、わずかに震える
  const imminent = !frozen && !reduced && remaining > 0 && remaining < 0.12;

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
      <div
        className={`text-center will-change-transform ${imminent ? "animate-term-jitter" : ""}`}
        style={{
          transform: missed
            ? "translate3d(0, 26%, 0) scale(1.05) rotate(-4deg)"
            : `translate3d(0, ${lift}%, 0) scale(${scale})`,
          opacity: missed ? 0 : opacity,
          transition: missed ? "transform .28s ease-in, opacity .28s ease-in" : undefined,
        }}
      >
        <span
          className="inline-block max-w-[92vw] text-6xl leading-tight font-black break-words sm:text-8xl"
          style={{
            color: preset.ink,
            WebkitTextStroke: `3px ${preset.inkEdge}`,
            paintOrder: "stroke fill",
            textShadow: `0 6px 0 rgba(0,0,0,.10), 0 0 32px ${preset.glow}`,
          }}
        >
          {showFurigana ? (
            <ruby>
              {term}
              <rt style={{ color: preset.ink, opacity: 0.9, WebkitTextStroke: "0" }}>{reading}</rt>
            </ruby>
          ) : (
            term
          )}
        </span>
      </div>
    </div>
  );
}

/** 四隅のHUD。中央の用語より「格下」に見えるよう、影を弱く小さく置く。 */
export function HudChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border-2 border-white px-3 py-1"
      style={{
        background: "rgba(255,250,240,.92)",
        boxShadow: "0 2px 0 rgba(0,79,141,.18)",
      }}
    >
      <span className="text-[10px] font-black tracking-widest text-[#5a7089]">{label}</span>
      <span className="text-lg leading-none font-black" style={{ color: accent ?? "#1f3a56" }}>
        {value}
      </span>
    </span>
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion(): boolean {
  // 外部（OSの設定）の状態なので、エフェクトで同期せず購読する
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}
