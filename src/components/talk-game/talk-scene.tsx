"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { AffinityRing } from "./affinity-ring";

/**
 * 会話の 舞台 — 背景・立ち絵・名前ふだ・好感度の リング
 *
 * ## なぜ 全画面なのか
 * 見本（共感コミュニケーション）と 同じで、**背景と 立ち絵で その場に 居る**形に する。
 * ミーティングの Zoom 風の 画面は「会議に 入る 練習」だった——こちらは
 * 社長室で 面と 向かって 話す 練習なので、四角い タイルでは 場が 立たない。
 *
 * ## 立ち絵は 右、ことばは 下
 * 日本語の 文は 左から 読むので、字を 左下に 置くと 目の 動きが 短い。
 * 立ち絵を 右に 置いて、左下の セリフ枠と 重ならない ように する
 *（390px の 実機幅でも 立ち絵の 顔が セリフ枠に 隠れない ように、下端で 切る）。
 */
export function TalkScene({
  background,
  figure,
  hostName,
  hostRole,
  percent,
  goal,
  gained,
  furigana,
  bright,
  children,
}: {
  background: string;
  figure: string;
  hostName: string;
  hostRole: string;
  percent: number;
  goal: number;
  gained?: number;
  furigana: FuriganaIndex;
  /** 結果の 画面は 背景を 明るく する（見本の 07 と 同じ）。 */
  bright?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {bright ? (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, var(--color-bg-mid) 0%, var(--color-sky-soft) 60%, var(--color-panel-tint) 100%)",
          }}
        />
      ) : (
        <Image
          src={background}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          aria-hidden
        />
      )}

      {/* 立ち絵。下端で 切って、セリフ枠の うしろへ 立たせる */}
      <motion.div
        key={figure}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        /*
         * 実機の 幅（390px）では **横に 細い 箱**に なる ので、`object-contain` が
         * 幅で 縮めて 立ち絵が 小さく なる。スマホでは 箱を 横に 広げて、
         * 人が セリフ枠の うしろに ちゃんと 立って いるように 見せる。
         */
        className="pointer-events-none absolute right-0 bottom-0 h-[60%] w-[80%] sm:h-[88%] sm:w-[46%]"
      >
        <Image
          src={figure}
          alt={hostName}
          fill
          sizes="50vw"
          className="object-contain object-bottom"
        />
      </motion.div>

      {/* 左上: だれと 話して いるか */}
      <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
        {/* 役職も 名前も 教材の 字。**裸の 漢字を 出さない**（規律2）ので ルビを 合成する。 */}
        <span
          className="text-on-accent rounded-full px-3 py-1 text-xs font-black shadow"
          style={{ background: "var(--color-coral-deep)" }}
        >
          <RubyText text={hostRole} index={furigana} show />
        </span>
        <span className="text-navy rounded-full bg-white/90 px-3 py-1 text-sm font-black shadow">
          <RubyText text={hostName} index={furigana} show />
        </span>
      </div>

      {/* 右上: 好感度 */}
      <div className="absolute top-3 right-3">
        <AffinityRing percent={percent} goal={goal} gained={gained} />
      </div>

      {children}
    </div>
  );
}
