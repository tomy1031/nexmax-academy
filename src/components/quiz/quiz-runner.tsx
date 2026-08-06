"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { QuizQuestion, QuizSet } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { NexMax } from "@/components/nexmax";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { recordContentProgress } from "@/lib/progress/store";
import { CelebrationBurst, StampRow } from "./celebration";
import { QuestionBody } from "./question-types";
import {
  createQuizSession,
  currentQuestion,
  quizReducer,
  summarizeQuiz,
  type QuizAction,
  type QuizState,
} from "./quiz-reducer";

/**
 * 問題エンジンの画面。
 *
 * 引き継いだのは「やさしさ」と「ごほうび感」の設計思想で、旧アプリの
 * カートリッジ棚UI・茶系インク・フクロウは使わない（設計04 §1）。
 * 演出は必ず学習行為に紐づける（正解したときだけ紙吹雪・スタンプが増える）。
 */
export function QuizRunner({
  set,
  /**
   * ステージの枠（ContentFrame）の中に置くとき。自前の外枠と戻りリンクを出さない
   * ——戻り先は枠が持つ（教材ごとに戻り先が違うと、学習者は1本おわるたびに
   * 別の一覧へ放り出される）。
   */
  embedded = false,
}: {
  set: QuizSet;
  embedded?: boolean;
}) {
  const furigana = useMemo(() => buildFuriganaIndex(set.furigana ?? []), [set.furigana]);
  const [state, setState] = useState<QuizState>(() => createQuizSession(set));

  const dispatch = useCallback((action: QuizAction) => {
    setState((prev) => quizReducer(prev, action));
  }, []);

  // ステージの進み具合に反映する（設計07 §3）。始めた時点と、終えた時点を残す。
  const done = state.phase.kind === "finished";
  useEffect(() => {
    recordContentProgress(set.id, { status: done ? "completed" : "started" });
  }, [set.id, done]);

  const summary = summarizeQuiz(state);
  const question = currentQuestion(state);
  const byId = useMemo(() => new Map(set.questions.map((q) => [q.id, q])), [set.questions]);

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-3xl px-4 py-6"}>
      {embedded ? null : (
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href="/quiz" className="text-ink-soft hover:text-navy text-sm font-extrabold">
            ← もんだい 一覧
          </Link>
          <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
            ✏️ {set.title}
          </span>
        </header>
      )}

      {state.phase.kind === "finished" ? (
        <QuizResultCard
          set={set}
          summary={summary}
          missed={summary.missedQuestionIds
            .map((id) => byId.get(id))
            .filter((q): q is QuizQuestion => Boolean(q))}
          furigana={furigana}
          onRetryWrong={() =>
            setState(
              createQuizSession(
                set,
                set.questions.filter((q) => summary.missedQuestionIds.includes(q.id)),
              ),
            )
          }
          onRetryAll={() => setState(createQuizSession(set))}
        />
      ) : (
        question && (
          <>
            <Progress index={state.index} total={state.questions.length} earned={summary.correct} />

            <motion.section
              key={`${question.id}:${state.phase.kind}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-island mt-4 p-5 sm:p-6"
            >
              <p className="text-ink text-lg leading-relaxed font-extrabold">
                <RubyText text={question.q} index={furigana} />
              </p>

              <div className="mt-5">
                {state.phase.kind === "explain" ? (
                  <ExplainCard
                    question={question}
                    furigana={furigana}
                    feedback={state.phase.feedback}
                    correct={state.phase.correct}
                    onNext={() => dispatch({ type: "next" })}
                  />
                ) : (
                  <>
                    {state.phase.kind === "emotionReply" && (
                      <div className="mb-4">
                        <FeedbackMessage messageKey="quiz.emotionStep" />
                      </div>
                    )}
                    <QuestionBody
                      question={question}
                      furigana={furigana}
                      dispatch={dispatch}
                      emotionStep2={state.phase.kind === "emotionReply"}
                    />
                  </>
                )}
              </div>
            </motion.section>
          </>
        )
      )}
    </div>
  );
}

function Progress({ index, total, earned }: { index: number; total: number; earned: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="border-hairline bg-panel text-ink rounded-full border-2 px-3 py-1 text-sm font-extrabold">
        もんだい {index + 1} / {total}
      </span>
      <div
        className="h-2.5 flex-1 overflow-hidden rounded-full"
        style={{ background: "var(--color-sky-soft)" }}
      >
        <motion.div
          className="bg-sky h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(index / total) * 100}%` }}
        />
      </div>
      <StampRow count={earned} />
    </div>
  );
}

function ExplainCard({
  question,
  furigana,
  feedback,
  correct,
  onNext,
}: {
  question: QuizQuestion;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  feedback: Parameters<typeof FeedbackMessage>[0]["messageKey"];
  correct: boolean;
  onNext: () => void;
}) {
  return (
    <div>
      {correct && <CelebrationBurst />}
      <FeedbackMessage messageKey={feedback} />

      <div className="border-hairline bg-panel-tint mt-4 rounded-[var(--radius-card)] border-2 p-4">
        <p className="text-ink-soft text-xs font-extrabold">こたえ</p>
        <p className="text-ink mt-1 font-extrabold">
          <RubyText text={answerText(question)} index={furigana} />
        </p>
        <p className="text-ink-soft mt-3 leading-relaxed font-bold">
          <RubyText text={question.explain} index={furigana} />
        </p>
      </div>

      <button type="button" onClick={onNext} className="btn-island btn-game mt-4 w-full px-6 py-3">
        つぎへ
      </button>
    </div>
  );
}

/** 型ごとに「正解の見せ方」を組み立てる。 */
function answerText(question: QuizQuestion): string {
  switch (question.type) {
    case "choose":
      return question.options[question.answer] ?? "";
    case "multi":
      return question.answers.map((i) => question.options[i] ?? "").join(" ／ ");
    case "keyword":
      return question.answer;
    case "wordbank":
      return question.blanks.map((b, i) => `（${i + 1}）${b}`).join("　");
    case "emotion":
      return `${question.feelings[question.answerFeeling] ?? ""} → ${
        question.replies[question.answerReply] ?? ""
      }`;
  }
}

function QuizResultCard({
  set,
  summary,
  missed,
  furigana,
  onRetryWrong,
  onRetryAll,
}: {
  set: QuizSet;
  summary: ReturnType<typeof summarizeQuiz>;
  missed: readonly QuizQuestion[];
  furigana: ReturnType<typeof buildFuriganaIndex>;
  onRetryWrong: () => void;
  onRetryAll: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island p-6 sm:p-8"
    >
      {summary.passed && <CelebrationBurst />}
      <div className="flex items-center gap-4">
        <NexMax variant={summary.passed ? "cheer" : set.nekumax} size={84} bob />
        <div>
          <p className="text-ink-soft text-sm font-extrabold">けっか</p>
          <h2 className="text-ink text-3xl font-extrabold">
            {summary.passed ? "よく できました！" : "ここまで すすんだね"}
          </h2>
        </div>
      </div>

      <div className="mt-5">
        <FeedbackMessage messageKey={summary.passed ? "stage.passed" : "stage.keepGoing"} />
      </div>

      <p className="text-ink mt-5 text-center text-2xl font-extrabold">
        {summary.correct} / {summary.total} もん
        <span className="text-sky ml-3 text-lg">
          {summary.earned} / {summary.maxPoints} てん
        </span>
      </p>
      <div className="mt-3 flex justify-center">
        <StampRow count={summary.correct} />
      </div>

      {missed.length > 0 && (
        <section className="mt-6">
          <h3 className="text-ink mb-2 font-extrabold">
            もう一度 見る もんだい（{missed.length}こ）
          </h3>
          <ul className="border-hairline divide-hairline divide-y rounded-[var(--radius-card)] border-2">
            {missed.map((q) => (
              <li key={q.id} className="text-ink-soft px-4 py-3 text-sm font-bold">
                <RubyText text={q.q} index={furigana} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-3">
        {missed.length > 0 && (
          <button
            type="button"
            onClick={onRetryWrong}
            className="btn-island btn-game px-6 py-3.5"
            style={{ "--btn-face": "#f26fa7", "--btn-shadow": "#d94d84" } as React.CSSProperties}
          >
            まちがえた もんだいだけ
          </button>
        )}
        <button
          type="button"
          onClick={onRetryAll}
          className="btn-island btn-game px-6 py-3.5"
          style={{ "--btn-face": "#58c273", "--btn-shadow": "#3aa458" } as React.CSSProperties}
        >
          もう一度
        </button>
        <Link
          href="/quiz"
          className="btn-island btn-game px-6 py-3"
          style={{ "--btn-face": "#4fa8e8", "--btn-shadow": "#0272ae" } as React.CSSProperties}
        >
          もんだいを えらぶ
        </Link>
      </div>
    </motion.div>
  );
}
