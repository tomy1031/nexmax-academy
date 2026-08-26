"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { Word } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { RubyText } from "@/components/ruby-text";
import { NexMax } from "@/components/nexmax";
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
  onBack,
  onLeave,
  leaveLabel,
}: {
  summary: ArcadeSummary;
  gameScore: number;
  bestCombo: number;
  isTest: boolean;
  missedWords: readonly Word[];
  furigana: FuriganaIndex;
  onRetryWrong: () => void;
  onBack: () => void;
  /**
   * ことばアーケードから 出る 道。ステージから 来た ときだけ 渡る
   *（arcade-game.tsx の `backTo`）。
   *
   * ここが いちばん 「つぎへ 行きたい」瞬間なのに、出口が 無かった——
   * けっか →「あそびかたを えらぶ」→ 一覧 → マップ と 3回 押して、
   * さらに 地図の 上から 元の ステージを 探し直す ことに なっていた。
   */
  onLeave?: () => void;
  leaveLabel?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island mx-auto w-full max-w-2xl p-6 sm:p-8"
    >
      {/*
        **合格か 不合格かを 先に、はっきり 出す**（2026-08-26 の 指摘5）。
        前は テストのときだけ「合格！」で、外れたときは「ここまで すすんだね」——
        OKなのか NGなのかが 分からず、それが いちばんの ストレスだった。
        いまは **どの あそびかたでも 同じ 出しかた**（⭕/❌ の 記号＋ことば）。
      */}
      <div className="flex items-center gap-4">
        <NexMax variant={summary.passed ? "cheer" : "guide"} size={84} bob />
        <div className="flex-1">
          <p className="text-ink-soft text-sm font-extrabold">けっか</p>
          <h2
            className="flex items-center gap-2 text-3xl font-extrabold"
            style={{
              color: !summary.completed ? "#1f3a56" : summary.passed ? "#1c7f3e" : "#a3182f",
            }}
          >
            <span aria-hidden>{!summary.completed ? "⏸" : summary.passed ? "⭕" : "❌"}</span>
            {!summary.completed ? "とちゅうまで" : summary.passed ? "合格" : "不合格"}
          </h2>
        </div>
      </div>

      {/* 点・満点・合格ライン を **同じ 行**に 並べる。何点で 合格かを 隠さない。 */}
      <p className="border-hairline mt-4 rounded-[var(--radius-card)] border-2 px-4 py-3 text-center text-lg font-extrabold">
        <span className="text-ink">
          {summary.score} / {summary.maxScore} 点
        </span>
        <span className="text-ink-soft ml-3 text-sm">
          合格ライン {summary.needed} 点（{summary.passRate}%）
        </span>
      </p>
      {!summary.completed && (
        /*
         * 途中で やめた ぶんで 合否を 出さない。3問 やって ぜんぶ 当たったのを
         * 「合格」と 言って しまうと、合格の 意味が 無くなる。
         */
        <p className="text-ink-soft mt-2 text-center font-extrabold">
          さいごまで やると 合格か どうかが 出ます。
        </p>
      )}
      {summary.completed && !summary.passed && (
        <p className="mt-2 text-center font-extrabold text-[#a3182f]">
          あと {summary.needed - summary.score} 点で 合格！
        </p>
      )}

      <div className="mt-4">
        <FeedbackMessage messageKey={summary.passed ? "stage.passed" : "stage.keepGoing"} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
        {summary.maxScore > summary.total && (
          <Stat
            label="よみ"
            value={`${summary.readingCorrect} / ${summary.total}`}
            accent="#0288d1"
          />
        )}
        <Stat
          label="いみ"
          value={`${summary.meaningCorrect} / ${summary.total}`}
          accent="#3aa458"
        />
        {!isTest && <Stat label="スコア" value={String(gameScore)} accent="#f0a819" />}
        {!isTest && <Stat label="さいこう れんぞく" value={`${bestCombo}`} accent="#f2654a" />}
      </dl>

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
        {/*
          **ゼロから やり直す ボタンは 置かない**（2026-08-26 の 指定）。
          50語 ぜんぶを もう一度 やるのは、いちばん 押されにくい 道なのに
          いちばん 大きく 出て いた。次の 一手は「まちがえた ことばだけ」。
        */}
        {/*
          行き先は **この ことばの あそびかた選び**（れんしゅう／テスト／
          フラッシュカード…）で、ステージ選びでは ない。札が「ステージを えらぶ」
          だったので、押した学習者は 出口の つもりで 同じ ことばの 画面に 戻っていた。
        */}
        <button
          type="button"
          onClick={onBack}
          className="btn-island btn-game px-6 py-3 text-base"
          style={{ "--btn-face": "#4fa8e8", "--btn-shadow": "#0272ae" } as React.CSSProperties}
        >
          ← あそびかたを えらぶ
        </button>
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="btn-island btn-game px-6 py-3 text-base"
            style={
              {
                "--btn-face": "#ffffff",
                "--btn-shadow": "#cfe6f3",
                color: "#1f3a56",
              } as React.CSSProperties
            }
          >
            {leaveLabel}
          </button>
        )}
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
