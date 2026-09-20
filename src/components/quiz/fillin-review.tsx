"use client";

import { useMemo } from "react";
import type { QuizQuestion } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { checkFillin } from "@/lib/quiz/draft";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * 型の ある 文の 答え合わせ — **欄の ならびの まま 返す**
 *
 * 穴うめ（`WordbankReview`）と 同じ 考え方。「正解」を 横に 並べるだけだと、
 * 5つの 欄の どれを どう まちがえたのかを 学習者が 自分で 突き合わせる ことに なり、
 * 直す ところが 分からないまま つぎへ 進む（2026-09-11 の 指定）。
 *
 * ここは **欄の 名前（【原因】など）を 付けた まま**返す——メールの 型の どこの 話かが、
 * 目を 動かさずに 分かる。
 *
 * しるしは 記号・ことば・色の 3つで 示す（色だけに たよらない）。
 */

/** 画面じたいの 文言の 読み辞書（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["正", "ただ"],
  ["合", "あ"],
  ["直", "なお"],
  ["緑", "みどり"],
]);

const CHIP = "rounded-full border-2 px-2 py-0.5 text-sm font-extrabold";
const OK_STYLE = { borderColor: "#58c273", background: "#e9f8ee", color: "#1f3a56" } as const;
const NG_STYLE = { borderColor: "#f26fa7", background: "#fdeaf2", color: "#1f3a56" } as const;
const YET_STYLE = { borderColor: "#c9d4de", background: "#f2f6f9", color: "#5a7089" } as const;
const RIGHT_STYLE = { borderColor: "#58c273", background: "#58c273", color: "#ffffff" } as const;

/** 数の 言い方（「10つ」は 日本語では ない）。 */
function count(n: number): string {
  return n <= 9 ? `${n}つ` : `${n}こ`;
}

export function FillinReview({
  question,
  answer,
  correct,
  furigana,
}: {
  question: Extract<QuizQuestion, { type: "fillin" }>;
  /** 学習者の こたえ（`QuizResult.answer`。記録に 残るのは 文だけ）。 */
  answer: string;
  /** 採点の けっか。合格の 回は 欄を ぜんぶ ○に する（`checkFillin` の 註）。 */
  correct?: boolean;
  furigana: FuriganaIndex;
}) {
  const checks = useMemo(() => checkFillin(question, answer, correct), [question, answer, correct]);
  const done = checks.filter((check) => check.ok).length;
  const missed = checks.length - done;

  return (
    <div className="border-hairline bg-panel mt-2 rounded-[var(--radius-card)] border-2 p-3">
      <ul className="grid gap-1.5">
        {checks.map((check, i) => (
          <li key={`${check.label}-${i}`} className="flex flex-wrap items-center gap-1">
            <span className="text-ink-soft w-24 shrink-0 text-xs font-extrabold">
              <RubyText text={`【${check.label}】`} index={furigana} />
            </span>
            <span
              className={CHIP}
              style={check.ok ? OK_STYLE : check.own === "" ? YET_STYLE : NG_STYLE}
            >
              {check.own === "" ? (
                <RubyText text="まだ" index={UI_FURIGANA} />
              ) : (
                <RubyText text={check.own} index={furigana} />
              )}
              <span aria-hidden className="ml-0.5">
                {check.ok ? "✓" : check.own === "" ? "…" : "✗"}
              </span>
              <span className="sr-only">
                {check.ok
                  ? "。合って います。"
                  : check.own === ""
                    ? "。書いて いません。こたえは"
                    : "。ちがいます。正しいのは"}
              </span>
            </span>
            {!check.ok && (
              <>
                <span aria-hidden className="text-ink-faint text-xs font-extrabold">
                  →
                </span>
                <span className={CHIP} style={RIGHT_STYLE}>
                  <RubyText text={check.right} index={furigana} />
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* 合って いた 数から 言い、直す 数は ぼかさない（P8・規律1）。 */}
      <p className="text-ink-soft mt-2 text-xs font-extrabold">
        {missed === 0 ? (
          <RubyText text="✓ ぜんぶ 合って いました。" index={UI_FURIGANA} />
        ) : (
          <RubyText
            text={`✓が ${count(done)}、直す ところが ${count(missed)} です。→の 緑の ことばが 正しい こたえです。`}
            index={UI_FURIGANA}
          />
        )}
      </p>
    </div>
  );
}
