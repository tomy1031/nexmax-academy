"use client";

import { motion } from "motion/react";

/**
 * 手ごたえの演出。旧アプリ（DATA DIVE）の演出をそのまま移す。
 *
 * 移植したもの:
 *   scorePop      … 「+150」「OK!」が浮いて消える
 *   damage flash  … ライフが減った瞬間の全画面フラッシュ
 *   shake         … 読みを外したときの入力欄のふるえ
 *
 * 変えたのは色だけ。旧アプリの赤 #ff5470 は、島の世界に合わせて
 * やわらかい珊瑚色 #ff8a70 にする（挙動・時間は原典どおり）。
 */

/** 加点ポップ。れんしゅうは「+150」、テストは「OK!」。 */
export function ScorePop({ label, id }: { label: string; id: string | number }) {
  return (
    <motion.span
      key={id}
      aria-hidden
      className="pointer-events-none absolute top-[34%] left-1/2 -translate-x-1/2 text-4xl font-black"
      style={{ color: "#f0a819", WebkitTextStroke: "3px #fff", paintOrder: "stroke fill" }}
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
      style={{ background: "#ff8a70" }}
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
