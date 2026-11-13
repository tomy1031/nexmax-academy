"use client";

import { assetUrl } from "@/lib/asset-url";

/**
 * 立ち絵の 顔の ところだけを 丸く 切って 小さく 出す（メッセージ・「もしも」の 場面）。
 * 立ち絵は 頭が 上の 3割に ある ので、上に 寄せて 大きく する。
 */
export function FaceIcon({ src, size = 36 }: { src: string; size?: number }) {
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden rounded-full border-2 bg-white"
      style={{ width: size, height: size, borderColor: "var(--color-leaf)" }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 小さな 丸の 中に 立ち絵の 顔だけを 寄せて 出す */}
      <img
        src={assetUrl(src) ?? src}
        alt=""
        className="absolute inset-0 h-full w-full"
        style={{
          objectFit: "cover",
          objectPosition: "50% 0%",
          transform: "scale(2.1)",
          transformOrigin: "50% 6%",
        }}
      />
    </span>
  );
}
