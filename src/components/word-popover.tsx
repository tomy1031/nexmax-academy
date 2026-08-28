"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * ことばの 吹き出しの **置き場所**（本文の 辞書・診断の 語彙メモで 同じ ものを つかう）
 *
 * ## なぜ ページの いちばん外へ 出すのか（2026-08-28 の 指摘）
 * 吹き出しは これまで 下線の すぐ となりに `position: absolute` で 置いて いた。
 * ところが 親に `overflow: hidden` が あると **そこで 切られる**——
 * 表紙（`hero`）は 角を まるめる ために `overflow-hidden` を 付けて いるので、
 * 表紙の 中の ことばを 引くと 吹き出しの 左半分が 消え、字が 読めなかった。
 * 「前面に 出ない」ように 見えるが、正体は **重なりでは なく 切り取り**である。
 *
 * z-index を 上げても 直らない。切っているのは 親の 枠なので、
 * **親の 外（`document.body`）へ 出して `position: fixed` で 置く**しかない。
 * こうすると 親の `overflow` にも 重なりの 順にも 左右されない——
 * どの ページの、どんな 枠の 中の ことばでも 同じように 出る。
 *
 * ## 画面が 動いたら 置き直す
 * `fixed` は 画面に 対する 座標なので、スクロールすると ことばだけが 動いて
 * 吹き出しが 取り残される。だから スクロールと 画面の 大きさ変えで 置き直す
 *（閉じない——指の きかいでは 読んで いる 最中に 消えて しまう）。
 */

/** 吹き出しの 実寸（Tailwind の w-60 と そろえる）。 */
export const POPOVER_WIDTH = 240;
/** 上に 出すか 下に 出すかを 決める ための 目やすの 高さ。 */
export const POPOVER_HEIGHT = 120;
/** 画面の ふちに 触れさせない 余白。 */
export const EDGE_MARGIN = 12;
/** ことばと 吹き出しの あいだ。 */
const GAP = 8;

/**
 * 置き場所は **絵を 描く 前**に 決める（`useLayoutEffect`）。
 * 描いた あとに 決めると、開いた 1こまだけ 前の 場所に 出て ちらつく。
 * サーバ側では 走らない ので、そこだけ `useEffect` に 差し替える（警告が 出る ため）。
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Placement {
  readonly left: number;
  readonly top: number;
  /** ことばの 下に 出すか（上に 出す ときは 上へ ずらす）。 */
  readonly below: boolean;
}

export function WordPopover({
  id,
  anchorRef,
  open,
  height = POPOVER_HEIGHT,
  children,
}: {
  id: string;
  /** 下線を 引いた ことばの ボタン。ここを 基準に 置く。 */
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  /** 中身の 高さの 目やす（上に 出せるかの 判定に つかう）。段の 多い 吹き出しは 大きく。 */
  height?: number;
  children: ReactNode;
}) {
  const [at, setAt] = useState<Placement | null>(null);

  useIsomorphicLayoutEffect(() => {
    // 閉じた ときは 何も しない（`at` は 残るが、閉じて いれば 描かない）
    if (!open) return;
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = rect.top < height + EDGE_MARGIN;
      const centerX = rect.left + rect.width / 2;
      const rightmost = Math.max(EDGE_MARGIN, window.innerWidth - POPOVER_WIDTH - EDGE_MARGIN);
      setAt({
        left: Math.min(Math.max(centerX - POPOVER_WIDTH / 2, EDGE_MARGIN), rightmost),
        top: below ? rect.bottom + GAP : rect.top - GAP,
        below,
      });
    };
    place();
    // 捕捉フェーズで 聞く——中の スクロールする 枠（会話のログなど）も 拾う
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchorRef, height]);

  if (!open || !at || typeof document === "undefined") return null;

  return createPortal(
    <div
      id={id}
      role="note"
      style={{
        position: "fixed",
        left: at.left,
        top: at.top,
        width: POPOVER_WIDTH,
        transform: at.below ? undefined : "translateY(-100%)",
        /*
         * ふたの ある 画面（ポップアップ・しゅうりょうしょう）より 下、
         * ふつうの 画面の どの 部品よりも 上。
         */
        zIndex: 90,
      }}
      /*
       * **さわれない ようにする**。マウスの きかいは「ことばから 離れたら 閉じる」ので、
       * 吹き出し 自身が マウスを 受けると 開いた 瞬間に ちらつく。
       * 指の きかいでも、吹き出しの 下に ある ことばを 押せる ほうが 迷わない。
       */
      className="border-sky text-ink pointer-events-none rounded-2xl border-2 bg-white px-4 py-3 text-left text-xs leading-relaxed font-bold shadow-[0_6px_18px_rgba(0,79,141,.22)]"
    >
      {children}
    </div>,
    document.body,
  );
}
