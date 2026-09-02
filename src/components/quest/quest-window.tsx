"use client";

import type { ReactNode } from "react";

/**
 * JRPG の ウィンドウ枠 — 旧アプリ `renderJrpgWindow` の 移植
 *
 * ## サイトの カードに しない
 * ゲーム風UIが この 教材の 売り（2026-09-01 の 指定）。黒地・白い 3px の 枠・
 * 枠の 上に 乗る 黄色い 見出しは、**遊びの 場に 入った ことを 1目で 伝える**
 * 合図なので、アプリの やわらかい カード（`card-island`）に 置きかえない。
 *
 * 見出しは 枠線の 上に かぶせて 置く（`-top-3` ＋ 黒地）。原典と 同じ 見え方。
 */
export function QuestWindow({
  title,
  className = "",
  children,
}: {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex flex-col rounded border-[3px] border-slate-200 bg-black p-1.5 shadow-[inset_0_0_10px_rgba(255,255,255,0.1)] md:p-3 ${className}`}
    >
      {title ? (
        <div className="absolute -top-3 left-3 flex items-center bg-black px-2 text-xs font-bold tracking-widest text-yellow-300 md:text-sm">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * ゲームの 中の ボタン。**枠と 反転**で 押せる ことを 示す
 *（アプリの `btn-game` は 色も 影も ちがうので ここでは 使わない）。
 */
export function QuestButton({
  children,
  onClick,
  tone = "default",
  disabled,
  className = "",
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className" | "type">) {
  const face =
    tone === "primary"
      ? "border-yellow-300 bg-yellow-300 text-black hover:bg-yellow-200"
      : tone === "danger"
        ? "border-red-400 bg-black text-red-300 hover:bg-red-950"
        : "border-slate-400 bg-black text-white hover:border-white hover:bg-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border-[1.5px] px-4 py-2 text-sm font-bold tracking-wide transition-colors disabled:cursor-default disabled:opacity-40 ${face} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
