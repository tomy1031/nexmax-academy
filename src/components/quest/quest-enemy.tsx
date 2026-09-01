"use client";

import { useMemo } from "react";
import { enemySvg } from "./enemy-svg";

/**
 * 敵の 絵の わく
 *
 * 中身は `enemy-svg.ts` が 返す **旧アプリの SVG 文字列**（逐語移植）。
 * 学習者の 入力も 教材データも 混ざらない **こちらが 書いた 固定の しるし**なので、
 * そのまま 差しこむ。ルビの ように 文字を 組み立てる 用途では ない
 *（`ruby-text.tsx` が innerHTML を 避けて いるのは、旧アプリが ルビHTMLを
 * 流し込んで いた 反省で、この 絵は その 話とは 別）。
 */
export function EnemyArt({ phaseId, size = 112 }: { phaseId: number; size?: number }) {
  const markup = useMemo(() => enemySvg(phaseId), [phaseId]);
  return (
    <div
      aria-hidden
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
