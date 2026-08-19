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
import { correctAnswerText, draftAnswerText, draftAnswered } from "@/lib/quiz/draft";
import { clearQuizResume, restoreQuiz, saveQuizResume, type QuizStart } from "@/lib/quiz/resume";
import { newAttemptId, saveQuizResults } from "@/lib/quiz/results-db";
import { fetchOwnProfile } from "@/lib/profile-db";
import { CelebrationBurst, StampRow } from "./celebration";
import { QuestionBody } from "./question-types";
import {
  answeredCount,
  createQuizSession,
  currentDraft,
  currentQuestion,
  quizReducer,
  resumeQuizSession,
  summarizeQuiz,
  type QuizAction,
  type QuizMode,
  type QuizResult,
  type QuizState,
} from "./quiz-reducer";

/**
 * 画面じたいの文言の読み辞書（教材データの辞書はUIの文言まで覆わない・規律2）。
 * むずかしい語を ひらがなに 開かず、漢字＋ふりがなで 出す（docs/constraints.md）。
 */
const UI_FURIGANA = buildFuriganaIndex([
  ["正解", "せいかい"],
  ["一度", "いちど"],
  ["問", "もん"],
  ["出", "だ"],
  ["見", "み"],
  ["書", "か"],
]);

/**
 * 問題エンジンの画面。
 *
 * 引き継いだのは「やさしさ」と「ごほうび感」の設計思想で、旧アプリの
 * カートリッジ棚UI・茶系インク・フクロウは使わない（設計04 §1）。
 * 演出は必ず学習行為に紐づける（正解したときだけ紙吹雪・スタンプが増える）。
 *
 * ## やりかたは 学習者が えらぶ（設計01 P11）
 * - **1問ずつ**（これまでどおり・既定）… 答えるたびに こたえと せつめいを 読む
 * - **まとめて 出す** … ぜんぶ 書いてから 出す。採点は 出した あと 1回だけ
 *
 * レベル別に 教材を 分けるのでは なく、**同じ 教材の 別モード**として 負荷の
 * 調整装置を 学習者に 握らせる。どちらでも 教材データは 同じ。
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
    resumeQuizSession(set, start.index, start.results, start.mode, start.drafts),
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
  const submitMode = state.mode === "submit";
  /** まとめて 出す ときに「何問 書いたか」（しおりにも 案内の 文にも 使う）。 */
  const written = useMemo(() => answeredCount(state), [state]);

  /*
   * ステージの進み具合に反映する（設計07 §3）。しおり（position）は
   * `slide-deck.tsx` と 同じ 置き場（`position.question`）に 常に 同期する
   * ——「はじめから」で 内訳を 消した あとに 書かないままだと、しおりだけ 前の
   * 番号に 残る（次に 開いたとき「はじめから」が「つづきから」に 化けてしまう）。
   * 絞った セッション（まちがえた もんだいだけ）では しおりを **動かさない**
   * ——教材まるごとの 何問目とは 対応しない 数だから。
   *
   * **おわった ときは 必ず「全問ぶん」を 書く**。まとめて 出す では 書いた 数しか
   * 進んで いない ことが あり（1問だけ 書いて 出す）、そのまま しおりに すると
   * 次に 開いた ときに「つづきが ある」と 誤読される——完走した 教材が
   * 「2問目から つづき」に 化け、1問目に 二度と 戻れなく なる（別の目 検収で 実発生）。
   */
  const done = state.phase.kind === "finished";
  useEffect(() => {
    recordContentProgress(set.id, {
      status: done ? "completed" : "started",
      ...(isFullSession
        ? {
            position: {
              question: done ? state.questions.length : submitMode ? written : state.results.length,
            },
          }
        : {}),
    });
  }, [set.id, done, isFullSession, submitMode, written, state.questions, state.results]);

  /**
   * いまの ところを 端末に 残す（つぎに 開いたとき つづきから 始めるため）。
   *
   * **まとめて 出す**は 採点まえの 下書きを 残す——これが 無いと、他の ページへ
   * 行って 戻った だけで 書いた ものが ぜんぶ 消える（このモードの 生命線）。
   * 完走したら 消す——完走した 人が もう一度 開いたら はじめから 挑戦できるのが 正しい。
   */
  useEffect(() => {
    if (!isFullSession) return;
    if (done) {
      clearQuizResume(set.id);
      return;
    }
    if (submitMode) {
      /*
       * 書いた ものが 0に 戻った ときは **消す**。
       *
       * 前は そのまま return して いた。すると 唯一 書いた こたえを 自分で 消しても
       * 前の 保存が 残り、他の ページから 戻ると「1もん 書きました」と 言われて
       * **消した はずの こたえが 生き返る**（別の目 検収で 実発生）。
       * 画面が 0と 言う ときは、端末の 中も 0で ある。
       */
      if (written === 0) {
        clearQuizResume(set.id);
        return;
      }
      saveQuizResume({
        quizSetId: set.id,
        results: [],
        mode: "submit",
        drafts: state.drafts,
        index: state.index,
      });
      return;
    }
    if (state.results.length === 0) return;
    saveQuizResume({ quizSetId: set.id, results: [...state.results] });
  }, [set.id, done, isFullSession, submitMode, written, state.drafts, state.index, state.results]);

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

  /** 出したあとに 見せる 一覧（こたえた 順）。設問が 見つからない 行は 落とす。 */
  const review = useMemo(
    () =>
      state.results.flatMap((result) => {
        const q = byId.get(result.questionId);
        return q ? [{ result, question: q }] : [];
      }),
    [state.results, byId],
  );

  /** やり直し（同じ やりかたの まま 作り直す）。 */
  const restart = useCallback(
    (questions: readonly QuizQuestion[], mode: QuizMode) => {
      setState(createQuizSession(set, [...questions], mode));
      startAttempt();
    },
    [set, startAttempt],
  );

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
          resumedMode={state.mode}
          answeredCount={submitMode ? written : start.results.length}
          startIndex={state.index}
          onContinue={() => setStarted(true)}
          onStart={(mode) => {
            clearQuizResume(set.id);
            restart(set.questions, mode);
            setResumed(false);
            setStarted(true);
          }}
        />
      ) : state.phase.kind === "finished" ? (
        <QuizResultCard
          set={set}
          embedded={embedded}
          summary={summary}
          review={review}
          furigana={furigana}
          onRetryWrong={() =>
            restart(
              set.questions.filter((q) => summary.missedQuestionIds.includes(q.id)),
              state.mode,
            )
          }
          onRetryAll={() => restart(set.questions, state.mode)}
        />
      ) : state.phase.kind === "confirm" ? (
        <ConfirmCard
          questions={state.questions}
          drafts={state.drafts}
          furigana={furigana}
          onGoto={(index) => dispatch({ type: "goto", index })}
          onBack={() => dispatch({ type: "back" })}
          onSubmit={() => dispatch({ type: "submit" })}
        />
      ) : (
        question && (
          <>
            <Progress
              index={state.index}
              total={state.questions.length}
              earned={summary.correct}
              written={submitMode ? written : undefined}
            />

            <motion.section
              key={`${question.id}:${state.phase.kind}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-island mt-4 p-5 sm:p-6"
            >
              {/*
                まえの もんだいへ。**1問ずつ**では 答え直しでは なく 読み直し
                （reducer の "back"）。1問目には 出さない——押せない ボタンを 置くと、
                押せる ものを さがす。しおりで 途中から 始めた 人にも 出さない
                （前の 記録が 無い）。まとめて 出す ときは いつでも 戻れる。
              */}
              {state.index > 0 && (submitMode || state.results.length >= state.index) && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "back" })}
                  className="text-ink-soft hover:text-ink -mt-1 mb-2 text-xs font-extrabold"
                >
                  ← まえの もんだい
                </button>
              )}

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
                    answer={state.phase.answer}
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
                      mode={state.mode}
                      draft={currentDraft(state)}
                    />
                    {/*
                      まとめて 出す ときは 押した 瞬間に 進まないので、進む ボタンを 置く。
                      **こたえて いなくても 進める**——分からない もんだいで 足止めせず、
                      出す まえの かくにんで 戻って これる ように する。
                    */}
                    {submitMode && (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "next" })}
                        className="btn-island btn-game mt-5 w-full px-6 py-3"
                      >
                        {state.index === state.questions.length - 1
                          ? "さいごに かくにん →"
                          : "つぎ →"}
                      </button>
                    )}
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
 *
 * やりかた（1問ずつ／まとめて 出す）も ここで 選ぶ。**既定は これまでどおり
 * 1問ずつ**で、大きい「はじめる」を 押せば 何も 変わらない。
 */
function StartCard({
  set,
  furigana,
  resumed,
  resumedMode,
  answeredCount,
  startIndex,
  onContinue,
  onStart,
}: {
  set: QuizSet;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  /** 途中の 続きが あるか。 */
  resumed: boolean;
  /** 途中の 続きが ある ときの やりかた。 */
  resumedMode: QuizMode;
  /** ここまで 答えた（書いた）問題の 数（案内の 文に 出す）。 */
  answeredCount: number;
  /** これから 出す 問題の 番号（0始まり）。内訳が 無い ときの 案内に 使う。 */
  startIndex: number;
  /** 続きから（保存された ところから）始める。 */
  onContinue: () => void;
  /** 保存を 消して、1問目から 始める。 */
  onStart: (mode: QuizMode) => void;
}) {
  /** 「べつの やりかたで はじめる」を 押して、えらび直して いる 最中か。 */
  const [choosing, setChoosing] = useState(false);
  const showChoice = !resumed || choosing;

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
          {answeredCount === 0 ? (
            /*
             * しおり（位置）だけが 残って いた 回。内訳が 無いので「0もん こたえました」
             * に なって いた——**答えて いないのに つづき**は 学習者には 読めない。
             * 何が 戻るのかを そのまま 言う。
             */
            <RubyText
              text={`🔖 まえに 見て いた ${startIndex + 1}もんめから はじめます。`}
              index={UI_FURIGANA}
            />
          ) : (
            <>
              🔖 まえの つづきから はじめます。（{answeredCount}もん{" "}
              <RubyText
                text={resumedMode === "submit" ? "書きました" : "こたえました"}
                index={UI_FURIGANA}
              />
              ）
            </>
          )}
        </p>
      ) : (
        <p className="border-hairline bg-panel-tint text-ink mt-5 rounded-[var(--radius-card)] border-2 px-4 py-3 font-extrabold">
          ぜんぶ できなくても だいじょうぶ
        </p>
      )}

      {showChoice ? (
        <div className="mt-5 grid gap-4">
          <div>
            <button
              type="button"
              onClick={() => onStart("one")}
              className="btn-island btn-game w-full px-6 py-3.5"
            >
              はじめる
            </button>
            <p className="text-ink-soft mt-2 text-center text-sm font-bold">
              <RubyText text="1問 こたえるたびに、こたえと せつめいを 見ます" index={UI_FURIGANA} />
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => onStart("submit")}
              className="btn-island btn-game w-full px-6 py-3.5"
              style={{ "--btn-face": "#f7c948", "--btn-shadow": "#d99e1f" } as React.CSSProperties}
            >
              <RubyText text="まとめて 出す" index={UI_FURIGANA} />
            </button>
            <p className="text-ink-soft mt-2 text-center text-sm font-bold">
              <RubyText
                text="ぜんぶ こたえてから 出します。けっかは さいごに まとめて 見ます"
                index={UI_FURIGANA}
              />
            </p>
          </div>
          {/*
            えらび直しを やめる 道。**どちらの ボタンも 途中の 保存を 消す**ので、
            まちがえて「べつの やりかたで はじめる」を 押した 人が、開き直すまで
            つづきに 戻れない ことに なって いた（別の目 検収 気E）。
          */}
          {resumed && (
            <button
              type="button"
              onClick={() => setChoosing(false)}
              className="text-ink-soft hover:text-navy text-sm font-extrabold underline underline-offset-4"
            >
              ← つづきの がめんに もどる
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          <button type="button" onClick={onContinue} className="btn-island btn-game px-6 py-3.5">
            つづきから
          </button>
          <button
            type="button"
            onClick={() => onStart(resumedMode)}
            className="border-hairline text-ink-soft bg-panel rounded-full border-2 px-6 py-2.5 text-sm font-extrabold"
          >
            はじめから やる
          </button>
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="text-ink-soft hover:text-navy text-sm font-extrabold underline underline-offset-4"
          >
            べつの やりかたで はじめる
          </button>
        </div>
      )}
    </motion.div>
  );
}

function Progress({
  index,
  total,
  earned,
  written,
}: {
  index: number;
  total: number;
  earned: number;
  /**
   * まとめて 出す ときの「書いた 数」。
   * このモードでは 正解の 数を 見せないので、スタンプの かわりに ここを 出す
   * ——進みが 何も 見えないと、何問 のこって いるかが 分からなくなる。
   */
  written?: number;
}) {
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
      {written === undefined ? (
        <StampRow count={earned} />
      ) : (
        <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-sm font-extrabold">
          こたえた {written} / {total}
        </span>
      )}
    </div>
  );
}

function ExplainCard({
  question,
  furigana,
  feedback,
  correct,
  answer,
  onNext,
}: {
  question: QuizQuestion;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  feedback: Parameters<typeof FeedbackMessage>[0]["messageKey"];
  correct: boolean;
  /** 学習者が 出した こたえ（型を 問わず 出す）。 */
  answer?: string;
  onNext: () => void;
}) {
  return (
    <div>
      {correct && <CelebrationBurst />}
      <FeedbackMessage messageKey={feedback} />

      <div className="border-hairline bg-panel-tint mt-4 rounded-[var(--radius-card)] border-2 p-4">
        <AnswerPair question={question} answer={answer} furigana={furigana} />
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

/**
 * 「あなたの こたえ」と「正解」を 並べて 見せる。
 *
 * これまでは 自由入力で 正解した ときだけ 自分の 書いた ものが 出て いた。
 * えらんだ 選択肢が どこにも 残らないので、**外した ときほど 自分が 何を 選んだか
 * 分からない**——直しようが ない（2026-08-19 の 指摘）。だから 型を 問わず 出す。
 *
 * 同じ 文なら 2度 書かない（「自分の 書き方でも 通った」が 伝わる ときだけ 並べる）。
 */
function AnswerPair({
  question,
  answer,
  furigana,
}: {
  question: QuizQuestion;
  answer?: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
}) {
  const own = answer?.trim() ?? "";
  const right = correctAnswerText(question);

  return (
    <>
      <p className="text-ink-soft text-xs font-bold">
        あなたの こたえ:{" "}
        {own ? (
          // 自分の こたえも **読める** ように ルビを 合成する（規律2）。自由入力の
          // 文字にも 効く——辞書に ある 語だけ 覆われ、無い 語は そのまま 出る。
          <span className="text-ink font-extrabold">
            <RubyText text={own} index={furigana} />
          </span>
        ) : (
          <span className="text-ink-faint font-extrabold">
            <RubyText text="（書いて いません）" index={UI_FURIGANA} />
          </span>
        )}
      </p>
      {own !== right && (
        <>
          <p className="text-ink-soft mt-3 text-xs font-extrabold">
            <RubyText text="正解" index={UI_FURIGANA} />
          </p>
          <p className="text-ink mt-1 font-extrabold">
            <RubyText text={right} index={furigana} />
          </p>
        </>
      )}
    </>
  );
}

/**
 * 出す まえの かくにん。
 *
 * ぜんぶ 書いてから 出す やりかたでは、**出す ボタンの 前に 一覧が 要る**
 * ——どこが のこって いるかを 見ないまま「出す」を 押させると、書き忘れに
 * 気づく 機会が 一度も 無いまま 採点に 入る。行を 押せば その もんだいへ 戻る。
 */
function ConfirmCard({
  questions,
  drafts,
  furigana,
  onGoto,
  onBack,
  onSubmit,
}: {
  questions: readonly QuizQuestion[];
  drafts: Readonly<Record<string, Parameters<typeof draftAnswerText>[1]>>;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  onGoto: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const left = questions.filter((q) => !draftAnswered(q, drafts[q.id])).length;
  /*
   * 1問も 書かずに 出す 道を 閉じる。
   *
   * 分からない もんだいで 足止めしないのが この モードの 決めごとだが、**1問も
   * 触らずに 7回 押すだけで 教材が「おわった」に なり、関門が 開き、0点が 初回の
   * 成績として 固定される**（初回だけが 正式なので あとから 直せない）。
   * それは 学びでは ないので、ここだけは 出すのを 待つ。1問でも 書けば 出せる。
   */
  const nothingWritten = left === questions.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island p-6 sm:p-8"
    >
      <h2 className="text-ink text-2xl font-extrabold">
        <RubyText text="出す まえの かくにん" index={UI_FURIGANA} />
      </h2>
      <p className="text-ink-soft mt-2 font-bold">
        {left === 0 ? (
          <RubyText text="ぜんぶ 書けました。出しても だいじょうぶ" index={UI_FURIGANA} />
        ) : nothingWritten ? (
          <RubyText
            text="まだ 1もんも 書いて いません。1もんでも 書いてから 出しましょう"
            index={UI_FURIGANA}
          />
        ) : (
          <RubyText
            text={`のこり ${left}もん。おしても いいし、書いてからでも いいよ`}
            index={UI_FURIGANA}
          />
        )}
      </p>

      <ul className="border-hairline divide-hairline mt-5 divide-y rounded-[var(--radius-card)] border-2">
        {questions.map((q, index) => {
          const written = draftAnswered(q, drafts[q.id]);
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onGoto(index)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left"
              >
                <span
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold"
                  /*
                   * のこりを さがす 画面なので、**のこりの ほうを 薄くしない**。
                   * 書いた ものは 済んだ 印（青）、まだの ものは 目を 引く 枠に する。
                   */
                  style={{
                    background: written ? "var(--color-sky)" : "var(--color-panel)",
                    color: written ? "#fff" : "var(--color-ink-soft)",
                    boxShadow: written ? "none" : "inset 0 0 0 2px var(--color-ink-faint)",
                  }}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink-soft block text-sm font-bold">
                    <RubyText text={q.q} index={furigana} />
                  </span>
                  <span className="mt-1 block text-sm font-extrabold">
                    {written ? (
                      <span className="text-ink">
                        <RubyText text={draftAnswerText(q, drafts[q.id])} index={furigana} />
                      </span>
                    ) : (
                      <span className="text-ink-soft">まだ です</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 grid gap-3">
        {!nothingWritten && (
          <button
            type="button"
            onClick={onSubmit}
            className="btn-island btn-game px-6 py-3.5"
            style={{ "--btn-face": "#58c273", "--btn-shadow": "#3aa458" } as React.CSSProperties}
          >
            <RubyText text="こたえを 出す" index={UI_FURIGANA} />
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className={
            nothingWritten
              ? "btn-island btn-game px-6 py-3.5"
              : "border-hairline text-ink-soft bg-panel rounded-full border-2 px-6 py-2.5 text-sm font-extrabold"
          }
        >
          <RubyText text="もんだいに もどって 見なおす" index={UI_FURIGANA} />
        </button>
      </div>
    </motion.div>
  );
}

function QuizResultCard({
  set,
  embedded,
  summary,
  review,
  furigana,
  onRetryWrong,
  onRetryAll,
}: {
  set: QuizSet;
  embedded: boolean;
  summary: ReturnType<typeof summarizeQuiz>;
  /** 出した ぜんぶの こたえ（設問・結果の 組）。 */
  review: readonly { result: QuizResult; question: QuizQuestion }[];
  furigana: ReturnType<typeof buildFuriganaIndex>;
  onRetryWrong: () => void;
  onRetryAll: () => void;
}) {
  const missed = summary.missedQuestionIds.length;

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

      {/*
        **ぜんぶの もんだいを 出す**（合っていた ものも）。自分が 何と 答え、正解が
        何だったのかが 1画面で 分かるように する。まとめて 出す やりかたでは、
        せつめいを 読める 場所は ここしか 無い。
      */}
      {review.length > 0 && (
        <section className="mt-6">
          <h3 className="text-ink mb-2 font-extrabold">
            <RubyText text="ぜんぶの こたえ" index={UI_FURIGANA} />
            {missed > 0 && (
              <span className="text-ink-soft ml-2 text-sm">
                <RubyText text={`（もう一度 見る もんだい ${missed}こ）`} index={UI_FURIGANA} />
              </span>
            )}
          </h3>
          <ul className="border-hairline divide-hairline divide-y rounded-[var(--radius-card)] border-2">
            {review.map(({ result, question }, index) => (
              <li key={question.id} className="px-4 py-3">
                <p className="flex items-start gap-2">
                  <span
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold"
                    style={{
                      background: result.correct ? "#58c273" : "var(--color-panel-tint)",
                      color: result.correct ? "#fff" : "var(--color-ink-faint)",
                    }}
                  >
                    {result.correct ? "✓" : index + 1}
                  </span>
                  <span className="text-ink text-sm font-extrabold">
                    <RubyText text={question.q} index={furigana} />
                  </span>
                </p>
                <div className="border-hairline bg-panel-tint mt-2 rounded-[var(--radius-card)] border-2 p-3">
                  <AnswerPair question={question} answer={result.answer} furigana={furigana} />
                  <p className="text-ink-soft mt-2 text-sm leading-relaxed font-bold">
                    <RubyText text={question.explain} index={furigana} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-3">
        {missed > 0 && (
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
          {/* 見出しの「もう一度 見る もんだい」と 同じ 語なので、ふりがなも そろえる（規律2） */}
          <RubyText text="もう一度" index={UI_FURIGANA} />
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
