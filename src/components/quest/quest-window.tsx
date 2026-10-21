"use client";

import type { ReactNode } from "react";

/**
 * JRPG の ウィンドウ枠 — ドットの 白い 枠（2026-10-20 に ドット絵へ 作りかえ）
 *
 * ## サイトの カードに しない
 * ゲーム風UIが この 教材の 売り（2026-09-01 の 指定）。黒地・白い 枠・枠の 上に 乗る
 * 黄色い 見出しは、**遊びの 場に 入った ことを 1目で 伝える** 合図なので、
 * アプリの やわらかい カード（`card-island`）に 置きかえない。
 *
 * 枠は `quest-styles.ts` の `.qx-win`（角を 1段 けずった 9分割の 絵）。
 * 見出しは **本物の 字**で 置く（CSS の `content` に すると 画面の 読み上げにも
 * e2e の `getByText("PARTY")` にも 見えない）。
 */
export function QuestWindow({
  title,
  className = "",
  children,
  ...rest
}: {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "title" | "className" | "children">) {
  return (
    <div className={`qx-win ${className}`} {...rest}>
      {title ? <div className="qx-win-title">{title}</div> : null}
      {children}
    </div>
  );
}

/**
 * ゲームの 中の ボタン。**白い 枠と 角の 欠け**で 押せる ことを 示す
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
  tone?: "default" | "primary" | "blue" | "danger";
  disabled?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className" | "type">) {
  const face =
    tone === "primary"
      ? "qx-primary"
      : tone === "blue"
        ? "qx-blue"
        : tone === "danger"
          ? "qx-danger"
          : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`qx-btn ${face} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
