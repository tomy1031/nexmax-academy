"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Word, WordStage } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { isHiraganaInputReady } from "@/lib/text/normalize";
import { createProgressStore, recordContentProgress } from "@/lib/progress/store";
import {
  arcadeReducer,
  choiceSeconds,
  createSession,
  currentQuestion,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  sceneSpeed,
  START_LIFE,
  summarize,
  type ArcadeAction,
  type ArcadeMode,
  type ArcadeState,
  type Difficulty,
} from "./arcade-reducer";
import { ArcadeScene, HudChip } from "./arcade-scene";
import type { TermOutcome } from "./arcade-three";
import { ArcadeButton, ArcadePanel } from "./arcade-panel";
import { ApproachClock, DamageFlash, McqTerm, ScorePop } from "./arcade-fx";
import { ArcadeResult } from "./arcade-result";
import { FlashcardDeck } from "./flashcard-deck";
import { MeaningChoice } from "./meaning-choice";
import { ReadingInput } from "./reading-input";
import { WordDictionary } from "./word-dictionary";
import { fieldForIndex } from "./scheduler";
import { useCountdown } from "./use-countdown";

/**
 * ことばアーケード（旧 wordtest / DATA DIVE）。
 *
 * 旧アプリの画面構成をそのまま持ってくる:
 *   全画面の舞台の上に、四隅のHUD・中央の用語・下端の入力。
 *   画面の中の小さな枠に収めない。「迫ってくる」は画面を占有してこそ成立する。
 *
 * 世界と迫る用語は three.js（arcade-three.ts）。旧アプリのシーンをそのまま移した。
 * 変えたのは進行の持ち方だけ（グローバル変数 → 純関数reducer）で、
 * 遊び方・得点式・5モード・難易度の効き方は原典どおり。
 *
 * 読みの時間切れは秒数ではなく、用語がカメラに届いたとき（旧 `enemyZ > 30`）。
 * 距離と速さが時間を決めるので、難しさを変えると迫る速さがそのまま変わる。
 */

type Screen =
  | { kind: "stageSelect" }
  | { kind: "mode"; stageId: string }
  | { kind: "hiraCheck"; stageId: string; mode: ArcadeMode }
  | { kind: "play"; stageId: string }
  | { kind: "result"; stageId: string }
  | { kind: "flashcard"; stageId: string }
  | { kind: "dictionary"; stageId: string };

/** 解説の自動送り（旧アプリと同じく、押すと早送りできる）。 */
const EXPLAIN_MS = 2800;

export function ArcadeGame({
  stages,
  /** レッスンから直接呼ばれたときの入り口。単語だけで開いたときは未指定。 */
  initialStageId,
  /**
   * 出るときの 行き先（ふつうは `/<ステージID>`）。
   *
   * ことばアーケードは **ステージから 直行できる**（`/[stage]` の
   * 「さいしょに ことばを おぼえる」）。そこから 来た 学習者を マップへ 出すと、
   * つづきの 教材が ある ステージを 地図の 上から 探し直す ことに なる。
   * 出どころは クエリでなく データから 引く（`wordStageOwner`）ので、
   * URLを 直接 開いた 人にも 同じ 戻り道が 出る。
   *
   * どの ステージにも 付いて いない ことばでは 未指定。そのときは これまでどおり マップ。
   */
  backTo,
}: {
  stages: readonly WordStage[];
  initialStageId?: string;
  backTo?: string;
}) {
  const router = useRouter();
  const store = useMemo(() => createProgressStore(), []);
  const [screen, setScreen] = useState<Screen>(() =>
    initialStageId ? { kind: "mode", stageId: initialStageId } : { kind: "stageSelect" },
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [session, setSession] = useState<ArcadeState | null>(null);
  const savedRef = useRef<string | null>(null);

  const stageId = "stageId" in screen ? screen.stageId : (initialStageId ?? stages[0]?.id);
  const stage = stages.find((s) => s.id === stageId) ?? null;
  const furigana = useMemo(() => buildFuriganaIndex(stage?.furigana ?? []), [stage?.furigana]);

  /*
   * セットを えらぶ 画面から 出る ときの 行き先の 名前。
   * ステージから 来た ときは 手わたされる セットが **その ステージの ぶんだけ**で、
   * どれも 見出しに ステージの 名前を 持つ ので、先頭から 借りれば よい。
   */
  const ownerTitle = useMemo(() => {
    const head = stages[0];
    return head ? { title: head.title, furigana: buildFuriganaIndex(head.furigana) } : null;
  }, [stages]);

  const dispatch = useCallback((action: ArcadeAction) => {
    setSession((prev) => (prev ? arcadeReducer(prev, action) : prev));
  }, []);

  const start = useCallback(
    (target: WordStage, mode: ArcadeMode, onlyWordIds?: readonly string[]) => {
      const mastery = store.readMastery(target.id);
      setSession(createSession({ stage: target, mode, difficulty, mastery, onlyWordIds }));
      savedRef.current = null;
      setScreen({ kind: "play", stageId: target.id });
    },
    [difficulty, store],
  );

  // ロックは置かない（願い #26）。どのグループもすぐ開ける。
  // データの `password` は残っているが、もう見ない。
  const openStage = useCallback((target: WordStage) => {
    setScreen({ kind: "mode", stageId: target.id });
  }, []);

  const leave = useCallback(() => router.push(backTo ?? "/map"), [router, backTo]);

  // ステージの進み具合に反映する（設計07 §3）。けっか画面まで来たら「おわった」。
  const finished = screen.kind === "result";
  useEffect(() => {
    if (!stage) return;
    recordContentProgress(stage.id, { status: finished ? "completed" : "started" });
  }, [stage, finished]);

  // 舞台の景色。遊んでいる間は問題の進みに合わせて変わる（旧 fieldForIndex）。
  const playing = screen.kind === "play" && session !== null;
  const field =
    session && screen.kind === "play"
      ? fieldForIndex(session.fieldSequence, session.index, session.questions.length)
      : (stage?.fieldSequence[0] ?? "forest");
  const question = session ? currentQuestion(session) : null;

  return (
    <ArcadeScene
      world={{
        field,
        speed: session ? sceneSpeed(session.mode, session.difficulty) : 0.7,
        // 旧 gameLoop は PLAY / MCQ / MESSAGE / EVAL の間だけ景色を流していた。
        moving: playing,
        termKey: playing && session && question ? `${session.stageId}:${session.index}` : null,
        termText: question?.word.term ?? "",
        termReading: question?.word.reading ?? "",
        showFurigana: session?.furiganaOn ?? false,
        outcome: session ? termOutcomeOf(session) : null,
        onCollide: () => dispatch({ type: "readingTimeout" }),
      }}
      impact={session ? tookDamage(session) : false}
    >
      {screen.kind === "play" && session && stage ? (
        <PlayLayer
          state={session}
          furigana={furigana}
          dispatch={dispatch}
          onFinished={() => setScreen({ kind: "result", stageId: stage.id })}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-y-auto p-4">
          <div className="pointer-events-none w-full max-w-2xl">
            {screen.kind === "stageSelect" && (
              <StageSelect
                stages={stages}
                onPick={openStage}
                onLeave={leave}
                leaveLabel={
                  backTo && ownerTitle ? (
                    <BackToStage title={ownerTitle.title} furigana={ownerTitle.furigana} />
                  ) : (
                    "マップに もどる"
                  )
                }
              />
            )}

            {screen.kind === "mode" && stage && (
              <ModeSelect
                stage={stage}
                furigana={furigana}
                difficulty={difficulty}
                /*
                  手わたされた セットが 2つ以上 なら、まず **えらびなおす**道を 出す。
                  ここに 並ぶのは その ステージの セット（初級・中級…）だけなので、
                  よその 課の ことばを 選ばせる ことには ならない
                  （ぜんぶ 見たい 人の 入口は /arcade のまま 残って いる）。
                  1つしか 無ければ、来た ステージへ そのまま 帰す。
                */
                backLabel={
                  stages.length > 1 ? (
                    "ほかの セットを えらぶ"
                  ) : backTo ? (
                    <BackToStage title={stage.title} furigana={furigana} />
                  ) : (
                    "マップに もどる"
                  )
                }
                onDifficulty={setDifficulty}
                onPick={(mode) => {
                  if (mode === "test") setScreen({ kind: "hiraCheck", stageId: stage.id, mode });
                  else start(stage, mode);
                }}
                onFlashcard={() => setScreen({ kind: "flashcard", stageId: stage.id })}
                onDictionary={() => setScreen({ kind: "dictionary", stageId: stage.id })}
                onBack={() => (stages.length > 1 ? setScreen({ kind: "stageSelect" }) : leave())}
              />
            )}

            {screen.kind === "hiraCheck" && stage && (
              <HiraganaCheck
                onReady={() => start(stage, screen.mode)}
                onCancel={() => setScreen({ kind: "mode", stageId: stage.id })}
              />
            )}

            {screen.kind === "result" && session && stage && (
              <ResultLayer
                stage={stage}
                state={session}
                furigana={furigana}
                store={store}
                savedRef={savedRef}
                onRetryWrong={(ids) => start(stage, session.mode, ids)}
                onRetryAll={() => start(stage, session.mode)}
                onBack={() => setScreen({ kind: "mode", stageId: stage.id })}
                /* おわった 直後が いちばん 出たい 瞬間。ステージから 来た ときだけ 出す */
                onLeave={backTo ? leave : undefined}
                leaveLabel={backTo ? <BackToStage title={stage.title} furigana={furigana} /> : null}
              />
            )}

            {screen.kind === "flashcard" && stage && (
              <div className="pointer-events-auto">
                <FlashcardDeck
                  words={stage.words}
                  furigana={furigana}
                  onBack={() => setScreen({ kind: "mode", stageId: stage.id })}
                />
              </div>
            )}

            {screen.kind === "dictionary" && stage && (
              <div className="pointer-events-auto">
                <WordDictionary
                  words={stage.words}
                  furigana={furigana}
                  onBack={() => setScreen({ kind: "mode", stageId: stage.id })}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </ArcadeScene>
  );
}

/**
 * 迫っている用語の決着のつき方（旧 resolveReading → startMcqPhase の分岐）。
 * null は「まだ迫っている最中」。
 */
function termOutcomeOf(state: ArcadeState): TermOutcome | null {
  const phase = state.phase;
  if (phase.kind !== "meaning") return null;
  // 問題だけモードは読みを聞かないので、迫らせずにそのまま砕く（旧 mode === "quiz"）。
  if (phase.readingOk === null) return "skipped";
  return phase.readingOk ? "hit" : "missed";
}

/** ライフが減った瞬間か（旧 takeDamage）。れんしゅうのときだけ痛い。 */
function tookDamage(state: ArcadeState): boolean {
  if (state.mode !== "practice") return false;
  const phase = state.phase;
  if (phase.kind === "meaning") return phase.readingOk === false;
  if (phase.kind === "explain") return phase.feedback === "meaning.retry";
  return false;
}

/* ------------------------------------------------------------------ *
 * プレイ中 — 四隅HUD・中央の用語・下端の入力
 * ------------------------------------------------------------------ */

function PlayLayer({
  state,
  furigana,
  dispatch,
  onFinished,
}: {
  state: ArcadeState;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dispatch: (action: ArcadeAction) => void;
  onFinished: () => void;
}) {
  const question = currentQuestion(state);
  const phase = state.phase;
  const resetKey = `${state.index}:${phase.kind}`;

  const onMeaningExpire = useCallback(() => dispatch({ type: "meaningTimeout" }), [dispatch]);

  // 読みのフェーズに秒数のカウントは無い。用語がカメラに届いた時が時間切れで、
  // それは3Dの世界が知らせてくる（ArcadeScene の onCollide）。
  const meaningLeft = useCountdown({
    seconds: choiceSeconds(state.difficulty),
    active: phase.kind === "meaning",
    onExpire: onMeaningExpire,
    resetKey,
  });

  useEffect(() => {
    if (phase.kind !== "explain") return;
    const advance = () => dispatch({ type: "advance" });
    const timer = setTimeout(advance, EXPLAIN_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") advance();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase.kind, state.index, dispatch]);

  useEffect(() => {
    if (phase.kind === "finished") onFinished();
  }, [phase.kind, onFinished]);

  // 読みを聞いた結果。null は「聞いていない」（問題だけモード）。
  const verdict = phase.kind === "meaning" ? phase.readingOk : null;

  if (!question) return null;
  const { word, choices } = question;
  const isPractice = state.mode === "practice";
  const readingMissed = phase.kind === "meaning" && phase.readingOk === false;

  return (
    <>
      {/*
        4択の間。旧アプリは時計だけを近づけ、用語は撃破して消していた。
        ここでは旧「問題だけ」モードの #mcq-term をどのモードでも出しておく。
        選んでいる間も言葉が見えるほうが覚えられる。時計はその後ろで近づく。
      */}
      {phase.kind === "meaning" && (
        <>
          <ApproachClock remaining={meaningLeft} />
          <McqTerm term={word.term} reading={word.reading} />
        </>
      )}

      {/* 迫ってくる用語・出現の輪・撃破の粒は three.js の中（arcade-three.ts）。 */}

      {/* 加点ポップ（旧 scorePop） */}
      {state.lastGain > 0 && <ScorePop id={resetKey} label={`+${state.lastGain}`} />}
      {/* テストは点が入らないので、旧アプリと同じく「OK!」だけ出す。 */}
      {verdict === true && state.lastGain === 0 && <ScorePop id={resetKey} label="OK!" quiet />}
      {isPractice && readingMissed && <DamageFlash id={resetKey} />}

      {/* 四隅のHUD（旧アプリと同じ配置。中央は用語のために空ける） */}
      <div className="pointer-events-none absolute inset-x-0 top-12 flex items-start justify-between px-4 sm:px-8">
        <div className="flex flex-col items-start gap-2">
          {isPractice && <HudChip label="SCORE" value={state.score} accent="#f0a819" />}
          <HudChip
            label="もんだい"
            value={`${Math.min(state.index + 1, state.questions.length)} / ${state.questions.length}`}
          />
          {isPractice && state.combo >= 2 && (
            <span className="animate-pulse rounded-full bg-[#f26fa7] px-3 py-1 text-sm font-black text-white">
              {state.combo} COMBO!! 🔥
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <HudChip label="MODE" value={MODE_LABEL[state.mode]} accent="#0272ae" />
          {isPractice && (
            <HudChip
              label="LIFE"
              value={
                <span aria-label={`のこり ライフ ${state.life}`}>
                  {"❤️".repeat(Math.max(0, state.life))}
                  {"🤍".repeat(Math.max(0, START_LIFE - Math.max(0, state.life)))}
                </span>
              }
            />
          )}
        </div>
      </div>

      {/* 下端 — 入力／4択／解説 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-5 sm:pb-8">
        {phase.kind === "reading" && (
          <>
            {state.hint && (
              <div className="pointer-events-auto w-full max-w-2xl">
                <FeedbackMessage messageKey={state.hint} />
              </div>
            )}
            <p
              className="text-lg font-black sm:text-xl"
              style={{ color: "#1f3a56", WebkitTextStroke: "3px #fff", paintOrder: "stroke fill" }}
            >
              よみを ひらがなで 入力して、Enter！
            </p>
            <div className="pointer-events-auto w-full max-w-2xl">
              <ReadingInput
                key={resetKey}
                shake={Boolean(state.hint)}
                onSubmit={(input) => dispatch({ type: "submitReading", input })}
              />
            </div>
          </>
        )}

        {phase.kind === "meaning" && (
          <>
            {readingMissed && (
              <p
                className="text-lg font-black"
                style={{
                  color: "#1f3a56",
                  WebkitTextStroke: "3px #fff",
                  paintOrder: "stroke fill",
                }}
              >
                よみ: {word.reading}
              </p>
            )}
            <p
              className="text-xl font-black sm:text-2xl"
              style={{ color: "#1f3a56", WebkitTextStroke: "3px #fff", paintOrder: "stroke fill" }}
            >
              英語の 意味を えらぼう！
            </p>
            <div className="pointer-events-auto w-full max-w-3xl">
              <MeaningChoice
                choices={choices}
                remaining={meaningLeft}
                onChoose={(choice) => dispatch({ type: "chooseMeaning", choice })}
              />
            </div>
          </>
        )}

        {phase.kind === "explain" && (
          <button
            type="button"
            onClick={() => dispatch({ type: "advance" })}
            className="pointer-events-auto w-full max-w-2xl rounded-[24px] border-4 border-white bg-[#fffaf0]/97 p-4 text-left shadow-[0_7px_0_#b8deed,0_18px_32px_rgba(0,79,141,.25)]"
          >
            <FeedbackMessage messageKey={phase.feedback} />
            <p className="text-ink mt-3 text-lg font-black">
              <ruby>
                {word.term}
                <rt>{word.reading}</rt>
              </ruby>
              <span className="text-sky ml-3 text-base">{word.meaningEn}</span>
            </p>
            <p className="text-ink-soft mt-1 font-bold">
              <RubyText text={word.explanationJa} index={furigana} />
            </p>
            <p className="text-ink-faint mt-2 text-sm">
              <RubyText text={word.example} index={furigana} />
            </p>
            <p className="text-ink-faint mt-2 text-xs font-bold">（おす／Enter で つぎへ）</p>
          </button>
        )}

        <div className="pointer-events-auto flex gap-2">
          {state.mode !== "test" && (
            <ArcadeButton
              tone={state.furiganaOn ? "info" : "quiet"}
              className="px-4 py-2 text-sm"
              onClick={() => dispatch({ type: "toggleFurigana" })}
            >
              ふりがな {state.furiganaOn ? "ON" : "OFF"}
            </ArcadeButton>
          )}
          <ArcadeButton
            tone="quiet"
            className="px-4 py-2 text-sm"
            onClick={() => dispatch({ type: "quit" })}
          >
            やめる
          </ArcadeButton>
        </div>
      </div>
    </>
  );
}

const MODE_LABEL: Record<ArcadeMode, string> = {
  practice: "れんしゅう",
  test: "テスト",
  quiz: "もんだい",
};

/* ------------------------------------------------------------------ *
 * ステージ選択（単語だけで開いたときの入り口）
 * ------------------------------------------------------------------ */

function StageSelect({
  stages,
  onPick,
  onLeave,
  leaveLabel,
}: {
  stages: readonly WordStage[];
  onPick: (stage: WordStage) => void;
  onLeave: () => void;
  /** 出る ボタンの 字。行き先を 決める 親が 言葉も 決める。 */
  leaveLabel: ReactNode;
}) {
  return (
    <ArcadePanel kicker="Select Set" title="ことばの セットを えらぶ">
      <p className="text-ink-soft mt-1 text-sm font-bold">
        まなびたい ことばの セットを えらんでね。
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {stages.map((stage) => {
          const index = buildFuriganaIndex(stage.furigana);
          return (
            <li key={stage.id}>
              <button
                type="button"
                onClick={() => onPick(stage)}
                className="border-hairline hover:border-sky w-full rounded-[20px] border-2 bg-white p-4 text-left transition hover:scale-[1.02]"
              >
                <p className="text-sky text-xs font-black">
                  ことば {stage.words.length}こ ／ 合格 {stage.passRate}%
                </p>
                <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <RubyText
                    className="text-ink block text-lg font-black"
                    text={stage.title}
                    index={index}
                  />
                  {/* セット名（初級・中級…）。同じ 見出しが ならぶので、ここが 目じるし。 */}
                  {stage.label ? <SetBadge label={stage.label} index={index} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <ArcadeButton tone="quiet" className="mt-4 w-full" onClick={onLeave}>
        {leaveLabel}
      </ArcadeButton>
    </ArcadePanel>
  );
}

/**
 * セット名の 札（初級・中級…）。
 *
 * 濃い 地に 白文字なので、ふりがなも 白に する（`RUBY_ON_COLOR` と 同じ 向き・
 * docs/constraints.md 2026-08-18/21）。`.text-white rt` が currentColor を 継ぐ。
 */
function SetBadge({
  label,
  index,
}: {
  label: string;
  index: ReturnType<typeof buildFuriganaIndex>;
}) {
  return (
    <RubyText
      className="bg-sky rounded-full px-2 py-0.5 text-xs font-black text-white"
      text={label}
      index={index}
    />
  );
}

/**
 * 「← <ステージ名>に もどる」の 札。
 *
 * 中身を **1つの span に まとめる**のは、狭い画面で ばらばらの 要素が
 * それぞれ 折り返し、「ほう／こく に もどる」のように 語の 途中で 割れるため
 *（content-frame.tsx の LockedNotice と 同じ 理由。390px の 実機で 発生）。
 * ステージ名には 漢字が 入りうるので ルビを 合成する（規律2）。
 */
function BackToStage({
  title,
  furigana,
}: {
  title: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
}) {
  return (
    <span className="text-center leading-relaxed">
      ← <RubyText text={title} index={furigana} />に もどる
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * モード選択（旧アプリの5モード＋難易度をそのまま）
 * ------------------------------------------------------------------ */

function ModeSelect({
  stage,
  furigana,
  difficulty,
  backLabel,
  onDifficulty,
  onPick,
  onFlashcard,
  onDictionary,
  onBack,
}: {
  stage: WordStage;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  difficulty: Difficulty;
  /** 出る ボタンの 字。行き先を 決める 親が 言葉も 決める（ここで 場合分けしない）。 */
  backLabel: ReactNode;
  onDifficulty: (d: Difficulty) => void;
  onPick: (mode: ArcadeMode) => void;
  onFlashcard: () => void;
  onDictionary: () => void;
  onBack: () => void;
}) {
  return (
    <ArcadePanel
      kicker="Mission Select"
      /*
       * 見出しは ステージの 名前。漢字が 入りうるので ルビを 合成する（規律2）。
       * セット名が あれば 横に 出す——同じ 見出しの セットが ならぶ ので、
       * いま どれを 開いて いるかが 分からないと 迷う。
       */
      title={
        <span className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
          <RubyText text={stage.title} index={furigana} />
          {stage.label ? <SetBadge label={stage.label} index={furigana} /> : null}
        </span>
      }
      className="text-center"
    >
      <p className="text-ink-soft mt-1 text-sm font-bold">
        <RubyText text={stage.description} index={furigana} />
      </p>
      <p className="text-ink-faint mt-1 text-xs font-bold">
        ことば {stage.words.length}こ ／ 1回の もんだい {stage.questionCount}こ ／ 合格{" "}
        {stage.passRate}%
      </p>

      <p className="text-ink-soft mt-5 text-sm font-black">
        むずかしさ（スピードと 時間だけが かわるよ）
      </p>
      <div className="mt-2 flex justify-center gap-2">
        {(Object.keys(DIFFICULTY) as Difficulty[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onDifficulty(key)}
            aria-pressed={difficulty === key}
            className={`rounded-full border-2 px-4 py-2 text-sm font-black transition ${
              difficulty === key
                ? "border-[#f26fa7] bg-[#f26fa7] text-white"
                : "border-hairline text-ink-soft bg-white"
            }`}
          >
            {DIFFICULTY[key].label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ArcadeButton tone="go" className="flex-col py-4" onClick={() => onPick("practice")}>
          <span className="text-lg">れんしゅう</span>
          <span className="text-xs opacity-90">たのしく おぼえる</span>
        </ArcadeButton>
        <ArcadeButton tone="primary" className="flex-col py-4" onClick={() => onPick("test")}>
          <span className="text-lg">テスト</span>
          <span className="text-xs opacity-90">点数を 見る</span>
        </ArcadeButton>
        <ArcadeButton tone="sub" className="flex-col py-4" onClick={() => onPick("quiz")}>
          <span className="text-lg">もんだいだけ</span>
          <span className="text-xs opacity-90">入力なしで 意味クイズ</span>
        </ArcadeButton>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ArcadeButton tone="info" className="flex-col py-4" onClick={onFlashcard}>
          <span className="text-lg">フラッシュカード</span>
          <span className="text-xs opacity-90">カードを めくって おぼえる</span>
        </ArcadeButton>
        <ArcadeButton tone="quiet" className="flex-col py-4" onClick={onDictionary}>
          <span className="text-lg">辞書</span>
          <span className="text-xs opacity-80">ことばを しらべる</span>
        </ArcadeButton>
      </div>

      <ArcadeButton tone="quiet" className="mt-4 px-6 py-2 text-sm" onClick={onBack}>
        {backLabel}
      </ArcadeButton>
    </ArcadePanel>
  );
}

/* ------------------------------------------------------------------ *
 * ひらがな入力チェック（テストの前に一度だけ）
 * ------------------------------------------------------------------ */

const HIRA_TARGETS = ["あいうえお", "ようけんていぎ"] as const;

function HiraganaCheck({ onReady, onCancel }: { onReady: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState("");
  const [miss, setMiss] = useState(false);
  const target = HIRA_TARGETS[step]!;

  const submit = () => {
    if (!isHiraganaInputReady(value, target)) {
      setMiss(true);
      return;
    }
    setMiss(false);
    setValue("");
    if (step + 1 >= HIRA_TARGETS.length) onReady();
    else setStep(step + 1);
  };

  return (
    <ArcadePanel kicker="Input Check" title="ひらがな入力チェック" className="text-center">
      <p className="text-ink-soft mt-2 font-bold">つぎの ことばを 入力してください。</p>
      <p className="text-navy mt-4 text-4xl font-black">{target}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMiss(false);
        }}
        onKeyDown={(e) => {
          /*
           * 日本語入力（IME）の **変換を確定する Enter** で けってい しない。
           *
           * 「あいうえお」を打って Enter を押した瞬間、Chrome はまだ変換の途中なので
           * `keyCode` は 229 で `isComposing` が true（`key` は "Enter" のまま来る）。
           * ここで進めてしまうと、次のお題に切り替えたあとで IME が確定した文字を
           * 入力欄に入れ直すため、**打った字が消えないまま残る**（2026-08-25 実発生）。
           * 確定の Enter は IME に渡し、学習者が次に押す Enter だけを けってい にする。
           */
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          if (e.key === "Enter") submit();
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="ひらがなで 入力する"
        className="border-hairline bg-panel text-ink mt-4 w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-center text-2xl font-black"
      />
      {miss && (
        <div className="mt-3 text-left">
          <FeedbackMessage messageKey="reading.needHiragana" />
        </div>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <ArcadeButton onClick={submit}>けってい</ArcadeButton>
        <ArcadeButton tone="quiet" onClick={onCancel}>
          やめる
        </ArcadeButton>
      </div>
    </ArcadePanel>
  );
}

/* ------------------------------------------------------------------ *
 * けっか
 * ------------------------------------------------------------------ */

function ResultLayer({
  stage,
  state,
  furigana,
  store,
  savedRef,
  onRetryWrong,
  onRetryAll,
  onBack,
  onLeave,
  leaveLabel,
}: {
  stage: WordStage;
  state: ArcadeState;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  store: ReturnType<typeof createProgressStore>;
  savedRef: React.RefObject<string | null>;
  onRetryWrong: (ids: readonly string[]) => void;
  onRetryAll: () => void;
  onBack: () => void;
  onLeave?: () => void;
  leaveLabel?: ReactNode;
}) {
  const summary = useMemo(() => summarize(state), [state]);
  const byId = useMemo(() => new Map(stage.words.map((w) => [w.id, w])), [stage.words]);
  const missedWords = summary.missedWordIds
    .map((id) => byId.get(id))
    .filter((w): w is Word => Boolean(w));

  useEffect(() => {
    const token = `${stage.id}:${state.mode}:${state.outcomes.length}:${summary.score}`;
    if (savedRef.current === token) return;
    savedRef.current = token;

    store.recordAttempts(
      stage.id,
      state.outcomes.map((o) => ({
        wordId: o.wordId,
        correct: o.meaningOk && o.readingOk !== false,
      })),
    );
    store.recordGameScore(stage.id, state.score, state.bestCombo);
    if (state.mode === "test") {
      store.recordFirstTestResult({
        stageId: stage.id,
        score: summary.score,
        maxScore: summary.maxScore,
        readingCorrect: summary.readingCorrect,
        meaningCorrect: summary.meaningCorrect,
        total: summary.total,
        passed: summary.passed,
        at: new Date().toISOString(),
      });
    }
  }, [stage.id, state, summary, store, savedRef]);

  return (
    <div className="pointer-events-auto">
      <ArcadeResult
        summary={summary}
        gameScore={state.score}
        bestCombo={state.bestCombo}
        isTest={state.mode === "test"}
        missedWords={missedWords}
        furigana={furigana}
        onRetryWrong={() => onRetryWrong(summary.missedWordIds)}
        onRetryAll={onRetryAll}
        onBack={onBack}
        onLeave={onLeave}
        leaveLabel={leaveLabel}
      />
    </div>
  );
}
