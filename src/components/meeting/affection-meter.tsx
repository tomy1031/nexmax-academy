"use client";

import { motion } from "motion/react";
import { filledHearts } from "@/lib/meeting/affection";

/**
 * 好感度メーター — ハートは 増えるだけ（設計01 P8「罰を見せない」）
 *
 * ## 減る道を 画面にも 置かない
 * 計算側（lib/meeting/affection.ts）に減らす道が無いのと同じで、ここにも
 * 「減った」を見せる表現を置かない。空のハートは**まだ 開いていない席**であって、
 * 失った ものではない。だから空側は うすい 灰色で、赤い ✕ も 数字の 減少も 出さない。
 *
 * ## 「あと ♥n」は 罰ではなく 箱の 予告
 * とっておきの話までの残りを出すのは、P2 の「開く箱」を見せるため。
 * 届かなかったときに責める文は出さない（そもそも 完走すれば 届く配分にしてある）。
 */

export function AffectionMeter({
  hearts,
  maxHearts,
  /** いま増えたぶん。ここだけ ポップさせる。 */
  gained,
  /** とっておきの話が開く点。 */
  threshold,
  hostName,
}: {
  hearts: number;
  maxHearts: number;
  gained: number;
  threshold: number;
  hostName: string;
}) {
  const filled = filledHearts(hearts, maxHearts);
  const fresh = Math.min(gained, filled);
  const remain = Math.max(0, threshold - hearts);

  return (
    <section className="card-island p-4" aria-label="こうかんど メーター">
      <p className="text-ink text-sm font-extrabold">
        💗 {hostName}さんとの きょり
        <span className="text-ink-soft ml-2 text-xs font-bold">
          {hearts} / {maxHearts}
        </span>
      </p>

      <div className="mt-2 flex flex-wrap gap-0.5" role="img" aria-label={`ハート ${hearts}`}>
        {Array.from({ length: maxHearts }, (_, i) => {
          const on = i < filled;
          // 増えたばかりの ハートだけ key を 変えて、ポップを 1度 だけ 走らせる
          const isNew = on && i >= filled - fresh;
          return (
            <motion.span
              key={`${i}-${isNew ? "new" : "kept"}`}
              className="text-base leading-none"
              style={{ color: on ? "var(--color-coral-deep)" : "var(--color-hairline)" }}
              initial={isNew ? { scale: 0.5, opacity: 0.4 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 14 }}
            >
              {on ? "♥" : "♡"}
            </motion.span>
          );
        })}
      </div>

      {gained > 0 ? (
        <motion.p
          className="text-coral-deep mt-1.5 text-xs font-extrabold"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          ハートが {gained} ふえました！
        </motion.p>
      ) : null}

      <p className="text-ink-soft mt-1.5 text-xs font-bold break-words">
        {remain > 0
          ? `あと ♥${remain} で、${hostName}さんの とっておきの はなしが きけます。`
          : `${hostName}さんが、とっておきの はなしを したそうです。`}
      </p>
    </section>
  );
}
