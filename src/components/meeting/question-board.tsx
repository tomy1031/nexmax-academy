"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * ？？？ポイントボード — 話が進むと 札が 開いていく（設計01 P2「開く箱」）
 *
 * ## なぜ伏せておくのか
 * きょう聞かれることを最初から全部見せると、会話は「上から順に処理する作業」になる。
 * 伏せておくと、**答えられた瞬間に1枚めくれる**——学習行為そのものが鍵になる。
 * たいわ（listening/live-mode.tsx）の要件ボードと同じ考え方で、同じ「？？？」を使う。
 *
 * ## 開いた札に何を書くか
 * 質問の**要約は作らない**（要約はAIが要るうえ、毎回ちがう言い方になって
 * 札の名前が安定しない）。番号＋✅＋機械的に短くした問いだけを出す。
 * 中身（学習者が何と答えたか）は、おわりの きろくカードで読む。
 *
 * ## 祝いは小さく
 * 開いた瞬間にフリップ＋✨をひとつ。紙吹雪までやると、6回鳴って うるさくなる。
 */

export interface BoardItem {
  readonly id: string;
  /** 開いたときに出す短い問い（`shortAsk` を通したもの）。 */
  readonly short: string;
}

export function QuestionBoard({
  items,
  /** 開いた札。 */
  openIds,
  /** いま聞かれている札（まだ開かない・光るだけ）。 */
  currentId,
  /** いちばん最近ひらいた札。ここにだけ ✨ を出す。 */
  justOpenedId,
  furigana,
}: {
  items: readonly BoardItem[];
  openIds: ReadonlySet<string>;
  currentId: string | null;
  justOpenedId: string | null;
  furigana: FuriganaIndex;
}) {
  return (
    // スマホでは たたんで 会話に 集中できる（画面の脇に置けるのは 広い画面だけ）
    <details open className="card-island p-4">
      <summary className="text-ink cursor-pointer text-sm font-extrabold">
        🎴 きょうの しつもん（{openIds.size} / {items.length}）
      </summary>

      <ul className="mt-3 flex flex-wrap gap-2 lg:flex-col">
        {items.map((item, i) => {
          const open = openIds.has(item.id);
          const now = !open && item.id === currentId;
          return (
            <motion.li
              key={item.id}
              layout
              className="relative min-w-0"
              style={{ perspective: 600 }}
            >
              <motion.div
                /* 開いた瞬間だけ めくる（key が変わるので アニメーションが 1度 走る） */
                key={open ? "open" : "closed"}
                initial={open ? { rotateX: -90, opacity: 0.35 } : false}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 20 }}
                className="border-hairline rounded-[var(--radius-button)] border-2 px-3 py-1.5"
                style={{
                  background: open
                    ? "var(--color-sky-soft)"
                    : now
                      ? "var(--color-cream)"
                      : "var(--color-panel-tint)",
                  borderColor: now ? "var(--color-sun)" : "var(--color-hairline)",
                }}
              >
                {open ? (
                  <p className="text-ink text-xs font-extrabold break-words">
                    <span className="mr-1">✅</span>
                    <span className="text-ink-soft mr-1">{i + 1}.</span>
                    <RubyText text={item.short} index={furigana} />
                  </p>
                ) : (
                  <p className="text-xs font-extrabold" style={{ color: "var(--color-ink-faint)" }}>
                    <span className="text-ink-soft mr-1">{i + 1}.</span>
                    {now ? <span className="text-ink">🎧 いま きいて います</span> : "？？？"}
                  </p>
                )}
              </motion.div>

              {item.id === justOpenedId ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute -top-2 -right-1 text-sm"
                  initial={{ opacity: 0, scale: 0.6, y: 2 }}
                  animate={{ opacity: [0, 1, 0], scale: 1.15, y: -10 }}
                  transition={{ duration: 1.1, times: [0, 0.3, 1] }}
                >
                  ✨
                </motion.span>
              ) : null}
            </motion.li>
          );
        })}
      </ul>
    </details>
  );
}
