"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * 「6つの しつもん」 — 答えると ひらく カードの 列
 *
 * ## 伏せ札を やめ、そして 戻って きた（2026-08-20）
 * もとは 伏せ札 →「はなせた こと（n/m）」の 小さな チップ → いまの カード列。
 * チップは 場所を 取らない かわりに、**きょう 何を するのかが 分からなかった**。
 * 添付の 画面（2026-08-20 の 指定）に そろえて、
 * **答えた ものは しつもんの ことばが 見え、まだの ものは ？ で 伏せる**形に する。
 *
 * これは P2 の「開く箱」——できなかった ことを 数えるのでは なく、
 * **ひらいた 数が そのまま ごほうびに なる**（P8: 罰を 見せない）。
 */
export function QuestionCards({
  order,
  labels,
  openIds,
  currentId,
  justOpenedId,
  furigana,
}: {
  /** しつもんの 並び（id）。 */
  order: readonly string[];
  /** id → カードに 出す みじかい ことば。 */
  labels: Readonly<Record<string, string>>;
  /** 話せた しつもんの id。 */
  openIds: ReadonlySet<string>;
  /** いま 聞かれて いる しつもんの id。 */
  currentId: string | null;
  /** いま 開いた ばかりの id（1回だけ 光らせる）。 */
  justOpenedId: string | null;
  /** 教材の 読み辞書（カードの 漢字に ふりがなを 合成する）。 */
  furigana: FuriganaIndex;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-sky)_14%,white)] p-3">
      <p className="text-navy mb-2 text-sm font-black">
        🎁 {order.length}つの しつもん
        <span className="text-ink-soft ml-2 text-xs font-bold">
          こたえると、カードが ひらきます（{openIds.size} / {order.length}）
        </span>
      </p>
      <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {order.map((id, at) => {
          const open = openIds.has(id);
          const now = currentId === id;
          return (
            <motion.li
              key={id}
              aria-label={open ? `${at + 1}ばんめ こたえました` : `${at + 1}ばんめ まだです`}
              animate={justOpenedId === id ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
              className="relative min-h-[72px] rounded-xl border-2 px-1.5 py-4 text-center"
              style={{
                background: open ? "#fff" : "color-mix(in srgb, var(--color-sky) 22%, white)",
                borderColor: now ? "var(--color-sky-deep)" : "transparent",
              }}
            >
              <span
                className="absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-white"
                style={{ background: open ? "var(--color-leaf)" : "var(--color-sky-deep)" }}
              >
                {open ? "✓" : at + 1}
              </span>
              {open ? (
                <span className="text-ink block text-[11px] leading-snug font-black break-words">
                  <RubyText text={labels[id] ?? ""} index={furigana} show />
                </span>
              ) : (
                <span className="text-sky-deep block text-lg font-black opacity-70">？</span>
              )}
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
