"use client";

import { motion } from "motion/react";

/**
 * 舞台の上に重ねるDOMの演出。旧 wordtest の index.html / styles.css から移した。
 *
 *   ScorePop      … 旧 .score-pop（「+150」「OK!」が浮いて消える）
 *   DamageFlash   … 旧 #damage-flash（ライフが減った瞬間の全画面フラッシュ）
 *   ApproachClock … 旧 #mcq-clock（時計が近づいてくる。1.0→3.2倍、終盤は赤く）
 *   McqTerm       … 旧 #mcq-term（4択の間、用語をふりがな付きで出しておく）
 *
 * 3Dの中で起きること（出現の輪・撃破の粒・衝撃波・閃光）は three.js 側にある
 * （arcade-three.ts の spawnFxRing / explode）。ここには置かない。
 */

/** 加点ポップ。れんしゅうは「+150」、テストは「OK!」（旧 .pop-label）。 */
export function ScorePop({
  label,
  id,
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
      className={`pointer-events-none absolute top-[42%] left-1/2 -translate-x-1/2 font-black ${
        quiet ? "text-[26px]" : "text-[40px]"
      }`}
      style={{
        color: quiet ? "#4ee1ff" : "#ffd54a",
        textShadow: quiet
          ? "0 0 16px rgba(78,225,255,.9), 0 2px 0 rgba(0,0,0,.7)"
          : "0 0 18px rgba(255,176,32,.9), 0 2px 0 rgba(0,0,0,.7)",
      }}
      initial={{ y: 0, opacity: 0, scale: 0.4 }}
      animate={{ y: [0, -30, -160], opacity: [0, 1, 0], scale: [0.4, 1.15, 1] }}
      transition={{ duration: 0.9, times: [0, 0.18, 1], ease: [0.2, 0.8, 0.3, 1] }}
    >
      {label}
    </motion.span>
  );
}

/** ライフが減った瞬間の全画面フラッシュ（旧 #damage-flash / 340ms）。 */
export function DamageFlash({ id }: { id: string | number }) {
  return (
    <motion.div
      key={id}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(90% 90% at 50% 50%, rgba(255, 40, 70, 0.55), rgba(160, 0, 30, 0.9))",
      }}
      initial={{ opacity: 0.8 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.34, ease: "easeOut" }}
    />
  );
}

/**
 * 4択の残り時間を「近づいてくる時計」で見せる（旧 #mcq-clock）。
 * 拡大率・不透明度・赤くなる境目（65%）は原典のまま。
 */
export function ApproachClock({ remaining }: { remaining: number }) {
  const ratio = Math.min(1, Math.max(0, 1 - remaining));

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-[40%] left-1/2 text-[96px] leading-none"
      style={{
        transform: `translate(-50%, -50%) scale(${(1 + ratio * 2.2).toFixed(2)})`,
        opacity: (0.25 + ratio * 0.5).toFixed(2),
        filter:
          ratio > 0.65 ? "drop-shadow(0 0 22px #ff2200)" : "drop-shadow(0 0 12px rgba(0,0,0,0.6))",
        transition: "opacity .1s linear",
      }}
    >
      ⏰
    </span>
  );
}

/**
 * 4択の間に出しておく用語（旧 #mcq-term）。
 * 旧アプリは「問題だけ」モード専用だったが、迫る演出が終わったあとも
 * 学習者が言葉を見られるように、どのモードでも出す。
 */
export function McqTerm({ term, reading }: { term: string; reading: string }) {
  return (
    <span className="pointer-events-none absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[38px] leading-tight font-black whitespace-nowrap text-white sm:text-[56px]">
      <ruby>
        {term}
        <rt style={{ color: "#4ee1ff" }}>{reading}</rt>
      </ruby>
    </span>
  );
}
