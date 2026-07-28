"use client";

import { motion } from "motion/react";

/**
 * ごほうびの演出。
 *
 * 旧アプリ「まなびの島」の「木の実コイン＋島スタンプ」の考え方は引き継ぐが、
 * 見た目はあおぞらパスウェイの色でつくり直す。演出は必ず学習行為に紐づける
 *（正解したときだけ出す。常時アニメで注意を奪わない — 設計04 §5）。
 */

const CONFETTI_COLORS = [
  "var(--color-sun)",
  "var(--color-leaf)",
  "var(--color-coral)",
  "var(--color-sky)",
  "var(--color-grape)",
];

/** 正解のときだけ出る紙ふぶき。 */
export function CelebrationBurst({ pieces = 14 }: { pieces?: number }) {
  return (
    <div aria-hidden className="pointer-events-none relative h-0">
      {Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute top-0 left-1/2 block h-2 w-2 rounded-[2px]"
            style={{ background: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
            animate={{
              x: Math.cos(angle) * (60 + (i % 4) * 18),
              y: Math.sin(angle) * (40 + (i % 3) * 16) + 30,
              opacity: 0,
              scale: 1,
              rotate: 180,
            }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

/** たまっていくスタンプ。数が増えることが進み具合そのもの。 */
export function StampRow({ count, max = 8 }: { count: number; max?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`せいかい ${count}こ`}>
      {Array.from({ length: Math.min(count, max) }, (_, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 16 }}
          className="text-base leading-none"
        >
          ⭐
        </motion.span>
      ))}
      {count > max && <span className="text-ink-soft text-xs font-extrabold">+{count - max}</span>}
    </span>
  );
}
