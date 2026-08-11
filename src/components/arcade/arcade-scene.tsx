"use client";

import { useState, type ReactNode } from "react";
import { ARCADE_INK } from "./fields";
import { ArcadeCanvas, type ArcadeWorldProps } from "./arcade-canvas";

/**
 * ことばアーケードの舞台。画面いっぱいを使う。
 *
 * 旧アプリの中心体験は「巨大な用語が奥から自分に迫ってくる」こと。
 * これはページの中の小さな枠では成立しない（枠に入れた瞬間に緊張感が消える）。
 * だから舞台は fixed inset-0 の全画面オーバーレイにする。
 *
 * 中身の重ね順は旧 index.html / styles.css のまま:
 *   #game-canvas(1) → #fx-vignette(4) → #damage-flash(5) → 時計(6) → #fx-popups(8) → #ui-layer(10)
 */
export function ArcadeScene({
  world,
  /** 被弾したら舞台をひと揺らしする（旧 .damage-shake）。 */
  impact = false,
  children,
}: {
  world: Omit<ArcadeWorldProps, "onNear">;
  impact?: boolean;
  children: ReactNode;
}) {
  // 用語が目の前に来ている間（旧 .shake-screen）。世界の側だけが知っている。
  const [near, setNear] = useState(false);

  // 旧アプリは body ごと揺らしていた。ここでは3Dの層だけを揺らす。
  // 舞台は画面いっぱいの重ね物なので、外枠ごと動かすと縁に下のページが覗く。
  // 揺れて見えるものは同じ（画面いっぱいの世界）なので見え方は変わらない。
  const shake = impact ? "arc-damage" : near ? "arc-quake" : "";

  return (
    <div className="fixed inset-0 z-40 overflow-hidden" style={{ background: ARCADE_INK }}>
      <style>{STAGE_CSS}</style>

      <div className={`absolute inset-0 ${shake}`}>
        <ArcadeCanvas {...world} onNear={setNear} />
      </div>

      {/* 画面周辺を締めるビネット＋上下のシネマグラデーション（旧 #fx-vignette） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 4,
          background: `radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(4, 6, 14, 0.42) 100%),
            linear-gradient(to bottom, rgba(4, 6, 14, 0.35), transparent 12%, transparent 88%, rgba(4, 6, 14, 0.45))`,
        }}
      />

      {/*
        旧 #ui-layer（z-index 10）。時計や用語（6）より上に来るようにまとめる。
        操作できるのは中の .pointer-events-auto だけ（旧 .interactive と同じ考え）。
      */}
      <div className="pointer-events-none absolute inset-0" style={{ zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
}

/** 四隅のHUD。中央の用語より「格下」に見えるよう、影を弱く小さく置く。 */
export function HudChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border-2 border-white px-3 py-1"
      style={{
        background: "rgba(255,250,240,.92)",
        boxShadow: "0 2px 0 rgba(0,79,141,.18)",
      }}
    >
      <span className="text-[10px] font-black tracking-widest text-[#5a7089]">{label}</span>
      <span className="text-lg leading-none font-black" style={{ color: accent ?? "#1f3a56" }}>
        {value}
      </span>
    </span>
  );
}

/**
 * 舞台だけで使うキーフレーム（旧 styles.css の .shake-screen / .damage-shake）。
 * globals.css は共有ファイルなので、ここに閉じ込めて持ち歩く。
 */
const STAGE_CSS = `
@keyframes arc-shake{
  0%{translate:1px 1px;rotate:0deg}
  25%{translate:-3px 0;rotate:1deg}
  50%{translate:-1px 2px;rotate:-1deg}
  75%{translate:3px 1px;rotate:0deg}
  100%{translate:1px -2px;rotate:-1deg}}
.arc-quake{animation:arc-shake .5s infinite}
@keyframes arc-damage{
  0%{translate:0 0;rotate:0deg}
  15%{translate:-14px 6px;rotate:-1.5deg}
  30%{translate:13px -7px;rotate:1.5deg}
  45%{translate:-11px 5px;rotate:-1deg}
  60%{translate:9px -5px;rotate:1deg}
  75%{translate:-6px 3px;rotate:0deg}
  100%{translate:0 0;rotate:0deg}}
.arc-damage{animation:arc-damage .48s ease-out}
.arc-outline{text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 0 10px rgba(0,0,0,.8)}
@media (prefers-reduced-motion:reduce){.arc-quake,.arc-damage{animation:none}}
`;
