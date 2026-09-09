"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import { filledHearts } from "@/lib/meeting/affection";
import type { FuriganaIndex } from "@/lib/text/furigana";

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
 *
 * ## 相手の 名前は 必ず ルビを 通す（規律2）
 * ここは 相手の 名前を 3か所に 差し込む。ヘンディ・ニャムの ような カタカナの
 * 名前だけを 見ていると 気づけないが、**漢字の 名前**（富田さん）を 相手にした
 * 瞬間、画面に 裸の漢字が 出る——2026-09-09 に 夕礼の 教材を 足して 実際に 出た。
 * `furigana`（その教材の 読み辞書）を 受け取って `RubyText` に 通す。
 * 索引が 無いときは これまでどおり 地の文だけを 出す（壊れない）。
 */

export function AffectionMeter({
  hearts,
  maxHearts,
  /** いま増えたぶん。ここだけ ポップさせる。 */
  gained,
  /** とっておきの話が開く点。 */
  threshold,
  hostName,
  /** その教材の 読み辞書（相手の 名前の ルビに 使う）。 */
  furigana,
}: {
  hearts: number;
  maxHearts: number;
  gained: number;
  threshold: number;
  hostName: string;
  furigana?: FuriganaIndex;
}) {
  const filled = filledHearts(hearts, maxHearts);
  const fresh = Math.min(gained, filled);
  const remain = Math.max(0, threshold - hearts);

  return (
    <section className="card-island p-4" aria-label="こうかんど メーター">
      <p className="text-ink text-sm font-extrabold">
        💗 <RubyText text={`${hostName}さんとの きょり`} index={furigana} show />
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
        <RubyText
          text={
            remain > 0
              ? `あと ♥${remain} で、${hostName}さんの とっておきの はなしが きけます。`
              : `${hostName}さんが、とっておきの はなしを したそうです。`
          }
          index={furigana}
          show
        />
      </p>
    </section>
  );
}
