"use client";

import { motion } from "motion/react";

/**
 * 手ごたえの演出。旧アプリ（DATA DIVE）の演出をそのまま移す。
 *
 * 移植したもの:
 *   PortalRing    … 用語が奥に現れるときの輪（旧 spawnFxRing "portal"）
 *   Burst         … 用語を止めたときの砕け散る粒＋衝撃波＋閃光（旧 explode）
 *   ScorePop      … 「+150」「OK!」が浮いて消える（旧 scorePop）
 *   DamageFlash   … ライフが減った瞬間の全画面フラッシュ（旧 damage-flash）
 *   ApproachClock … 4択の残り時間。時計が奥から近づいてくる（旧 #mcq-clock）
 *   shake         … 読みを外したときの入力欄のふるえ（globals.css の shake-input）
 *
 * 変えたのは色だけ。旧アプリの赤 #ff5470 は、島の世界に合わせて
 * やわらかい珊瑚色 #ff8a70 にする（挙動・時間は原典どおり）。
 */

/** 加点ポップ。れんしゅうは「+150」、テストは「OK!」。 */
export function ScorePop({
  label,
  id,
  /** テストの「OK!」は控えめの水色にする（旧 .pop-label）。 */
  quiet = false,
}: {
  label: string;
  id: string | number;
  quiet?: boolean;
}) {
  return (
    <motion.span
      key={id}
      aria-hidden
      className={`pointer-events-none absolute top-[34%] left-1/2 -translate-x-1/2 font-black ${
        quiet ? "text-2xl" : "text-4xl"
      }`}
      style={{
        color: quiet ? "#0272ae" : "#f0a819",
        WebkitTextStroke: "3px #fff",
        paintOrder: "stroke fill",
      }}
      initial={{ y: 0, opacity: 1, scale: 0.8 }}
      animate={{ y: -90, opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.95, ease: "easeOut" }}
    >
      {label}
    </motion.span>
  );
}

/** ライフが減った瞬間の全画面フラッシュ（旧: damage-flash / 340ms）。 */
export function DamageFlash({ id }: { id: string | number }) {
  return (
    <motion.div
      key={id}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
      style={{
        background:
          "radial-gradient(90% 90% at 50% 50%, rgba(255,138,112,.55), rgba(242,101,74,.85))",
      }}
      initial={{ opacity: 0.55 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.34, ease: "easeOut" }}
    />
  );
}

/** 正解の輪（旧: spawnFxRing の平面版）。 */
export function HitRing({ id, combo }: { id: string | number; combo: number }) {
  return (
    <motion.span
      key={id}
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ border: `6px solid ${combo >= 3 ? "#ffc93c" : "#58c273"}` }}
      initial={{ width: 60, height: 60, opacity: 0.85 }}
      animate={{ width: 320, height: 320, opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    />
  );
}

/**
 * 用語が奥に現れる合図の輪（旧 spawnFxRing "portal" / 0.55秒で6倍）。
 * 水平線の上に小さく出るので、次がどこから来るかが分かる。
 */
export function PortalRing({ id, color }: { id: string | number; color: string }) {
  return (
    <motion.span
      key={id}
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ border: `3px solid ${color}`, boxShadow: `0 0 18px ${color}` }}
      initial={{ width: 26, height: 26, opacity: 0.95 }}
      animate={{ width: 156, height: 156, opacity: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    />
  );
}

/** 砕けて飛ぶ粒の数。旧アプリは26個。 */
const SHARDS = 18;

/**
 * 用語を止めたときの撃破演出（旧 explode）。
 * 粒が飛び散り、衝撃波の輪が広がり、閃光が一瞬走る。
 */
export function Burst({ id, color }: { id: string | number; color: string }) {
  return (
    <div key={id} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 閃光（旧 spawnFxFlash / 0.22秒） */}
      <motion.span
        className="absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 200,
          height: 200,
          background: `radial-gradient(circle, #ffffff 0%, ${color} 38%, transparent 72%)`,
        }}
        initial={{ scale: 0.6, opacity: 0.95 }}
        animate={{ scale: 2.6, opacity: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      />
      {/* 衝撃波の輪（旧 spawnFxRing "shock" / 0.6秒） */}
      <motion.span
        className="absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ border: `5px solid #ffffff`, boxShadow: `0 0 22px ${color}` }}
        initial={{ width: 40, height: 40, opacity: 0.9 }}
        animate={{ width: 620, height: 620, opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      {/* 砕けた粒（旧 explode の26個のキューブ） */}
      {Array.from({ length: SHARDS }, (_, i) => {
        // 飛ぶ向きは番号から決める。毎回同じでも散っていれば手ごたえは出る。
        const angle = (i / SHARDS) * Math.PI * 2 + (i % 3) * 0.4;
        const reach = 150 + ((i * 53) % 190);
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 block"
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: i % 2 === 0 ? "#ffc93c" : color,
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{
              x: Math.cos(angle) * reach,
              y: Math.sin(angle) * reach,
              rotate: 220,
              opacity: 0,
            }}
            transition={{ duration: 0.66, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

/**
 * 4択の残り時間を「近づいてくる時計」で見せる（旧 #mcq-clock）。
 * 旧アプリは 1.0 → 3.2倍に拡大し、終盤は赤くなる。
 * ここでは用語のうしろに置くので、言葉は最後まで読める。
 */
export function ApproachClock({ remaining }: { remaining: number }) {
  const ratio = Math.min(1, Math.max(0, 1 - remaining));
  const danger = ratio > 0.65;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-[40%] left-1/2 block text-[96px] leading-none"
      style={{
        transform: `translate(-50%, -50%) scale(${(1 + ratio * 2.2).toFixed(2)})`,
        opacity: (0.16 + ratio * 0.34).toFixed(2),
        filter: danger
          ? "drop-shadow(0 0 22px #f2654a)"
          : "drop-shadow(0 0 12px rgba(0,79,141,.45))",
      }}
    >
      ⏰
    </span>
  );
}
