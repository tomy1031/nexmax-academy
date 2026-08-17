"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { QuizQuestion, QuizSet } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { NexMax } from "@/components/nexmax";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { createProgressStore, recordContentProgress } from "@/lib/progress/store";
import { clearQuizResume, restoreQuiz, saveQuizResume, type QuizStart } from "@/lib/quiz/resume";
import { newAttemptId, saveQuizResults } from "@/lib/quiz/results-db";
import { fetchOwnProfile } from "@/lib/profile-db";
import { CelebrationBurst, StampRow } from "./celebration";
import { QuestionBody } from "./question-types";
import {
  createQuizSession,
  currentQuestion,
  quizReducer,
  resumeQuizSession,
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
  /*
   * 端末に 残って いる「いまの ところ」。1度だけ 読む（`meeting-session.tsx` と 同じ
   * useState 初期化の 流儀）。ロビー（StartCard）の 中身は この 値に 依るので、
   * ここで 読んで おかないと 何問目からかが 分からない。
   */
  const [start] = useState<QuizStart>(() =>
    restoreQuiz(
      set.id,
      set.questions.map((q) => q.id),
    ),
  );
  const [state, setState] = useState<QuizState>(() =>
    resumeQuizSession(set, start.index, start.results),
  );
  // 1問目をいきなり出さない。「何をするのか・全部できなくてよい」を先に置く
  //（いきなり問われると、答えられない不安のほうが先に立つ — P8）。
  const [started, setStarted] = useState(false);
  /** 途中から 戻って きた ことを StartCard に 伝えるか（「はじめから」を 選ぶと 消える）。 */
  const [resumed, setResumed] = useState(start.resumed);

  const dispatch = useCallback((action: QuizAction) => {
    setState((prev) => quizReducer(prev, action));
  }, []);

  /*
   * 「まちがえた もんだいだけ」の 再挑戦は 問題を 絞った 別セッション（onRetryWrong）。
   * しおりは 教材まるごとの 出題順を 前提に するので、絞った セッションの 途中経過は
   * 保存しない——中途半端な 内訳を 次回 誤って 読み込ませない ための 線引き。
   */
  const isFullSession = state.questions.length === set.questions.length;

  /*
   * ステージの進み具合に反映する（設計07 §3）。しおり（position）は
   * `slide-deck.tsx` と 同じ 置き場（`position.question`）に 常に 同期する
   * ——「はじめから」で 内訳を 消した あとに 書かないままだと、しおりだけ 前の
   * 番号に 残る（次に 開いたとき「はじめから」が「つづきから」に 化けてしまう）。
   * 絞った セッション（まちがえた もんだいだけ）では しおりを **動かさない**
   * ——教材まるごとの 何問目とは 対応しない 数だから。
   */
  const done = state.phase.kind === "finished";
  useEffect(() => {
    recordContentProgress(set.id, {
      status: done ? "completed" : "started",
      ...(isFullSession ? { position: { question: state.results.length } } : {}),
    });
  }, [set.id, done, isFullSession, state.results]);

  /**
   * いまの ところを 端末に 残す（つぎに 開いたとき つづきから 始めるため）。
   * 完走したら 消す——完走した 人が もう一度 開いたら はじめから 挑戦できるのが 正しい。
   */
  useEffect(() => {
    if (!isFullSession) return;
    if (done) {
      clearQuizResume(set.id);
      return;
    }
    if (state.results.length === 0) return; // 何も 答えて いなければ 書かない
    saveQuizResume({ quizSetId: set.id, results: [...state.results] });
  }, [set.id, done, isFullSession, state.results]);

  const summary = summarizeQuiz(state);

  /*
   * 点数を **先生が見る成績**（TestResult）にも残す。
   *
   * これまで もんだいは 進捗（おわった／とちゅう）しか 書いておらず、何点だったかは
   * 画面を閉じた瞬間に 消えていた。同じ「テスト」なのに ことばアーケードの点だけが
   * 残る、という 割れ方をしていた。
   *
   * **初回だけが正式**（store の recordFirstTestResult が2回目以降を捨てる）。
   * だから「まちがえた もんだいだけ」の やり直しで 点が 上書きされる心配は無い
   * ——やり直しは 学びのためで、成績のためではない（P11）。
   * 読み／意味の内わけは ことばの テスト だけの数え方なので、ここでは 書かない。
   */
  const store = useMemo(() => createProgressStore(), []);
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!done) return;
    if (savedRef.current === set.id) return;
    savedRef.current = set.id;
    store.recordFirstTestResult({
      stageId: set.id,
      score: summary.earned,
      maxScore: summary.maxPoints,
      total: summary.total,
      passed: summary.passed,
      at: new Date().toISOString(),
    });
  }, [done, set.id, store, summary]);

  /*
   * 1問ごとの こたえを **先生の 画面**（/admin/quizzes）へ 送る。
   *
   * 端末の TestResult は 合計点だけなので、「どの もんだいで 止まったか」「その子が
   * 何と 書いたか」は これまで どこにも 残らなかった。ここで はじめて 残る。
   *
   * 送りっぱなしにする（`void`・await しない）。記録の ために 学習が 止まるのが
   * いちばん まずいので、ログインして いない デモモードでも、通信が 落ちても、
   * 画面は そのまま 進む。
   *
   * `attemptId` は **この 1回の 挑戦**をまとめる鍵。effect が 2回 走っても
   * 同じ鍵を 使うよう ref に 抱える——鍵が 変わると DB の一意制約をすり抜けて
   * 二重に 入り、正答率が 狂う。
   */
  /*
   * 鍵は **1回の挑戦につき1つ**。やり直し（はじめから／まちがえた もんだいだけ／もう一度）は
   * 同じ画面のまま `setState(createQuizSession(...))` で 作り直すので、鍵を そのままに すると
   * 2回目以降が 1行も 残らない（送っても 一意制約に 弾かれる）。だから 作り直しと 同時に
   * `startAttempt()` で 新しい鍵に する。
   *
   * 「もう送ったか」は 真偽値では なく **送った鍵**で 覚える。真偽値だと やり直しの ときに
   * 戻し忘れが 起きるが、鍵で 比べれば 新しい鍵に なった 時点で 自動的に 送れる状態に 戻る。
   */
  const [attemptId, setAttemptId] = useState(() => newAttemptId());
  const startAttempt = useCallback(() => setAttemptId(newAttemptId()), []);
  const sentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!done || sentRef.current === attemptId) return;
    sentRef.current = attemptId;
    void fetchOwnProfile()
      .then((profile) =>
        saveQuizResults({
          profileId: profile?.id ?? null,
          quizSetId: set.id,
          questions: set.questions,
          results: state.results,
          attemptId,
          // 絞ったセッション（まちがえた もんだいだけ）は 合否を数えてよい回ではない
          fullSet: isFullSession,
        }),
      )
      .catch(() => {
        /* 記録できなくても 学習は 止めない */
      });
  }, [attemptId, done, isFullSession, set.id, set.questions, state.results]);
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

      {!started ? (
        <StartCard
          set={set}
          furigana={furigana}
          resumed={resumed}
          answeredCount={start.results.length}
          onContinue={() => setStarted(true)}
          onRestart={() => {
            clearQuizResume(set.id);
            setState(createQuizSession(set));
            startAttempt();
            setResumed(false);
            setStarted(true);
          }}
        />
      ) : state.phase.kind === "finished" ? (
        <QuizResultCard
          set={set}
          embedded={embedded}
          summary={summary}
          missed={summary.missedQuestionIds
            .map((id) => byId.get(id))
            .filter((q): q is QuizQuestion => Boolean(q))}
          furigana={furigana}
          onRetryWrong={() => {
            setState(
              createQuizSession(
                set,
                set.questions.filter((q) => summary.missedQuestionIds.includes(q.id)),
              ),
            );
            startAttempt();
          }}
          onRetryAll={() => {
            setState(createQuizSession(set));
            startAttempt();
          }}
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
                    input={state.phase.input}
                    onNext={() => dispatch({ type: "next" })}
                  />
                ) : (
                  <>
                    {state.phase.kind === "emotionReply" && (
                      <div className="mb-4">
                        {/* 気持ちを外していても止めない。同じ次の行動へ送る言い方に替える */}
                        <FeedbackMessage
                          messageKey={
                            state.phase.feelingOk ? "quiz.emotionStep" : "quiz.emotionStepMiss"
                          }
                        />
                      </div>
                    )}
                    {state.phase.kind === "ask" && state.phase.inputIssue && (
                      <div className="mb-4">
                        <FeedbackMessage messageKey={state.phase.inputIssue} />
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

/**
 * 「これから やること」カード。
 * 枠の中（embedded）でも出す——先に何をするか分かっているかどうかは、
 * どこから来たかに関係なく効くため。
 *
 * 途中から 戻って きた ときは、ミーティング（`meeting-session.tsx` の 🔖）と
 * 同じ 案内を ここで 出す。始める 前の この 1画面が いちばん 自然な 分かれ道
 * ——「つづきから」か「はじめから」かを、問題が 出る前に 選べる。
 */
function StartCard({
  set,
  furigana,
  resumed,
  answeredCount,
  onContinue,
  onRestart,
}: {
  set: QuizSet;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  /** 途中の 続きが あるか。 */
  resumed: boolean;
  /** ここまで 答えた 問題の 数（案内の 文に 出す）。 */
  answeredCount: number;
  /** 続きから（保存された ところから）始める。 */
  onContinue: () => void;
  /** 保存を 消して、1問目から 始める。 */
  onRestart: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island p-6 sm:p-8"
    >
      <p className="text-ink-soft text-sm font-extrabold">これから やること</p>
      <div className="mt-3 flex items-start gap-4">
        <NexMax variant={set.nekumax} size={84} bob />
        <div>
          <h2 className="text-ink text-2xl font-extrabold">
            <RubyText text={set.title} index={furigana} />
          </h2>
          <p className="text-ink-soft mt-2 leading-relaxed font-bold">
            <RubyText text={set.description} index={furigana} />
          </p>
        </div>
      </div>

      {resumed ? (
        <p className="bg-cream border-hairline text-ink mt-5 rounded-[var(--radius-card)] border-2 px-4 py-3 font-extrabold">
          🔖 まえの つづきから はじめます。（{answeredCount}もん こたえました）
        </p>
      ) : (
        <p className="border-hairline bg-panel-tint text-ink mt-5 rounded-[var(--radius-card)] border-2 px-4 py-3 font-extrabold">
          ぜんぶ できなくても だいじょうぶ
        </p>
      )}

      {resumed ? (
        <div className="mt-5 grid gap-3">
          <button type="button" onClick={onContinue} className="btn-island btn-game px-6 py-3.5">
            つづきから
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="border-hairline text-ink-soft bg-panel rounded-full border-2 px-6 py-2.5 text-sm font-extrabold"
          >
            はじめから やる
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onContinue}
          className="btn-island btn-game mt-5 w-full px-6 py-3.5"
        >
          はじめる
        </button>
      )}
    </motion.div>
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
  input,
  onNext,
}: {
  question: QuizQuestion;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  feedback: Parameters<typeof FeedbackMessage>[0]["messageKey"];
  correct: boolean;
  /** 自由入力で書いた文字。正解のときだけ見せる。 */
  input?: string;
  onNext: () => void;
}) {
  // 「自分の書き方でも通った」を見せる。代表解と同じ表記なら二度書きになるので出さない
  const own = input?.trim();
  const showOwn = Boolean(correct && own && own !== answerText(question));

  return (
    <div>
      {correct && <CelebrationBurst />}
      <FeedbackMessage messageKey={feedback} />

      <div className="border-hairline bg-panel-tint mt-4 rounded-[var(--radius-card)] border-2 p-4">
        {showOwn && (
          <p className="text-ink-soft mb-3 text-xs font-bold">
            あなたの こたえ: <span className="text-ink font-extrabold">{own}</span>
          </p>
        )}
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
  embedded,
  summary,
  missed,
  furigana,
  onRetryWrong,
  onRetryAll,
}: {
  set: QuizSet;
  embedded: boolean;
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
        <FeedbackMessage messageKey={summary.passed ? "stage.passed" : "quiz.keepGoing"} />
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
        {/* 枠の中では戻り先は枠が持つ。ここで別の一覧へ放り出さない */}
        {!embedded && (
          <Link
            href="/quiz"
            className="btn-island btn-game px-6 py-3"
            style={{ "--btn-face": "#4fa8e8", "--btn-shadow": "#0272ae" } as React.CSSProperties}
          >
            もんだいを えらぶ
          </Link>
        )}
      </div>
    </motion.div>
  );
}
