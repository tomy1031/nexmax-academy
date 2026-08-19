"use client";

import { motion } from "motion/react";

/**
 * はなせた こと — 進み具合を 1行で 見せる チップ
 *
 * ## 伏せ札を やめた（2026-08-18）
 * もとは「🎴 きょうの しつもん」という 伏せ札の 並びだった。P2 の「開く箱」は
 * **学習者が 自分で 引き出した もの**を 開けるから 効くのであって、順番に 聞かれる
 * 質問を 伏せても 発見は 起きない。しかも 名前が「きょうの しつもん」だったので、
 * **自分が 質問を するのか** と 読めた（クライアント指摘）。
 *
 * いまは「はなせた こと」。**自分が 話せた 記録**として 見せる——数が ふえる ことが
 * そのまま ごほうびに なる（P2）。開かない ままの ものは 番号だけで 静かに 置く
 *（できなかった ことを 数えて 見せない — P8）。
 */
export function ProgressChips({
  total,
  openIds,
  order,
  currentId,
  justOpenedId,
}: {
  /** ぜんぶで いくつ 聞かれるか。 */
  total: number;
  /** 話せた しつもんの id。 */
  openIds: ReadonlySet<string>;
  /** しつもんの 並び（id）。 */
  order: readonly string[];
  /** いま 聞かれて いる しつもんの id。 */
  currentId: string | null;
  /** いま 開いた ばかりの id（1回だけ 光らせる）。 */
  justOpenedId: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <span className="mr-1 text-xs font-extrabold text-white/70">
        ラウンド 1・はなせた こと（{openIds.size} / {total}）
      </span>
      {order.map((id, at) => {
        const open = openIds.has(id);
        const now = currentId === id;
        return (
          <motion.span
            key={id}
            aria-label={open ? `${at + 1}ばんめ はなせました` : `${at + 1}ばんめ`}
            animate={justOpenedId === id ? { scale: [1, 1.35, 1] } : { scale: 1 }}
            transition={{ duration: 0.5 }}
            className="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-extrabold"
            style={{
              background: open
                ? "var(--color-leaf)"
                : now
                  ? "rgba(255,255,255,0.28)"
                  : "rgba(255,255,255,0.10)",
              color: open || now ? "#fff" : "rgba(255,255,255,0.55)",
            }}
          >
            {open ? "✓" : at + 1}
          </motion.span>
        );
      })}
    </div>
  );
}
