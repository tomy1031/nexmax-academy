"use client";

import { motion } from "motion/react";
import type { Word } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { RubyText } from "@/components/ruby-text";
import { NekuMax } from "@/components/nekumax";
import type { FuriganaIndex } from "@/lib/text/furigana";
import type { ArcadeSummary } from "./arcade-reducer";

/**
 * けっか画面。
 *
 * 学習者に見せるのは「どこが弱いか」と「次に何をするか」だけ。
 * テストの点数（ArcadeSummary）とゲームスコアは別々に出す（P11）。
 */
export function ArcadeResult({
  summary,
  gameScore,
  bestCombo,
  isTest,
  missedWords,
  furigana,
  onRetryWrong,
  onRetryAll,
  onBack,
}: {
  summary: ArcadeSummary;
  gameScore: number;
  bestCombo: number;
  isTest: boolean;
  missedWords: readonly Word[];
  furigana: FuriganaIndex;
  onRetryWrong: () => void;
  onRetryAll: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island mx-auto w-full max-w-2xl p-6 sm:p-8"
    >
      <div className="flex items-center gap-4">
        <NekuMax variant={summary.passed ? "cheer" : "guide"} size={84} bob />
        <div className="flex-1">
          <p className="text-ink-soft text-sm font-extrabold">けっか</p>
          <h2 className="text-ink text-3xl font-extrabold">
            {isTest ? (summary.passed ? "合格！" : "ここまで すすんだね") : "おつかれさま！"}
          </h2>
        </div>
      </div>

      <div className="mt-5">
        <FeedbackMessage messageKey={summary.passed ? "stage.passed" : "stage.keepGoing"} />
      </div>

      {isTest && (
        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat label="合計" value={`${summary.score} / ${summary.maxScore}`} accent="#004f8d" />
          <Stat
            label="よみ"
            value={`${summary.readingCorrect} / ${summary.total}`}
            accent="#0288d1"
          />
          <Stat
            label="いみ"
            value={`${summary.meaningCorrect} / ${summary.total}`}
            accent="#3aa458"
          />
        </dl>
      )}

      {!isTest && (
        <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
          <Stat label="スコア" value={String(gameScore)} accent="#f0a819" />
          <Stat label="さいこう れんぞく" value={`${bestCombo}`} accent="#f2654a" />
        </dl>
      )}

      {missedWords.length > 0 && (
        <section className="mt-6">
          <h3 className="text-ink mb-2 font-extrabold">
            もう一度 れんしゅうする ことば（{missedWords.length}こ）
          </h3>
          <ul className="border-hairline divide-hairline divide-y rounded-[var(--radius-card)] border-2">
            {missedWords.map((word) => (
              <li key={word.id} className="px-4 py-3">
                <p className="text-ink font-extrabold">
                  <ruby>
                    {word.term}
                    <rt>{word.reading}</rt>
                  </ruby>
                  <span className="text-ink-soft ml-3 text-sm">{word.meaningEn}</span>
                </p>
                <p className="text-ink-soft mt-1 text-sm">
                  <RubyText text={word.explanationJa} index={furigana} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-3">
        {missedWords.length > 0 && (
          <button
            type="button"
            onClick={onRetryWrong}
            className="btn-island btn-game px-6 py-3.5 text-lg"
            style={{ "--btn-face": "#f26fa7", "--btn-shadow": "#d94d84" } as React.CSSProperties}
          >
            まちがえた ことばだけ
          </button>
        )}
        <button
          type="button"
          onClick={onRetryAll}
          className="btn-island btn-game px-6 py-3.5 text-lg"
          style={{ "--btn-face": "#58c273", "--btn-shadow": "#3aa458" } as React.CSSProperties}
        >
          もう一度
        </button>
        <button
          type="button"
          onClick={onBack}
          className="btn-island btn-game px-6 py-3 text-base"
          style={{ "--btn-face": "#4fa8e8", "--btn-shadow": "#0272ae" } as React.CSSProperties}
        >
          ステージを えらぶ
        </button>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="border-hairline rounded-[var(--radius-card)] border-2 px-2 py-3">
      <dt className="text-ink-soft text-xs font-extrabold">{label}</dt>
      <dd className="text-xl font-extrabold" style={{ color: accent }}>
        {value}
      </dd>
    </div>
  );
}
