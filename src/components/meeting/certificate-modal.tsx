"use client";

import { motion } from "motion/react";
import { CelebrationBurst } from "@/components/quiz/celebration";
import { NexMax } from "@/components/nexmax";
import { RubyText } from "@/components/ruby-text";
import { formatRecordDate, type MeetingRecord } from "@/lib/meeting/record";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * しゅうりょうしょう — ひとまとまり 話しきった ときに 出す ポップアップ
 *
 * ## なぜ 出すか
 * 会話の 練習は 終わった 瞬間に 消える。何を 言えたのかが 本人にも 残らないので、
 * 毎回 ゼロから 始まる 感じが する（設計01 P13）。**話した 中身そのものを
 * 成果物に して 見せる**——名前と 日付が 入る ことで、手に 残る ものに なる
 *（2026-08-21 の 指定）。
 *
 * ## 2回 出す
 * ①ヘンディさんからの しつもんを ぜんぶ 答えた とき
 * ②ヘンディさんへの しつもんを おえた とき
 * 区切りが 見えないと、どこまで やったのかが 分からない まま 次へ 流れる。
 *
 * ## 名前を ほかの ポップアップと 分ける
 * `aria-label` を 見かた（`judge-modal`）・ヒント（`hint-modal`）と **別に する**。
 * 同じ 名前に して いた ため、検査が「どちらの ことか」を 決められず 落ちた
 * ことが ある（CI・2026-08-18）。
 */

/** 画面が 自分で 出す 字の 読み（教材の 読み辞書とは 混ぜない・規律2）。 */
const FURIGANA = buildFuriganaIndex([
  ["話", "はな"],
  ["日", "ひ"],
  ["聞", "き"],
  ["質問", "しつもん"],
]);

export function CertificateModal({
  record,
  learnerName,
  hostName,
  furigana,
  nextLabel,
  onNext,
}: {
  /** きょう 話せた こと（`buildMeetingRecord` が 組み立てた もの）。 */
  record: MeetingRecord;
  /** 学習者の 呼び名（診断の ときに 決めた もの）。 */
  learnerName: string;
  hostName: string;
  /** 教材の 読み辞書（しつもんの 漢字に ふりがなを 合成する）。 */
  furigana: FuriganaIndex;
  /** つぎへ 進む ボタンの 字（ばんに よって 変わる）。 */
  nextLabel: string;
  onNext: () => void;
}) {
  const hearts = record.hearts;
  const maxHearts = record.maxHearts;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="しゅうりょうしょうの ポップアップ"
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(15,34,51,0.55)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="card-island relative max-h-[88vh] w-full max-w-md overflow-y-auto p-5 text-center"
      >
        <CelebrationBurst pieces={20} />
        <NexMax variant="cheer" size={80} className="mx-auto" bob />
        <h2 className="text-navy mt-2 text-xl font-black">
          <RubyText text="よく 話せました！" index={FURIGANA} show />
        </h2>

        {/* 名前と 日付。ここが あると「自分の もの」に なる */}
        <p className="text-ink mt-3 text-base font-black">{learnerName || "あなた"} さん</p>
        <p className="text-ink-faint text-xs font-bold">{formatRecordDate(record.at)}</p>

        {/* 話せた 数と ハート */}
        <p className="text-leaf-deep mt-3 text-sm font-black">
          {hostName}さんと <span className="text-lg">{record.lines.length}</span> こ 話せました
        </p>
        {typeof hearts === "number" && typeof maxHearts === "number" ? (
          <p className="mt-1 text-sm font-extrabold" aria-label={`ハート ${hearts} / ${maxHearts}`}>
            <span style={{ color: "var(--color-coral-deep)" }}>
              {"♥".repeat(Math.max(0, Math.min(maxHearts, hearts)))}
            </span>
            <span style={{ color: "var(--color-hairline)" }}>
              {"♡".repeat(Math.max(0, maxHearts - hearts))}
            </span>
          </p>
        ) : null}

        {/* きょう 話せた ことの 一覧。学習者の ことばは 直さず そのまま 出す */}
        {record.lines.length > 0 ? (
          <ul className="mt-4 space-y-2 text-left">
            {record.lines.map((line) => (
              <li key={line.questionId} className="bg-cream rounded-xl px-3 py-2">
                <p className="text-ink-soft text-[11px] font-extrabold">
                  <RubyText text={line.ask} index={furigana} show />
                </p>
                <p className="text-ink mt-0.5 text-sm font-black break-words">{line.answer}</p>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={onNext}
          autoFocus
          className="btn-island btn-game mt-5 w-full px-6 py-3 text-base"
        >
          {nextLabel}
        </button>
      </motion.div>
    </div>
  );
}
