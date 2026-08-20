"use client";

import { SPEECH_SPEEDS, type SpeechSpeedId } from "@/lib/meeting/speed";

/**
 * 相手の 話す 速さを 選ぶ（入る 前と 話して いる 間の どちらでも）
 *
 * 3つだけに するのは、選ぶ こと自体を 学習の じゃまに しない ため。
 * 置き場は 2か所——**さんかする 前の 画面**（はじめの ひとことから 効かせる）と、
 * **Zoom の 画面の 中**（速いと 気づいた その場で 変えられる）。
 */
export function SpeechSpeedPicker({
  value,
  onChange,
  tone = "dark",
  disabled = false,
}: {
  value: SpeechSpeedId;
  onChange: (id: SpeechSpeedId) => void;
  /** 置く 場所の 地の色。暗い 枠の 中（Zoom）と 明るい カードの 上で 字の色を 変える。 */
  tone?: "dark" | "light";
  /**
   * いま 触れない ばんか（話して いる 間・見かたを 待って いる 間）。
   * **消さずに 灰色で 残す**——消えると「さっき あった ものが 無い」と 探しはじめる。
   */
  disabled?: boolean;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-1.5 ${disabled ? "opacity-40" : ""}`}
    >
      <span className={`text-xs font-extrabold ${dark ? "text-white/70" : "text-ink-soft"}`}>
        はなす はやさ
      </span>
      {SPEECH_SPEEDS.map((speed) => {
        const on = speed.id === value;
        return (
          <button
            key={speed.id}
            type="button"
            onClick={() => onChange(speed.id)}
            aria-pressed={on}
            disabled={disabled}
            className="rounded-full px-3 py-1 text-xs font-extrabold"
            style={{
              background: on
                ? dark
                  ? "rgba(255,255,255,0.9)"
                  : "var(--color-navy)"
                : dark
                  ? "rgba(255,255,255,0.12)"
                  : "var(--color-panel-tint)",
              color: on
                ? dark
                  ? "#0f2233"
                  : "#fff"
                : dark
                  ? "rgba(255,255,255,0.7)"
                  : "var(--color-ink-soft)",
            }}
          >
            {speed.label}
          </button>
        );
      })}
    </div>
  );
}
