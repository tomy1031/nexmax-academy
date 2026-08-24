"use client";

import { motion } from "motion/react";

/**
 * 好感度の 丸い メーター（％）
 *
 * ## なぜ 丸なのか
 * 見本（共感コミュニケーション）と 同じ 形に する——**画面の 右上に 1つだけ**
 * 置いて、会話の あいだ ずっと 目に 入る 場所に する。棒に すると 下の
 * セリフ枠と ぶつかり、立ち絵に かかる。
 *
 * ## 減る道を 置かない（設計01 P8）
 * 計算側（`src/lib/talkgame/affinity.ts`）に 減らす道が 無いのと 同じで、ここにも
 * 「減った」を 見せる 表現を 置かない。リングの 空いて いる ところは
 * **まだ 通って いない 道**で あって、失った ものでは ない。
 */

const SIZE = 96;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function AffinityRing({
  percent,
  goal,
  gained,
  label = "こうかんど",
}: {
  percent: number;
  goal: number;
  /** いま 上がった ぶん。ここだけ ポップさせる。 */
  gained?: number;
  label?: string;
}) {
  const ratio = goal > 0 ? Math.max(0, Math.min(1, percent / goal)) : 0;
  const full = percent >= goal;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="relative grid place-items-center rounded-full bg-white/95 shadow-lg"
        style={{ width: SIZE, height: SIZE }}
        role="img"
        aria-label={`${label} ${percent}パーセント`}
      >
        <svg width={SIZE} height={SIZE} className="absolute inset-0 -rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-hairline)"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={full ? "var(--color-sun-deep)" : "var(--color-coral-deep)"}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={false}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - ratio) }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
          />
        </svg>
        <span className="text-ink-soft relative text-[10px] font-extrabold">{label}</span>
        <motion.span
          className="relative text-lg leading-none"
          style={{ color: "var(--color-coral-deep)" }}
          key={percent}
          initial={{ scale: 0.7 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 14 }}
        >
          ♥
        </motion.span>
        <span className="text-navy relative text-lg font-black tabular-nums">{percent}%</span>
      </div>
      {gained && gained > 0 ? (
        <motion.span
          className="text-coral-deep text-xs font-extrabold"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          (+{gained})
        </motion.span>
      ) : null}
    </div>
  );
}
