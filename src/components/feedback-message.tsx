"use client";

import { motion } from "motion/react";
import { getFeedback, type FeedbackKey, type FeedbackTone } from "@/lib/feedback";

/**
 * フィードバック表示 — 受け取れるのは FeedbackKey だけ（設計03 §1.3-1）。
 * 画面側で「不正解です」のような文字列を書く余地をなくすための構造。
 */

const TONE_STYLE: Record<FeedbackTone, { emoji: string; face: string; ink: string }> = {
  praise: { emoji: "🎉", face: "var(--color-leaf)", ink: "#1c5f31" },
  encourage: { emoji: "💪", face: "var(--color-sun)", ink: "#6b4a00" },
  hint: { emoji: "💡", face: "var(--color-sky)", ink: "#083f5c" },
  info: { emoji: "🤖", face: "var(--color-grape)", ink: "#3d2a72" },
};

export function FeedbackMessage({
  messageKey,
  className,
}: {
  messageKey: FeedbackKey;
  className?: string;
}) {
  const feedback = getFeedback(messageKey);
  const tone = TONE_STYLE[feedback.tone];

  return (
    <motion.div
      key={messageKey}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 24 }}
      className={`flex items-start gap-3 rounded-[var(--radius-card)] border-2 px-4 py-3 ${className ?? ""}`}
      style={{
        borderColor: tone.face,
        background: "color-mix(in srgb, var(--color-panel) 88%, white)",
      }}
    >
      <span aria-hidden className="text-2xl leading-none">
        {tone.emoji}
      </span>
      <span className="leading-snug">
        <span className="block font-extrabold" style={{ color: tone.ink }}>
          {feedback.title}
        </span>
        {feedback.next && (
          <span className="text-ink-soft block text-sm font-bold">{feedback.next}</span>
        )}
      </span>
    </motion.div>
  );
}
