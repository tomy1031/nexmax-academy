"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

/**
 * 舞台の上に浮くパネル（ステージ選択・モード選択・解説・けっか等）。
 *
 * 旧アプリの `.panel` を島の配色に置き換えたもの。
 * かたち（角丸・枠・下方向のハードシャドウ）は /map のレッスンカードに合わせる。
 */
export function ArcadePanel({
  kicker,
  title,
  children,
  className = "",
}: {
  kicker?: string;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={`pointer-events-auto max-h-[84dvh] w-full overflow-y-auto rounded-[28px] border-4 border-white bg-[#fffaf0]/97 p-5 shadow-[0_7px_0_#b8deed,0_18px_32px_rgba(0,79,141,.25)] backdrop-blur-sm sm:p-6 ${className}`}
    >
      {kicker && (
        <p className="text-sky text-[11px] font-black tracking-[0.24em] uppercase">{kicker}</p>
      )}
      {title && <h2 className="text-navy mt-1 text-2xl font-black sm:text-3xl">{title}</h2>}
      {children}
    </motion.section>
  );
}

/** 舞台の上のゲームボタン。色は用途で決める。 */
export function ArcadeButton({
  children,
  onClick,
  type = "button",
  tone = "primary",
  className = "",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: keyof typeof TONES;
  className?: string;
  disabled?: boolean;
}) {
  const { face, shadow, ink } = TONES[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn-game px-5 py-3 disabled:opacity-45 ${className}`}
      style={{ "--btn-face": face, "--btn-shadow": shadow, color: ink } as React.CSSProperties}
    >
      {children}
    </button>
  );
}

/** /map のCTAと同じ色づかい。ピンク＝主役、黄＝サブ、白＝控えめ。 */
const TONES = {
  primary: { face: "#f26fa7", shadow: "#d94d84", ink: "#fff" },
  sub: { face: "#ffc93c", shadow: "#f0a819", ink: "#4a3200" },
  go: { face: "#58c273", shadow: "#3aa458", ink: "#fff" },
  info: { face: "#4fa8e8", shadow: "#0272ae", ink: "#fff" },
  quiet: { face: "#ffffff", shadow: "#cfe6f3", ink: "#1f3a56" },
} as const;
