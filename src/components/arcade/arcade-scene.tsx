"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ARCADE_INK } from "./fields";
import type { ArcadeWorldProps } from "./arcade-canvas";

/**
 * 3Dの世界は**ブラウザでだけ**読み込む（`ssr: false`）。
 *
 * ふつうに import すると、three.js（708KB）が**サーバ側のバンドルにも**入る。
 * このアプリの Worker は無料プランの上限 3 MiB に対してすでに 3056KiB（99.5%）で、
 * 足した瞬間に上限を超えてデプロイが落ちた（実測）。3Dはブラウザでしか動かないので、
 * サーバに置く意味がない。ブラウザ専用にすると、three は静的アセット側だけに載る
 *（アセットは Worker のサイズに数えられない）。
 */
const ArcadeCanvas = dynamic(() => import("./arcade-canvas").then((m) => m.ArcadeCanvas), {
  ssr: false,
});

/**
 * 単語テストの舞台。画面いっぱいを使う。
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
  /**
   * 揺らす 合図の 通し番号。**番号が 変わるたびに ひと揺らし**する。
   *
   * 前は boolean だったので、2回 つづけて 外すと 2回目の 揺れが 出なかった
   *（class が 付いた ままで、CSSアニメーションが 再生されない）。
   * 0 は「まだ 何も 起きて いない」。
   */
  impactSeq = 0,
  /**
   * 揺れの 種類。
   * - `damage` … 落とした とき（縦横に 大きく 揺れる）
   * - `nudge`  … 読みの 打ち直し（**横に 小さく 揺れる**だけ。2026-08-27）
   */
  impactKind = "damage",
  children,
}: {
  world: Omit<ArcadeWorldProps, "onNear">;
  impactSeq?: number;
  impactKind?: "damage" | "nudge";
  children: ReactNode;
}) {
  // 用語が目の前に来ている間（旧 .shake-screen）。世界の側だけが知っている。
  const [near, setNear] = useState(false);
  const impactRef = useRef<HTMLDivElement>(null);

  /*
   * 番号が 変わったら **DOM に 直に** class を 付け直して ひと揺らしする。
   *
   * React の state に しないのは、同じ しるしが つづいた ときに
   * アニメーションを 再生し直せない（class が 付いた ままだと 動かない）ため。
   * ここは「外の 仕組み（DOM）を 今の 状態に そろえる」という、effect 本来の 仕事。
   */
  useEffect(() => {
    const el = impactRef.current;
    if (!el || !impactSeq) return;
    const cls = impactKind === "nudge" ? "arc-nudge" : "arc-damage";
    el.classList.remove("arc-damage", "arc-nudge");
    void el.offsetWidth; // 再生の やり直し（reflow を 1回 はさむ）
    el.classList.add(cls);
    const timer = setTimeout(() => el.classList.remove(cls), 480);
    return () => clearTimeout(timer);
    // impactKind は 番号と 一緒に 変わる ので、見張るのは 番号だけで よい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impactSeq]);

  return (
    <div className="fixed inset-0 z-40 overflow-hidden" style={{ background: ARCADE_INK }}>
      <style>{STAGE_CSS}</style>

      {/*
        旧アプリは body ごと揺らしていた。ここでは3Dの層だけを揺らす。
        舞台は画面いっぱいの重ね物なので、外枠ごと動かすと縁に下のページが覗く。
        外側＝外した ときの ひと揺らし、内側＝用語が 迫って いる 間の 小刻み。
        重ねる（入れ子に する）ことで、2つの 揺れが 打ち消し合わない。
      */}
      <div ref={impactRef} className="absolute inset-0">
        <div className={`absolute inset-0 ${near ? "arc-quake" : ""}`}>
          <ArcadeCanvas {...world} onNear={setNear} />
        </div>
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
/* 読みの 打ち直し（2026-08-27）。**横だけ**に 小さく 揺れる——
   落とした ときの 揺れと 見分けが つくように、回転も 縦の 動きも 入れない。 */
@keyframes arc-nudge{
  0%{translate:0 0}
  15%{translate:-16px 0}
  30%{translate:14px 0}
  45%{translate:-10px 0}
  60%{translate:8px 0}
  75%{translate:-4px 0}
  100%{translate:0 0}}
.arc-nudge{animation:arc-nudge .36s ease-out}
.arc-outline{text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 0 10px rgba(0,0,0,.8)}
@media (prefers-reduced-motion:reduce){.arc-quake,.arc-damage,.arc-nudge{animation:none}}
`;
