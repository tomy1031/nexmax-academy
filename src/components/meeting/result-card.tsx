"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import { formatRecordDate, type MeetingRecord } from "@/lib/meeting/record";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * 会話の おわりに 手に残る もの（設計01 P13）
 *
 * ## いまは しゅうりょうしょうが 一覧を 持つ
 * 「きょう 話せた こと」の カードは `certificate-modal.tsx` に 移した
 *（2026-08-21 の 指定「ポップアップで 出せる ように・ラウンド1と 2で 出し分ける」）。
 * ここに 残るのは **まえの きろく**と **とっておきの話**。
 *
 * ## なぜ「話せた こと」の 一覧なのか
 * 点数や星は、終わった瞬間から意味が薄れる。**自分が言った日本語そのもの**が
 * 並んでいれば、次に来たときの台本になり、教室では先生に見せられる。
 * 学習者の答えは直さずそのまま出す——直した文を出すと「本当は言えていなかった」に
 * なってしまう（直しは会話の途中の JudgeCard がすでに1つだけ見せている）。
 *
 * ## とっておきの話は 別のカードにする
 * ごほうびは点ではなく物語（P2×P7）。おわりの ひとことに混ぜず、1枚の特別な札として
 * 最後に置く。話し手は相手役なので、コーチ（JudgeCard）とは色も枠も変える。
 */

/** ハートを文字で並べる（メーターと同じ見え方にする）。 */
function Hearts({ hearts, maxHearts }: { hearts: number; maxHearts: number }) {
  const filled = Math.max(0, Math.min(maxHearts, hearts));
  return (
    <p className="mt-2 text-sm font-extrabold" aria-label={`ハート ${hearts} / ${maxHearts}`}>
      <span style={{ color: "var(--color-coral-deep)" }}>{"♥".repeat(filled)}</span>
      <span style={{ color: "var(--color-hairline)" }}>{"♡".repeat(maxHearts - filled)}</span>
      <span className="text-ink-soft ml-2 text-xs font-bold">
        {hearts} / {maxHearts}
      </span>
    </p>
  );
}

/** 前に来たときの きろく。会話の じゃまを しないよう たたんで置く。 */
export function PreviousRecordCard({
  record,
  furigana,
}: {
  record: MeetingRecord;
  furigana: FuriganaIndex;
}) {
  return (
    <details className="card-island p-4">
      <summary className="text-ink cursor-pointer text-sm font-extrabold">
        📖 まえの きろく（{formatRecordDate(record.at)}）
      </summary>
      <ul className="mt-2 space-y-1.5">
        {record.lines.map((line) => (
          <li key={line.questionId} className="text-ink text-xs font-bold break-words">
            <span className="text-ink-soft mr-1">
              <RubyText text={line.ask} index={furigana} />
            </span>
            → {line.answer}
          </li>
        ))}
      </ul>
      {record.hearts !== undefined && record.maxHearts !== undefined ? (
        <Hearts hearts={record.hearts} maxHearts={record.maxHearts} />
      ) : null}
    </details>
  );
}

/**
 * とっておきの話。ハートが貯まって、さいごまで話しきった人にだけ開く。
 * 本文は教材データなので、読み辞書からふりがなを合成する（規律2）。
 */
export function RewardCard({
  text,
  hostName,
  furigana,
}: {
  text: string;
  hostName: string;
  furigana: FuriganaIndex;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.25 }}
      className="rounded-[var(--radius-card)] border-2 p-5"
      style={{ borderColor: "var(--color-grape)", background: "var(--color-cream)" }}
      aria-label="とっておきの はなし"
    >
      <p className="text-xs font-black" style={{ color: "var(--color-grape-deep)" }}>
        🎁 {hostName}さんの とっておきの はなし
      </p>
      <p className="text-ink mt-2 leading-relaxed font-bold break-words">
        <RubyText text={text} index={furigana} show />
      </p>
    </motion.section>
  );
}
