"use client";

import Link from "next/link";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { QuizQuestion, QuizSet } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { NexMax } from "@/components/nexmax";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import type { DictionaryEntry } from "@/lib/dictionary";
import type { FeedbackKey } from "@/lib/feedback";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { createProgressStore, recordContentProgress } from "@/lib/progress/store";
import { correctAnswerText, draftAnswerText, draftAnswered } from "@/lib/quiz/draft";
import { saveNotebook } from "@/lib/answers/notebook";
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
  isWholeSetRun,
  quizReducer,
  resumeQuizSession,
  summarizeQuiz,
  type QuizAction,
  type QuizDrafts,
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
  ["直", "なお"],
  ["話", "はな"],
  // ぜんぶ 1ページ（answerMode: "all"）の 案内で 使う
  ["行き来", "いきき"],
  ["消", "き"],
]);

/**
 * 問題エンジンの画面。
 *
 * 引き継いだのは「やさしさ」と「ごほうび感」の設計思想で、旧アプリの
 * カートリッジ棚UI・茶系インク・フクロウは使わない（設計04 §1）。
 * 演出は必ず学習行為に紐づける（正解したときだけ紙吹雪・スタンプが増える）。
 *
 * ## やりかたは 先生が 決める（`QuizSet.answerMode`・管理画面）
 * - **まとめて 出す**（既定）… ぜんぶ 書いてから 出す。採点は 出した あと 1回だけ
 * - **1問ずつ** … 答えるたびに こたえと せつめいを 読む
 *
 * 学習者には 選ばせない——同じ 教材を 同じ 条件で 受けさせたい 先生の 都合が 先に 立つ
 * （2026-08-19 指定「まとめて出すかをきめるのは管理画面。デフォルトは全てまとめて出す」）。
 */
export function QuizRunner({
  set,
  /**
   * ステージの枠（ContentFrame）の中に置くとき。自前の外枠と戻りリンクを出さない
   * ——戻り先は枠が持つ（教材ごとに戻り先が違うと、学習者は1本おわるたびに
   * 別の一覧へ放り出される）。
   */
  embedded = false,
  /**
   * ことばの ポップアップ辞書（読みものと 同じ 引き先 — `@/lib/dictionary`）。
   *
   * **もんだいにも 辞書を 出す**（2026-08-27 の 指定「全ての コンテンツに ついて、
   * 辞書を 細かく つける」）。調査シートには「実績」「受託開発」「オフショア開発」
   * のような 語が 設問文に 直に 出て くるのに、**そこだけ 意味を 引けなかった**
   *——読みものと ミーティングでは 引けるので、学習者から 見ると 画面ごとに
   * 助けが 消える。渡さなければ 下線は 1本も 出ない（これまでどおり）。
   */
  dictionary,
}: {
  set: QuizSet;
  embedded?: boolean;
  dictionary?: readonly DictionaryEntry[];
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
      set.answerMode,
    ),
  );
  const [state, setState] = useState<QuizState>(() =>
    resumeQuizSession(set, start.index, start.results, set.answerMode, start.drafts),
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
   * しおりは 教材まるごとの 出題順を 前提に する。問題を 絞った セッションの
   * 途中経過は 保存しない——中途半端な 内訳を 次回 誤って 読み込ませない ための 線引き
   *（「まちがえた もんだいだけ」は 2026-08-25 に やめたので、いまは いつも 全問）。
   */
  const isFullSession = state.questions.length === set.questions.length;
  const submitMode = state.mode !== "one";
  /** まとめて 出す ときに「何問 書いたか」（しおりにも 案内の 文にも 使う）。 */
  const written = useMemo(() => answeredCount(state), [state]);

  /**
   * この回が **見ないまま 飛ばして 始めた** 問題の 数。
   *
   * 1問ずつの やりかたで しおり（`position.question`）だけが 残って いる ときは、
   * 答えの 内訳が 無いまま 途中から 始まる（`@/lib/quiz/resume` の 規則5）。飛ばした ぶんは
   * この回の 点にも 記録にも 出て こないので、数だけ ここで 覚えて おく——しおりを どこまで
   * 進めるか（飛ばした ぶん ＋ 答えた 数）と、けっかで「まだ やって いない もんだいが N問」と
   * 伝えるのに 要る。やり直し（`restart`）で 0に 戻す。
   *
   * まとめて 出す では 0。あちらの `index` は「見て いた 番号」で あって、
   * 通り過ぎた 数では ない（下書きは 全問ぶん いつでも 書ける）。
   */
  const [skipped, setSkipped] = useState(
    start.mode !== "one" ? 0 : start.index - start.results.length,
  );

  /**
   * 教材ぜんぶを 通した回か。**成績・DB・「おわった」の 3つとも これで 決める**
   *（判断は `quiz-reducer.ts` の `isWholeSetRun` 1か所）。まとめて 出す は
   * 出した とき 全問ぶんの 記録が できる（書かなかった ものも 1行）ので true に なる。
   */
  const wholeRun = isWholeSetRun(state, set.questions.length);

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
   *
   * 途中の しおりは 1問ずつの とき **飛ばした ぶん ＋ 答えた 数**で 書く。答えた 数だけだと、
   * しおりで 8問目から 始めた 人が 1問 答えて 閉じた とき「1」に なり、しおりが 前へ 戻って
   * 次に 開いた ときに 2問目へ 座らされる。
   *
   * 「おわった」に するのは **全問に 触れた回だけ**（`wholeRun`）。しおりで 途中から 始めて
   * 最後まで 行った 回は とちゅうのまま に する——見て いない 問題が 残って いるのに
   * ステージが 済んだ 顔を すると、その子は もう そこへ 戻らない。
   */
  const done = state.phase.kind === "finished";
  useEffect(() => {
    recordContentProgress(set.id, {
      status: done && wholeRun ? "completed" : "started",
      ...(isFullSession
        ? {
            position: {
              question: done
                ? state.questions.length
                : submitMode
                  ? written
                  : skipped + state.results.length,
            },
          }
        : {}),
    });
  }, [
    set.id,
    done,
    wholeRun,
    isFullSession,
    submitMode,
    written,
    skipped,
    state.questions,
    state.results,
  ]);

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
    /*
     * しおりだけで 途中から 始めた 回は 内訳を 書かない。1問ずつの 保存の 形は
     * 「1問目から 順に N問」を 前提に して いて（`startFrom` は 出題順で 突き合わせる）、
     * 8問目からの 内訳を 書くと 次に 開いた とき 突き合わせに 落ち、**1問目に 戻される**。
     * この回の 続きは しおり（上の effect）だけで 足りる。
     */
    if (skipped > 0) return;
    saveQuizResume({ quizSetId: set.id, results: [...state.results] });
  }, [
    set.id,
    done,
    isFullSession,
    submitMode,
    written,
    skipped,
    state.drafts,
    state.index,
    state.results,
  ]);

  const summary = summarizeQuiz(state);

  /**
   * **正解の 無い 教材か**（自由記述だけで できて いる もんだい）。
   *
   * `free` の 採点は「minLength より 長く 書けたか」しか 見て いない
   *（`src/lib/quiz/draft.ts`）。つまり 出せば かならず 満点で、けっかの 画面は
   * いつも「5 / 5 もん せいかい 100%」と 言う。**言っている ことが 無い**うえ、
   * 学習者には「自分の 考えが 正解だった」と 読めて しまう
   *（2026-08-27 の 指定「松井社長に 何を 話す？は 答えが ないので
   * 答え合わせと いう 形では ない」）。
   *
   * だから **種別から 自動で 見分ける**——`phase: "production"` では 見分けない。
   * 産出フェーズでも 正解の ある 問い（keyword）は 置けるので、
   * その ときは 答え合わせの ほうが 正しい。
   */
  const freeOnly = useMemo(
    () => set.questions.length > 0 && set.questions.every((q) => q.type === "free"),
    [set.questions],
  );

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
   *
   * 残すのは **教材ぜんぶに 触れた回だけ**（`isWholeSetRun`）。しおりで 8問目から 始めた 回も
   * 最後まで 行けてしまうので、そのまま 残すと 9問の 教材が「2 / 2・合格」で 固まる
   * ——初回だけが 正式＝**あとから 直せない**。その回は 何も 書かず、1問目から 通した ときに
   * はじめて 正式な 点が 入る（けっかの 画面で そこへ 誘う）。
   */
  const store = useMemo(() => createProgressStore(), []);
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!done || !wholeRun) return;
    if (savedRef.current === set.id) return;
    savedRef.current = set.id;
    store.recordFirstTestResult({
      stageId: set.id,
      // 画面と 同じ 数え方（何問中 何問）で 残す。点では 何問できたかが 読めない
      score: summary.correct,
      maxScore: summary.total,
      total: summary.total,
      passed: summary.passed,
      at: new Date().toISOString(),
    });
  }, [done, wholeRun, set.id, store, summary]);

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
          // 絞ったセッション（まちがえた もんだいだけ）と、しおりだけで 途中から 始めた 回は
          // 合否を数えてよい回ではない（先生の画面では「（一部）」として 並ぶ）
          fullSet: wholeRun,
        }),
      )
      .catch(() => {
        /* 記録できなくても 学習は 止めない */
      });
  }, [attemptId, done, wholeRun, set.id, set.questions, state.results]);
  const question = currentQuestion(state);
  const byId = useMemo(() => new Map(set.questions.map((q) => [q.id, q])), [set.questions]);

  /*
   * 出した こたえを **端末の こたえノート**にも 残す（`@/lib/answers/notebook`）。
   *
   * このあと ヘンディさんや 松井社長と 話す ときに、**会話の 画面から 自分の
   * こたえを 開く**ため。下書き（`quiz-resume`）は 完走で 消えるので、
   * ちょうど 要る ときには もう 無い——だから 別の 鍵で 写しを 取る。
   *
   * 教材まるごとを 通した 回だけ 残す（`wholeRun`）。途中から 始めた 回の
   * 内訳を メモに すると、**見て いない 問題が 空の まま カンペに 並ぶ**。
   */
  useEffect(() => {
    if (!done || !wholeRun) return;
    saveNotebook({
      quizSetId: set.id,
      at: new Date().toISOString(),
      lines: state.results.flatMap((result) => {
        const q = byId.get(result.questionId);
        if (!q) return [];
        return [
          {
            questionId: q.id,
            q: q.q,
            answer: result.answer ?? "",
            correctAnswer: correctAnswerText(q),
            correct: result.correct,
            report: q.report ?? false,
            section: q.section ?? "",
          },
        ];
      }),
    });
  }, [done, wholeRun, set.id, state.results, byId]);

  /** 出したあとに 見せる 一覧（こたえた 順）。設問が 見つからない 行は 落とす。 */
  const review = useMemo(
    () =>
      state.results.flatMap((result) => {
        const q = byId.get(result.questionId);
        return q ? [{ result, question: q }] : [];
      }),
    [state.results, byId],
  );

  /** やり直し（教材の やりかたの まま 作り直す）。 */
  const restart = useCallback(
    (questions: readonly QuizQuestion[], keepDrafts?: QuizDrafts) => {
      setState(createQuizSession(set, [...questions], set.answerMode, keepDrafts));
      startAttempt();
      // 1問目から やり直すので「飛ばした ぶん」も 無くなる
      setSkipped(0);
    },
    [set, startAttempt],
  );

  /**
   * 前の 回で もう一度 やる ことに なった もんだい。
   *
   * 「もう一度」を 押した ときだけ 入る。画面では **赤い しるし**で 出して、
   * 26問の 中から 直す ところを すぐ 見つけられるように する（2026-08-25 の 指定）。
   * 「はじめから やる」を えらんだら 消す——まっさらから 始める 人に 前の 赤は 要らない。
   */
  const [retryIds, setRetryIds] = useState<readonly string[]>([]);

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-3xl px-4 py-6"}>
      {embedded ? null : (
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link
            prefetch={false}
            href="/quiz"
            className="text-ink-soft hover:text-navy text-sm font-extrabold"
          >
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
          answerMode={set.answerMode}
          answeredCount={submitMode ? written : start.results.length}
          startIndex={state.index}
          onContinue={() => setStarted(true)}
          onStart={() => {
            clearQuizResume(set.id);
            setRetryIds([]);
            restart(set.questions);
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
          skipped={skipped}
          furigana={furigana}
          freeOnly={freeOnly}
          onRetryAll={() => {
            /*
             * **前の こたえを 持ったまま** やり直す（2026-08-25 の 指定）。
             * ぜんぶ 消えると、合って いた 25問を もう一度 打ち直す ことに なる。
             * 直したい ところが どこかは `retryIds`（赤い しるし）が 見せる。
             */
            setRetryIds(summary.missedQuestionIds);
            restart(set.questions, state.drafts);
          }}
        />
      ) : state.mode === "all" ? (
        <AllQuestionsCard
          questions={state.questions}
          drafts={state.drafts}
          retryIds={retryIds}
          furigana={furigana}
          dictionary={dictionary}
          requireAll={set.requireAll}
          inputIssue={state.phase.kind === "ask" ? state.phase.inputIssue : undefined}
          inputIssueQuestionId={
            state.phase.kind === "ask" ? state.phase.inputIssueQuestionId : undefined
          }
          dispatch={dispatch}
          onSubmit={() => dispatch({ type: "submit" })}
        />
      ) : state.phase.kind === "confirm" ? (
        <ConfirmCard
          questions={state.questions}
          drafts={state.drafts}
          furigana={furigana}
          requireAll={set.requireAll}
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

              {/* 前の 回で もう一度に なった もんだい（2026-08-25 の 指定） */}
              {retryIds.includes(question.id) && state.phase.kind === "ask" && (
                <p className="mb-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-extrabold"
                    style={{ background: "#f26fa7", color: "#fff" }}
                  >
                    <RubyText text="↻ もう一度 見る もんだい" index={UI_FURIGANA} />
                  </span>
                </p>
              )}

              {/*
                章（MISSION）は 1問ずつの ときも 出す。**いま どの まとまりを
                やって いるのか**が 分からないのは、全問1ページでも 1問ずつでも 同じ。
              */}
              {question.section && (
                <p className="text-navy mb-1 text-sm font-black">
                  <RubyText text={question.section} index={furigana} />
                </p>
              )}
              {/* 設問の 「＊◯◯の ページ」は 行を 変えて 出す（2026-08-25 の 指定）。
                  データの 改行を そのまま 出すため whitespace-pre-line。 */}
              <p className="text-ink text-lg leading-relaxed font-extrabold whitespace-pre-line">
                <DictionaryText text={question.q} index={furigana} dictionary={dictionary} />
              </p>
              <QuestionSource question={question} furigana={furigana} />
              {state.phase.kind !== "explain" && (
                <div className="mt-3">
                  <QuestionHints question={question} furigana={furigana} dictionary={dictionary} />
                </div>
              )}

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
 * やりかた（1問ずつ／まとめて 出す）は **先生が 管理画面で 決める**ので、ここでは
 * 選ばせない。かわりに「これから どう 進むか」を 1行で 伝える。
 */
function StartCard({
  set,
  furigana,
  resumed,
  answerMode,
  answeredCount,
  startIndex,
  onContinue,
  onStart,
}: {
  set: QuizSet;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  /** 途中の 続きが あるか。 */
  resumed: boolean;
  /** 教材の やりかた（先生が 管理画面で 決める）。 */
  answerMode: QuizMode;
  /** ここまで 答えた（書いた）問題の 数（案内の 文に 出す）。 */
  answeredCount: number;
  /** これから 出す 問題の 番号（0始まり）。内訳が 無い ときの 案内に 使う。 */
  startIndex: number;
  /** 続きから（保存された ところから）始める。 */
  onContinue: () => void;
  /** 保存を 消して、1問目から 始める。 */
  onStart: () => void;
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
                text={answerMode === "one" ? "こたえました" : "書きました"}
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

      {!resumed ? (
        <div className="mt-5">
          <button
            type="button"
            onClick={onStart}
            className="btn-island btn-game w-full px-6 py-3.5"
          >
            はじめる
          </button>
          {/*
            やりかた（1問ずつ／まとめて 出す）は **先生が 管理画面で 決める**ので、
            ここでは 選ばせない。ただし「これから 何が 起きるか」は 先に 言う
            ——まとめて 出す では 途中で こたえあわせが 無い ことを 知らずに
            始めると、答えた あと 何も 起きない ことに 驚く（P8）。
          */}
          <p className="text-ink-soft mt-2 text-center text-sm font-bold">
            <RubyText
              text={
                answerMode === "one"
                  ? "1問 こたえるたびに、こたえと せつめいを 見ます"
                  : answerMode === "all"
                    ? "もんだいは ぜんぶ 1ページに 出ます。行き来しても 書いた ものは 消えません"
                    : "ぜんぶ こたえてから 出します。けっかは さいごに まとめて 見ます"
              }
              index={UI_FURIGANA}
            />
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          <button type="button" onClick={onContinue} className="btn-island btn-game px-6 py-3.5">
            つづきから
          </button>
          <button
            type="button"
            onClick={onStart}
            className="border-hairline text-ink-soft bg-panel rounded-full border-2 px-6 py-2.5 text-sm font-extrabold"
          >
            はじめから やる
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
      {/*
        正解が 無い 問い（自由記述）では「正解」の 欄を 出さない。
        空の 見出しだけが 出ると、学習者は **自分の こたえが まちがいで、
        正しい ものは 空**だと 読む。
      */}
      {right !== "" && own !== right && (
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
  requireAll,
  onGoto,
  onBack,
  onSubmit,
}: {
  questions: readonly QuizQuestion[];
  drafts: Readonly<Record<string, Parameters<typeof draftAnswerText>[1]>>;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  /** ぜんぶ うめるまで 出せなく するか（教材ごと・`quizSet.requireAll`）。 */
  requireAll: boolean;
  onGoto: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const left = questions.filter((q) => !draftAnswered(q, drafts[q.id])).length;
  /*
   * 1問も 書かずに 出す 道を 閉じる。
   *
   * 分からない もんだいで 足止めしないのが この モードの 決めごとだが、**1問も
   * 触らずに 7回 押すだけで 教材が「おわった」に なり、関門が 開き、0点が 初回の
   * 成績として 固定される**（初回だけが 正式なので あとから 直せない）。
   * それは 学びでは ないので、ここだけは 出すのを 待つ。1問でも 書けば 出せる。
   *
   * `requireAll` の 教材では **のこり 0 まで** 出せない（2026-08-27 の 指定）。
   */
  const nothingWritten = requireAll ? left > 0 : left === questions.length;

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
        ) : (
          <RubyText
            text={`のこり ${left}もん。ぜんぶ 書いてから 出しましょう`}
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
                  <span className="text-ink-soft block text-sm font-bold whitespace-pre-line">
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
            onClick={() => setConfirming(true)}
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

      {confirming && (
        <SubmitConfirmDialog
          left={left}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onSubmit();
          }}
        />
      )}
    </motion.div>
  );
}

/**
 * 出す まえの 確認（2026-08-27 の 指定「提出する時に確認のメッセージを出してください」）。
 *
 * ## なぜ「かくにん画面」だけでは 足りないか
 * まとめて 出す には かくにんの ページが あるが、**全問1ページ（`all`）には 無い**
 * ——書き終わった 手で そのまま 押せる 位置に「こたえを 出す」が あり、
 * 押した 瞬間に 採点が 確定する（初回の 点は あとから 直せない）。
 * どちらの やりかたでも 同じ 1枚を はさむ。
 *
 * ## こわがらせない
 * 「出すと もう 直せません」とは 書かない。**直せる**（「もう一度 やる」は
 * 前の こたえを 持ったまま 始まる）ので、そう 書く。出すのを こわがって
 * 手が 止まる ほうが、この 画面の 害に なる。
 */
function SubmitConfirmDialog({
  left,
  onConfirm,
  onCancel,
}: {
  /** まだ 書いて いない 数（0なら ふれない）。 */
  left: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(31,58,86,.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label="こたえを 出す かくにん"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card-island w-full max-w-md p-6"
      >
        <div className="flex items-center gap-3">
          <NexMax variant="guide" size={64} bob />
          <div>
            <h2 className="text-ink text-xl font-extrabold">
              <RubyText text="こたえを 出しますか？" index={UI_FURIGANA} />
            </h2>
            <p className="text-ink-soft mt-1 text-sm font-bold">
              <RubyText
                text={
                  left > 0
                    ? `まだ ${left}もん 書いて いません。出すと 採点します。`
                    : "出すと 採点します。けっかが 見られます。"
                }
                index={UI_FURIGANA}
              />
            </p>
          </div>
        </div>

        <p className="bg-panel-tint border-hairline text-ink mt-4 rounded-[var(--radius-card)] border-2 px-4 py-3 text-sm font-bold">
          <RubyText
            text="出した あとも「もう一度 やる」で 直せます。書いた ことは のこります。"
            index={UI_FURIGANA}
          />
        </p>

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="btn-island btn-game px-6 py-3.5"
            style={{ "--btn-face": "#58c273", "--btn-shadow": "#3aa458" } as React.CSSProperties}
          >
            <RubyText text="はい、出します" index={UI_FURIGANA} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="border-hairline text-ink-soft bg-panel rounded-full border-2 px-6 py-2.5 text-sm font-extrabold"
          >
            <RubyText text="まだ 出さない（見なおす）" index={UI_FURIGANA} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * ぜんぶ 1ページ（`answerMode: "all"`）。
 *
 * 骨組みは `ConfirmCard` と 同じ——番号の チップ・「まだ です」・のこりの 案内・
 * 「こたえを 出す」。ちがうのは **行が 読むだけでは なく 書ける** ことだけ。
 *
 * ## なぜ この 見せかたが 要るか
 * 学習者は 教材（学習用サイト）と もんだいを **行ったり 来たり** する。1問ずつだと
 * 「サイトで 見つけた ことを、いま 開いて いない 3問目に 書く」が できない。
 * 全問 見えて いれば、見つけた 順に 書ける。
 *
 * ## 書いた ものが 消えない しくみ
 * 打つ たびに reducer の `drafts` に 入り、`quiz-runner` の effect が
 * `localStorage` に 書く（`@/lib/quiz/resume`）。画面を 移っても 端末に 残る。
 *
 * ## いちばん こわい 壊れかた: 入力欄の 作り直し
 * `question-types.tsx` の 入力は どれも **マウントの ときだけ** 下書きを 読む
 *（IME の 変換中に 親から 文字を 差し戻さない ための 意図的な 作り）。だから
 * `<li>` の `key` は **`question.id` だけ**。相や 状態を 混ぜた 瞬間、1文字 打つ たびに
 * 全問の 入力が 作り直されて、書いた ものが 飛ぶ。
 */
function AllQuestionsCard({
  questions,
  drafts,
  retryIds,
  furigana,
  dictionary,
  requireAll,
  inputIssue,
  inputIssueQuestionId,
  dispatch,
  onSubmit,
}: {
  questions: readonly QuizQuestion[];
  drafts: Readonly<Record<string, Parameters<typeof draftAnswerText>[1]>>;
  /** 前の 回で もう一度に なった もんだい（赤い しるしを 出す）。 */
  retryIds: readonly string[];
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dictionary: readonly DictionaryEntry[] | undefined;
  /** ぜんぶ うめるまで 出せなく するか（教材ごと・`quizSet.requireAll`）。 */
  requireAll: boolean;
  inputIssue: FeedbackKey | undefined;
  inputIssueQuestionId: string | undefined;
  dispatch: (action: QuizAction) => void;
  onSubmit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const left = questions.filter((q) => !draftAnswered(q, drafts[q.id])).length;
  const written = questions.length - left;
  // 1問も 書かずに 出す 道は 閉じる（理由は ConfirmCard と 同じ）。
  // `requireAll` の 教材では **のこり 0 まで** 出せない（2026-08-27 の 指定）。
  const nothingWritten = requireAll ? left > 0 : left === questions.length;

  /*
   * もんだいごとの dispatch を **作り置き**する。毎回 その場で 関数を 作ると
   * `React.memo` が 効かず、1文字 打つ たびに 全問が 描き直される
   *（制約: 全員が 通る 画面で 重い 処理を 増やさない）。
   */
  const dispatchers = useMemo(
    () =>
      new Map(
        questions.map((q) => [
          q.id,
          (action: QuizAction) => dispatch({ ...action, questionId: q.id } as QuizAction),
        ]),
      ),
    [questions, dispatch],
  );

  const firstLeft = questions.find((q) => !draftAnswered(q, drafts[q.id]));

  return (
    <div className="mt-4">
      {/* のこりが いつも 見える。正誤は 出さない（出したら「まとめて 出す」で なくなる） */}
      <div className="bg-panel/95 border-hairline sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center gap-3 rounded-full border-2 px-4 py-2 backdrop-blur">
        <span className="text-navy text-sm font-extrabold">
          <RubyText text={`こたえた ${written} / ${questions.length}`} index={UI_FURIGANA} />
        </span>
        {firstLeft && (
          <a
            href={`#q-${firstLeft.id}`}
            className="text-ink-soft hover:text-navy ml-auto text-xs font-extrabold"
          >
            <RubyText text="まだの もんだいへ ⤵" index={UI_FURIGANA} />
          </a>
        )}
      </div>

      <ol className="grid gap-4">
        {questions.map((q, index) => (
          // key は question.id **だけ**。相を混ぜると 打つたびに 入力が 作り直される
          <Fragment key={q.id}>
            {/*
              章が 変わる ところで 見出しを 1回だけ。**前の 問いと 見くらべて 決める**
              ので、問いを 1つ 足しても 章と 問いの 対応は ずれない
              （章を 別の 配列で 持つと、そこが ずれる — schema.ts の `section`）。
            */}
            {q.section && q.section !== questions[index - 1]?.section && (
              <SectionHead title={q.section} note={q.sectionNote} furigana={furigana} />
            )}
            <li
              id={`q-${q.id}`}
              className="card-island scroll-mt-16 p-5 sm:p-6"
              /*
               * 前の 回で もう一度に なった もんだいを 赤で 囲む（2026-08-25 の 指定）。
               * 26問の 中から 直す ところを 探させない ため。
               */
              style={
                retryIds.includes(q.id)
                  ? { outline: "3px solid #f26fa7", outlineOffset: 2 }
                  : undefined
              }
            >
              {retryIds.includes(q.id) && (
                <p className="mb-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-extrabold"
                    style={{ background: "#f26fa7", color: "#fff" }}
                  >
                    <RubyText text="↻ もう一度 見る もんだい" index={UI_FURIGANA} />
                  </span>
                </p>
              )}
              <QuestionRow
                question={q}
                index={index}
                total={questions.length}
                answered={draftAnswered(q, drafts[q.id])}
                draft={drafts[q.id]}
                furigana={furigana}
                dictionary={dictionary}
                dispatch={dispatchers.get(q.id)!}
                inputIssue={inputIssueQuestionId === q.id ? inputIssue : undefined}
              />
            </li>
          </Fragment>
        ))}
      </ol>

      <div className="card-island mt-6 p-6">
        <p className="text-ink-soft font-bold">
          {left === 0 ? (
            <RubyText text="ぜんぶ 書けました。出しても だいじょうぶ" index={UI_FURIGANA} />
          ) : (
            <RubyText
              text={`のこり ${left}もん。ぜんぶ 書いてから 出しましょう`}
              index={UI_FURIGANA}
            />
          )}
        </p>
        {/*
          **のこりが ある あいだ「こたえを 出す」を 出さない** 教材では、
          ボタンが 消えた 理由と 次の 一手を 必ず 置く。ボタンだけ 消すと、
          学習者には「出す 道が どこにも 無い」画面に なる（設計01 P8）。
        */}
        {requireAll && left > 0 && (
          <div className="mt-4">
            <p className="bg-cream border-hairline text-ink rounded-[var(--radius-card)] border-2 px-4 py-3 font-extrabold">
              <RubyText
                text={`ぜんぶ 書くと「こたえを 出す」が 出ます。のこり ${left}もん です。`}
                index={UI_FURIGANA}
              />
            </p>
            {firstLeft && (
              <a
                href={`#q-${firstLeft.id}`}
                className="btn-island btn-game mt-3 block w-full px-6 py-3 text-center"
              >
                <RubyText text="まだの もんだいへ ⤵" index={UI_FURIGANA} />
              </a>
            )}
          </div>
        )}
        {!nothingWritten && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn-island btn-game mt-4 w-full px-6 py-3.5"
            style={{ "--btn-face": "#58c273", "--btn-shadow": "#3aa458" } as React.CSSProperties}
          >
            <RubyText text="こたえを 出す" index={UI_FURIGANA} />
          </button>
        )}
      </div>

      {confirming && (
        <SubmitConfirmDialog
          left={left}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onSubmit();
          }}
        />
      )}
    </div>
  );
}

/**
 * ぜんぶ 1ページの ときの 1行。
 *
 * `React.memo` で 包む。包まないと、どこか 1問に 1文字 打つ たびに 全問が 描き直される。
 */
const QuestionRow = memo(function QuestionRow({
  question,
  index,
  total,
  answered,
  draft,
  furigana,
  dictionary,
  dispatch,
  inputIssue,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  answered: boolean;
  draft: Parameters<typeof draftAnswerText>[1];
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dictionary: readonly DictionaryEntry[] | undefined;
  dispatch: (action: QuizAction) => void;
  inputIssue: FeedbackKey | undefined;
}) {
  return (
    <>
      <div className="mb-3 flex items-start gap-3">
        <span
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold"
          /* 書いた ものは 済んだ 印（青）、まだの ものは 目を 引く 枠（ConfirmCard と 同じ） */
          style={{
            background: answered ? "var(--color-sky)" : "var(--color-panel)",
            color: answered ? "#fff" : "var(--color-ink-soft)",
            boxShadow: answered ? "none" : "inset 0 0 0 2px var(--color-ink-faint)",
          }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-ink text-lg font-extrabold whitespace-pre-line">
            <DictionaryText text={question.q} index={furigana} dictionary={dictionary} />
          </h2>
          <QuestionSource question={question} furigana={furigana} />
        </div>
        <span className="text-ink-faint mt-1 shrink-0 text-xs font-extrabold">
          {index + 1}/{total}
        </span>
      </div>

      <QuestionHints question={question} furigana={furigana} dictionary={dictionary} />

      <QuestionBody
        question={question}
        furigana={furigana}
        dispatch={dispatch}
        mode="all"
        draft={draft}
        emotionStep2={draft?.kind === "emotion" && draft.feeling !== null}
      />

      {/* 注意は **その もんだいの 下**に 出す（上に 1つだと どの 欄の 話か 分からない） */}
      {inputIssue && (
        <div className="mt-3">
          <FeedbackMessage messageKey={inputIssue} />
        </div>
      )}
    </>
  );
});

/**
 * どこを 見れば 分かるか（🔎 の 札）。
 *
 * 前は 設問文の 中に 改行で「＊会社の しょうかいの ページ」と 書いて いた。
 * 文の 一部なので **読み上げにも 混ざり**、どこからが 問いなのかが 読めなかった。
 * 札に すると 目で 拾えて、読み上げの 対象からも 外れる。
 */
function QuestionSource({
  question,
  furigana,
}: {
  question: QuizQuestion;
  furigana: ReturnType<typeof buildFuriganaIndex>;
}) {
  if (!question.source) return null;
  return (
    <p className="bg-sky-soft text-navy mt-2 inline-flex w-max rounded-full px-2.5 py-1 text-xs font-extrabold">
      <span aria-hidden className="mr-1">
        🔎
      </span>
      <RubyText text={question.source} index={furigana} />
    </p>
  );
}

/**
 * 考える ヒント。**押すと 開く**。
 *
 * 開きっぱなしに しないのは、答えに 近い 文を いつも 見せると 調べる／考える 練習が
 * 消える ため。けれど **閉じて いる ことが 分かる 見た目**に する——詰まった 学習者が
 * 助けの ありかを 見つけられない ほうが、ずっと まずい（設計01 P8）。
 */
function QuestionHints({
  question,
  furigana,
  dictionary,
}: {
  question: QuizQuestion;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dictionary?: readonly DictionaryEntry[];
}) {
  const hints = question.hints ?? [];
  if (hints.length === 0) return null;
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      {hints.map((hint, i) => (
        <details
          key={i}
          className="border-hairline bg-panel-tint rounded-[14px] border-2 px-3 py-2"
        >
          <summary className="text-navy cursor-pointer text-xs font-extrabold">
            <RubyText text={hint.title} index={furigana} />
          </summary>
          <p className="text-ink mt-1.5 text-sm leading-relaxed font-bold">
            <DictionaryText text={hint.text} index={furigana} dictionary={dictionary} />
          </p>
        </details>
      ))}
    </div>
  );
}

/**
 * 章（MISSION）の 見出し。全問1ページの ときに、章が 変わる ところで 1回だけ 出す。
 *
 * 25問が 見出しなしで 並ぶと、**いま どの 話を 調べて いるのかが 画面から 消える**。
 * 配布資料が MISSION ごとに 区切って いたのは そのためで、同じ 区切りを 画面にも 出す。
 */
function SectionHead({
  title,
  note,
  furigana,
}: {
  title: string;
  note?: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
}) {
  return (
    <li className="mt-3 first:mt-0">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-7 w-2.5 shrink-0 rounded-full"
          style={{ background: "var(--color-sky)" }}
        />
        <div className="min-w-0">
          <h2 className="text-navy text-lg font-black">
            <RubyText text={title} index={furigana} />
          </h2>
          {note && (
            <p className="text-ink-soft text-xs font-extrabold">
              <RubyText text={note} index={furigana} />
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/** けっかの 一覧を 切りかえる ふだ（ぜんぶ／もう一度／ほうこく）。 */
function LensChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full border-2 px-3 py-1 text-xs font-extrabold"
      style={
        on
          ? { background: "var(--color-sky)", borderColor: "var(--color-sky)", color: "#fff" }
          : {
              background: "var(--color-panel)",
              borderColor: "var(--color-hairline)",
              color: "var(--color-ink-soft)",
            }
      }
    >
      <RubyText text={children} index={UI_FURIGANA} />
    </button>
  );
}

/**
 * けっかの 1行。**2つの 役目**を いっしょに はたす。
 *
 * 1. 合っていた／もう一度 が ひと目で 分かる（左の 太い 帯・記号・ことばの 3つで 示す。
 *    色だけに たよらない）。
 * 2. **ヘンディさんに 話す ときの カンペ**に なる（2026-08-25 の 指定）。
 *    いちばん 大きい 字は「口に 出す ことば」——合って いた 問いは 自分の こたえ、
 *    もう一度の 問いは 正解。読み上げれば そのまま 報告に なる。
 *
 * せつめいは 合って いた 行では 畳む。26問 ぜんぶを 開いたままでは カンペに ならない。
 */
function ReviewRow({
  question,
  result,
  number,
  furigana,
  freeOnly = false,
}: {
  question: QuizQuestion;
  result: QuizResult;
  number: number;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  /**
   * 正解の 無い 教材（自由記述だけ）か。
   *
   * ○×の 帯・「✓ できた」の 札・「せつめい」を 出さない——**どれも
   * 「合って いた／いない」を 前提に した 見せ方**で、正解が 無い 問いに 付けると
   * 学習者の 考えに 点が ついたように 見える（2026-08-27 の 指定）。
   * 書けなかった 行だけは 帯を 変えて「まだ」と 言う——責める ためでは なく、
   * 会話に 持って 行けない 行が どれかを 見せる ため。
   */
  freeOnly?: boolean;
}) {
  const ok = result.correct;
  const own = result.answer?.trim() ?? "";
  /*
   * 「言う ことば」。**（1）（2）の 番号は 付けない**——ここは 口に 出す ための 行で、
   * 番号は 読み上げの じゃまに なる（設問文は すぐ 上に 出て いる）。
   * 自由記述に 正解は 無いので、書いた ものが そのまま 言う ことばに なる。
   */
  const right =
    question.type === "wordbank" ? question.blanks.join("　") : correctAnswerText(question);
  const say = ok ? own : right !== "" ? right : own;

  return (
    <li
      className="border-hairline bg-panel rounded-[var(--radius-card)] border-2 px-3 py-3"
      style={{
        borderLeftWidth: 6,
        borderLeftColor: freeOnly ? (ok ? "#4fa8e8" : "#c9d4de") : ok ? "#58c273" : "#f26fa7",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="border-hairline bg-panel-tint text-ink-soft grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold">
          {number}
        </span>
        {freeOnly ? (
          !ok && (
            <span className="border-hairline text-ink-soft bg-panel-tint rounded-full border-2 px-2 py-0.5 text-xs font-extrabold">
              <RubyText text="まだ 書いて いません" index={UI_FURIGANA} />
            </span>
          )
        ) : (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-extrabold"
            style={{ background: ok ? "#58c273" : "#f26fa7", color: "#fff" }}
          >
            <RubyText text={ok ? "✓ できた" : "↻ もう一度"} index={UI_FURIGANA} />
          </span>
        )}
        {question.report && (
          <span className="bg-sky-soft text-navy ml-auto rounded-full px-2 py-0.5 text-xs font-extrabold">
            <RubyText text="🎤 ほうこく" index={UI_FURIGANA} />
          </span>
        )}
      </div>

      <p className="text-ink-soft mt-1.5 text-xs leading-relaxed font-bold whitespace-pre-line">
        <RubyText text={question.q} index={furigana} />
      </p>

      {say !== "" && (
        <p className="text-ink mt-1 leading-relaxed font-extrabold">
          <RubyText text={say} index={furigana} />
        </p>
      )}

      {/*
        もう一度の 行だけ、自分が 書いた ものも 小さく 残す（消すと 何を 直すか 分からない）。
        **書かなかった ことも 出す**——空の まま だと「合って いたのに 出て いない」と 読める。
      */}
      {!freeOnly &&
        !ok &&
        (own === "" ? (
          <p className="text-ink-faint mt-0.5 text-xs font-bold">
            <RubyText text="まだ かいて いません" index={UI_FURIGANA} />
          </p>
        ) : (
          own !== say && (
            <p className="text-ink-faint mt-0.5 text-xs font-bold">
              <RubyText text="あなたの こたえ: " index={UI_FURIGANA} />
              <RubyText text={own} index={furigana} />
            </p>
          )
        ))}

      {/*
        正解の 無い 教材では「せつめい」を **たたまずに 出す**。ここに 入って いるのは
        正解の 解説では なく **話す ときの コツ**（`explain`）で、たたむと 誰も 読まない。
      */}
      <details open={freeOnly || !ok} className="mt-1.5">
        <summary className="text-ink-soft cursor-pointer text-xs font-extrabold">
          <RubyText text={freeOnly ? "話す ときの コツ" : "せつめい"} index={UI_FURIGANA} />
        </summary>
        <p className="text-ink-soft mt-1 text-sm leading-relaxed font-bold">
          <RubyText text={question.explain} index={furigana} />
        </p>
      </details>
    </li>
  );
}

function QuizResultCard({
  set,
  embedded,
  summary,
  review,
  skipped,
  furigana,
  freeOnly,
  onRetryAll,
}: {
  set: QuizSet;
  embedded: boolean;
  summary: ReturnType<typeof summarizeQuiz>;
  /** 出した ぜんぶの こたえ（設問・結果の 組）。 */
  review: readonly { result: QuizResult; question: QuizQuestion }[];
  /** この回が 見ないまま 飛ばした 問題の 数（しおりで 途中から 始めた ときだけ 0より 大きい）。 */
  skipped: number;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  /** 正解の 無い 教材（自由記述だけ）か。点・○×・「せいかい」を 出さない。 */
  freeOnly: boolean;
  onRetryAll: () => void;
}) {
  const missed = summary.missedQuestionIds.length;
  const reportCount = review.filter(({ question }) => question.report).length;
  /*
   * どの ぶんを 見るか。**ほうこく**は、この あと ヘンディさんに 口で 話す もんだいだけ
   *（2026-08-25 の 指定「そちらのページを 見ながら 報告したい」）。26問 ぜんぶを
   * 開いたままだと カンペに ならない。
   */
  const [lens, setLens] = useState<"all" | "again" | "report">("all");
  const shown = review.filter(({ result, question }) =>
    lens === "again" ? !result.correct : lens === "report" ? question.report : true,
  );
  /**
   * 「合格」と 言ってよい回か。**しおりで 途中から 始めた 回では 言わない**
   * ——見て いない 問題が 残って いるので 教材を 通した ことには ならず、成績にも
   * ステージの「おわった」にも 残さない（`isWholeSetRun`）。答えた ぶんの 数と
   * スタンプは そのまま 出す。取り上げは しない。
   */
  const praised = summary.passed && skipped === 0;
  /**
   * 正解の 無い 教材で「できた」と 言える 数＝**書けた 数**。
   *
   * `summary.correct` と 数は 同じに なるが、**呼び名を 変える**のが この 直しの 主眼で
   * ある。「4 / 5 もん せいかい」は、書かなかった 1問を「まちがい」に 見せる。
   * ここでは「4つ 書けました。あと 1つ です」と 言う。
   */
  const written = review.filter(({ result }) => (result.answer ?? "").trim() !== "").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island p-6 sm:p-8"
    >
      {praised && <CelebrationBurst />}
      <div className="flex items-center gap-4">
        <NexMax variant={praised ? "cheer" : set.nekumax} size={84} bob />
        <div>
          <p className="text-ink-soft text-sm font-extrabold">
            {freeOnly ? "はなす じゅんび" : "けっか"}
          </p>
          <h2 className="text-ink text-3xl font-extrabold">
            {freeOnly
              ? written === review.length
                ? "ぜんぶ 書けました！"
                : "ここまで 書けました"
              : praised
                ? "よく できました！"
                : "ここまで すすんだね"}
          </h2>
        </div>
      </div>

      {/*
        しおりで 途中から 始めた 回は、見て いない 問題を 残した まま 最後に 着く。
        数だけ 出して 黙って いると「ぜんぶ できた」と 読めるので、のこりの 数と
        つぎの 一手を **合格の 言い方の 代わりに** ここへ 置く——「合格！ つぎの ステージへ」と
        「まだ 7問 あります」が 並ぶと、どちらを 信じてよいか 分からなくなる。
      */}
      <div className="mt-5">
        {skipped > 0 ? (
          <p className="bg-cream border-hairline text-ink rounded-[var(--radius-card)] border-2 px-4 py-3 font-extrabold">
            <RubyText
              text={`🔖 とちゅうから はじめました。まだ やって いない もんだいが ${skipped}問 あります。「もう一度」を おすと、1もんめから できます。`}
              index={UI_FURIGANA}
            />
          </p>
        ) : (
          <FeedbackMessage
            messageKey={
              freeOnly ? "quiz.prepared" : summary.passed ? "stage.passed" : "quiz.keepGoing"
            }
          />
        )}
      </div>

      {/*
        正解の 無い 教材では **点も ％も 出さない**。数えられるのは「いくつ 書けたか」だけ
        （2026-08-27 の 指定）。スタンプは 残す——書いた ことを 数える しるしで、
        「合って いた 数」の しるしでは ないから。
      */}
      <p className="text-ink mt-5 text-center text-2xl font-extrabold">
        {freeOnly ? (
          <RubyText text={`${written} / ${review.length} つ 書けました`} index={UI_FURIGANA} />
        ) : (
          <>
            {summary.correct} / {summary.total} もん せいかい
            <span className="text-sky ml-3 text-lg">{summary.percent}%</span>
          </>
        )}
      </p>
      <div className="mt-3 flex justify-center">
        <StampRow count={freeOnly ? written : summary.correct} />
      </div>

      {/*
        **ぜんぶの もんだいを 出す**（合っていた ものも）。自分が 何と 答え、正解が
        何だったのかが 1画面で 分かるように する。まとめて 出す やりかたでは、
        せつめいを 読める 場所は ここしか 無い。
      */}
      {review.length > 0 && (
        <section className="mt-6">
          <h3 className="text-ink mb-2 font-extrabold">
            <RubyText
              text={freeOnly ? "あなたが 書いた こと" : "ぜんぶの こたえ"}
              index={UI_FURIGANA}
            />
          </h3>

          {/*
            見る ぶんを 切りかえる。**「ほうこく」で 絞ると カンペに なる**
            ——26問 ぜんぶを 開いたまま 話すのは むずかしい。

            正解の 無い 教材では 出さない。「もう一度」は 存在せず、「ほうこく」は
            ぜんぶの 行に 付く（＝絞る 意味が 無い）ので、押しても 何も 変わらない
            ボタンが 3つ 並ぶだけに なる。
          */}
          <div
            hidden={freeOnly}
            className="bg-panel/95 border-hairline sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap gap-2 rounded-full border-2 px-3 py-2 backdrop-blur"
          >
            <LensChip on={lens === "all"} onClick={() => setLens("all")}>
              {`ぜんぶ ${review.length}`}
            </LensChip>
            {missed > 0 && (
              <LensChip on={lens === "again"} onClick={() => setLens("again")}>
                {`もう一度 ${missed}`}
              </LensChip>
            )}
            {reportCount > 0 && (
              <LensChip on={lens === "report"} onClick={() => setLens("report")}>
                {`🎤 ほうこく ${reportCount}`}
              </LensChip>
            )}
          </div>

          <ul className="grid gap-2">
            {shown.map(({ result, question }) => (
              <ReviewRow
                key={question.id}
                question={question}
                result={result}
                number={review.findIndex((r) => r.question.id === question.id) + 1}
                furigana={furigana}
                freeOnly={freeOnly}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-3">
        {/*
          「まちがえた もんだいだけ」は やめた（2026-08-25 の 指定）。もんだいを 絞ると
          成績に 残らない 別セッションに なり、学習者には その 区別が 見えない。
          **「もう一度」は 前の こたえを 持ったまま**、直したい ところだけ 直せる。
        */}
        <button
          type="button"
          onClick={onRetryAll}
          /*
           * ルビが 語の 中に 入る ので、名前で 引くと「もう一度いちど」に なる。
           * 読み上げにも ルビは 邪魔なので、ルビ前の ことばを aria-label で 持たせる
           *（`ruby-breaks-playwright-name-lookup` と 同じ 手当て）。
           */
          aria-label={freeOnly ? "書き直す" : "もう一度 やる"}
          className="btn-island btn-game px-6 py-3.5"
          style={{ "--btn-face": "#58c273", "--btn-shadow": "#3aa458" } as React.CSSProperties}
        >
          {/* 見出しの「もう一度 見る もんだい」と 同じ 語なので、ふりがなも そろえる（規律2） */}
          <RubyText
            text={
              freeOnly
                ? "書き直す（書いた ものは のこります）"
                : missed > 0
                  ? "もう一度 やる（こたえは のこります）"
                  : "もう一度 やる"
            }
            index={UI_FURIGANA}
          />
        </button>
        {/* 枠の中では戻り先は枠が持つ。ここで別の一覧へ放り出さない */}
        {!embedded && (
          <Link
            prefetch={false}
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
