"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { fieldPreset } from "./fields";
import {
  FieldWorld,
  IMMINENT_PROGRESS,
  PERSPECTIVE_PX,
  projectedScale,
  termDepth,
  WORLD_CSS,
} from "./arcade-world";

/**
 * ことばアーケードの舞台。画面いっぱいを使う。
 *
 * 旧アプリの中心体験は「巨大な用語が奥から自分に迫ってくる」こと。
 * これはページの中の小さな枠では成立しない（枠に入れた瞬間に緊張感が消える）。
 * だから舞台は fixed inset-0 の全画面オーバーレイにする。
 *
 * 舞台そのものが遠近法の箱になっている。奥に並べた木やビルは arcade-world.tsx が
 * 手前へ流し、用語は同じ遠近法の曲線で近づく。奥行きが本物なので、
 * 旧アプリと同じく目の前に来る直前で一気に大きくなる。
 *
 * 視線の階層は コントラストで作る:
 *   用語（最大・最強コントラスト） > 入力欄 > 四隅のHUD（影を弱めた小カード）
 * 画面中央は用語のために空けておき、そこに情報を置かない。
 */

/** 舞台ごと動かす手ごたえ（旧: shake-screen / damage-shake / kickFov）。 */
export type StageEffect = "none" | "near" | "damage" | "kick";

const EFFECT_CLASS: Record<StageEffect, string> = {
  none: "",
  near: "arc-quake",
  damage: "arc-damage",
  kick: "arc-kick",
};

export function ArcadeScene({
  field,
  /** 難しさの速度倍率。景色の流れる速さになる（旧 currentSpeed）。 */
  speed = 0.5,
  effect = "none",
  /** ゆれ始めるまでの秒数。用語がぶつかる直前まで待たせる。 */
  effectDelay = 0,
  children,
}: {
  field: string;
  speed?: number;
  effect?: StageEffect;
  effectDelay?: number;
  children: ReactNode;
}) {
  const preset = fieldPreset(field);

  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${preset.sky[0]} 0%, ${preset.sky[1]} 52%)`,
        perspective: `${PERSPECTIVE_PX}px`,
      }}
    >
      <style>{WORLD_CSS}</style>

      {/*
       * 奥から流れてくる世界。ゆれ・加速はこの層だけを動かす（入力欄は揺らさない）。
       * 遠近法はここに置く。中の床と物はそれぞれ別の3D空間になり、
       * 前後関係が混ざらない（この div を preserve-3d にすると混ざる）。
       */}
      <div
        className={`pointer-events-none absolute inset-0 ${EFFECT_CLASS[effect]}`}
        style={{
          perspective: `${PERSPECTIVE_PX}px`,
          animationDelay: `${effectDelay.toFixed(2)}s`,
        }}
      >
        <FieldWorld field={field} speed={speed} />
      </div>

      {/* 遠くのかすみ（旧 THREE.Fog）。用語が出てくる水平線をここで隠す。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-56 -translate-y-1/2"
        style={{
          background: `radial-gradient(70% 100% at 50% 50%, ${preset.fog} 0%, transparent 72%)`,
          opacity: 0.9,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-24 -translate-y-1/2"
        style={{
          background: `radial-gradient(50% 100% at 50% 50%, ${preset.glow}, transparent 70%)`,
        }}
      />

      {/* 画面の四隅をしめる（旧 #fx-vignette）。中央の用語に目が行くようにする。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 50%, transparent 56%, rgba(6,26,44,.22) 100%)",
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
 * 遠くの小さくかすんだ文字から、目の前の巨大な文字へ。
 * 大きさは舞台と同じ遠近法の式（P /（P − 奥行き））で出す。
 * 一定の割合で拡大するのとは見え方が違い、最後の一瞬でぐっと近づく。
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
  const scale = frozen ? 0.85 : projectedScale(termDepth(progress));
  // 遠くではふわっと漂い、近づくほど落ち着く（旧 gameLoop の bobAmp と同じ）。
  const bob = frozen || reduced ? 0 : Math.sin(progress * 26) * 8 * (1 - progress);
  // かすみの中から出てくる。読める明るさまでは早めに上げる。
  const opacity = Math.min(1, 0.45 + progress * 2);
  // 目の前に届く直前だけ、わずかに震える
  const imminent = !frozen && !reduced && remaining > 0 && progress > IMMINENT_PROGRESS;

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
      <div
        className={`text-center ${imminent ? "animate-term-jitter" : ""}`}
        style={{
          transform: missed
            ? "translate3d(0, 26%, 0) scale(1.05) rotate(-4deg)"
            : frozen
              ? `translate3d(0, -34%, 0) scale(${scale})`
              : `translate3d(0, ${bob.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`,
          opacity: missed ? 0 : opacity,
          transition: missed ? "transform .28s ease-in, opacity .28s ease-in" : undefined,
        }}
      >
        <span
          className="inline-block max-w-[92vw] text-5xl leading-tight font-black break-words sm:text-8xl"
          style={{
            color: preset.ink,
            WebkitTextStroke: `3px ${preset.inkEdge}`,
            paintOrder: "stroke fill",
            // 世界の発光色を後光にする（旧 makeEnemyTexture のネオングロー）
            textShadow: `0 6px 0 rgba(0,0,0,.10), 0 0 ${(16 + progress * 44).toFixed(0)}px ${preset.aura}`,
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
