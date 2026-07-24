"use client";

import { motion, useReducedMotion } from "motion/react";

/** ふわふわの雲（SVG）。 */
export function Cloud({ size = 120, opacity = 0.9 }: { size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 120 60" width={size} height={size / 2} aria-hidden style={{ opacity }}>
      <g fill="#ffffff">
        <ellipse cx="38" cy="40" rx="26" ry="16" />
        <ellipse cx="66" cy="30" rx="24" ry="18" />
        <ellipse cx="90" cy="42" rx="22" ry="13" />
      </g>
    </svg>
  );
}

/** ゆっくり回る太陽。 */
export function Sun({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <g className="animate-spin-slow origin-center" fill="#ffc93c">
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x="47"
            y="2"
            width="6"
            height="16"
            rx="3"
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
      </g>
      <circle cx="50" cy="50" r="24" fill="#ffd76a" />
      <circle cx="50" cy="50" r="24" fill="none" stroke="#f0a819" strokeWidth="3" />
    </svg>
  );
}

/** 画面を横切ってただよう雲のレイヤー。 */
export function DriftingClouds() {
  const clouds = [
    { top: "6%", size: 150, duration: 55, delay: 0, opacity: 0.95 },
    { top: "16%", size: 100, duration: 70, delay: -25, opacity: 0.8 },
    { top: "28%", size: 130, duration: 62, delay: -45, opacity: 0.7 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {clouds.map((c, i) => (
        <div
          key={i}
          className="animate-drift absolute -left-40"
          style={{
            top: c.top,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          <Cloud size={c.size} opacity={c.opacity} />
        </div>
      ))}
    </div>
  );
}

/** ふわりと旋回する紙ひこうき（メッセージ＝報連相のモチーフ）。 */
export function PaperPlane({ size = 64 }: { size?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      animate={
        reduced
          ? undefined
          : { x: [0, 26, 0, -26, 0], y: [0, -18, -4, -14, 0], rotate: [0, 9, 0, -9, 0] }
      }
      transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
    >
      <g>
        <path d="M4 30 L60 8 L36 56 L28 38 Z" fill="#ffffff" stroke="#0288d1" strokeWidth="3" />
        <path d="M28 38 L60 8" stroke="#0288d1" strokeWidth="3" />
        <path d="M28 38 L30 50" stroke="#9db0c2" strokeWidth="2.5" />
      </g>
    </motion.svg>
  );
}
