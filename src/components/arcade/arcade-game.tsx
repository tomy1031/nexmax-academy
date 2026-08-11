"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Word, WordStage } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { isHiraganaInputReady } from "@/lib/text/normalize";
import {
  createProgressStore,
  recordContentProgress,
  subscribeProgress,
} from "@/lib/progress/store";
import {
  approachSeconds,
  arcadeReducer,
  choiceSeconds,
  createSession,
  currentQuestion,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  START_LIFE,
  summarize,
  type ArcadeAction,
  type ArcadeMode,
  type ArcadeState,
  type Difficulty,
} from "./arcade-reducer";
import { ApproachingTerm, ArcadeScene, HudChip, type StageEffect } from "./arcade-scene";
import { IMMINENT_PROGRESS } from "./arcade-world";
import { fieldPreset } from "./fields";
import { ArcadeButton, ArcadePanel } from "./arcade-panel";
import { ApproachClock, Burst, DamageFlash, HitRing, PortalRing, ScorePop } from "./arcade-fx";
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
 * 変えたのは配色（暗いサイバー調 → 島の明るいトロピカル）と、
 * 実装（グローバル変数 → 純関数reducer・WebGL → CSS遠近法）だけ。
 * 遊び方・得点式・5モード・難易度の効き方は原典どおり。
 */

type Screen =
  | { kind: "stageSelect" }
  | { kind: "password"; stageId: string }
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
}: {
  stages: readonly WordStage[];
  initialStageId?: string;
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

  const openStage = useCallback(
    (target: WordStage) => {
      const locked = Boolean(target.password) && !store.isUnlocked(target.id);
      setScreen(
        locked ? { kind: "password", stageId: target.id } : { kind: "mode", stageId: target.id },
      );
    },
    [store],
  );

  const leave = useCallback(() => router.push("/map"), [router]);

  // ステージの進み具合に反映する（設計07 §3）。けっか画面まで来たら「おわった」。
  const finished = screen.kind === "result";
  useEffect(() => {
    if (!stage) return;
    recordContentProgress(stage.id, { status: finished ? "completed" : "started" });
  }, [stage, finished]);

  // 舞台の景色。遊んでいる間は問題の進みに合わせて変わる。
  const playing = screen.kind === "play" && session !== null;
  const field =
    session && screen.kind === "play"
      ? fieldForIndex(session.fieldSequence, session.index, session.questions.length)
      : (stage?.fieldSequence[0] ?? "sea");
  // 景色の流れる速さ。旧アプリと同じく難しさで変わる（メニュー中はゆっくり）。
  const speed = playing && session ? DIFFICULTY[session.difficulty].speed : 0.45;
  const stageEffect = playing && session ? stageEffectOf(session) : "none";
  // ゆれ始めるのは用語が目の前に来てから（旧 gameLoop の `enemyZ > -250`）。
  // 残り時間を毎フレーム上げ直さず、アニメーションの開始を遅らせて同じ間合いを作る。
  const effectDelay =
    session && stageEffect === "near" ? approachSeconds(session.difficulty) * IMMINENT_PROGRESS : 0;

  return (
    <ArcadeScene field={field} speed={speed} effect={stageEffect} effectDelay={effectDelay}>
      {screen.kind === "play" && session && stage ? (
        <PlayLayer
          state={session}
          furigana={furigana}
          field={field}
          dispatch={dispatch}
          onFinished={() => setScreen({ kind: "result", stageId: stage.id })}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-y-auto p-4">
          <div className="pointer-events-none w-full max-w-2xl">
            {screen.kind === "stageSelect" && (
              <StageSelect stages={stages} store={store} onPick={openStage} onLeave={leave} />
            )}

            {screen.kind === "password" && stage && (
              <PasswordGate
                stage={stage}
                onUnlock={() => {
                  store.unlock(stage.id);
                  setScreen({ kind: "mode", stageId: stage.id });
                }}
                onBack={() => setScreen({ kind: "stageSelect" })}
              />
            )}

            {screen.kind === "mode" && stage && (
              <ModeSelect
                stage={stage}
                furigana={furigana}
                difficulty={difficulty}
                canGoBack={stages.length > 1}
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
 * いま舞台をどう動かすか。進行の状態だけから決まるので、毎フレームの
 * 残り時間を親まで持ち上げなくてよい（CSSアニメーションが時間を持つ）。
 */
function stageEffectOf(state: ArcadeState): StageEffect {
  const phase = state.phase;
  // 用語が迫っている間。ぶつかる直前からゆれ出す。
  if (phase.kind === "reading") return "near";
  // 読みが決まった瞬間の一発。正解は前へぐっと加速（旧 kickFov）、
  // 取りそこねは被弾のゆれ（旧 damage-shake）。
  if (phase.kind === "meaning" && phase.readingOk !== null) {
    return phase.readingOk ? "kick" : "damage";
  }
  return "none";
}

/* ------------------------------------------------------------------ *
 * プレイ中 — 四隅HUD・中央の用語・下端の入力
 * ------------------------------------------------------------------ */

function PlayLayer({
  state,
  furigana,
  field,
  dispatch,
  onFinished,
}: {
  state: ArcadeState;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  field: string;
  dispatch: (action: ArcadeAction) => void;
  onFinished: () => void;
}) {
  const question = currentQuestion(state);
  const phase = state.phase;
  const resetKey = `${state.index}:${phase.kind}`;
  const aura = fieldPreset(field).aura;

  const onReadingExpire = useCallback(() => dispatch({ type: "readingTimeout" }), [dispatch]);
  const onMeaningExpire = useCallback(() => dispatch({ type: "meaningTimeout" }), [dispatch]);

  const readingLeft = useCountdown({
    seconds: approachSeconds(state.difficulty),
    active: phase.kind === "reading",
    onExpire: onReadingExpire,
    resetKey,
  });
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
      {/* 4択の残り時間。用語のうしろで時計が近づいてくる（旧 #mcq-clock）。 */}
      {phase.kind === "meaning" && <ApproachClock remaining={meaningLeft} />}

      <ApproachingTerm
        term={word.term}
        reading={word.reading}
        showFurigana={state.furiganaOn}
        remaining={readingLeft}
        field={field}
        frozen={phase.kind !== "reading"}
        missed={readingMissed}
      />

      {/* 用語が奥に現れる合図の輪（旧 spawnFxRing "portal"） */}
      {phase.kind === "reading" && <PortalRing id={resetKey} color={aura} />}

      {/* 用語を止めた瞬間に砕け散る（旧 explode）。
          問題だけモードは用語が迫ってこないので出さない。 */}
      {verdict !== null && <Burst id={resetKey} color={aura} />}

      {/* 正解・加点の演出（旧アプリの scorePop / リング を移植） */}
      {state.lastGain > 0 && (
        <>
          <HitRing id={`${resetKey}-ring`} combo={state.combo} />
          <ScorePop id={resetKey} label={`+${state.lastGain}`} />
        </>
      )}
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
  store,
  onPick,
  onLeave,
}: {
  stages: readonly WordStage[];
  store: ReturnType<typeof createProgressStore>;
  onPick: (stage: WordStage) => void;
  onLeave: () => void;
}) {
  // 解錠状態は外部ストア（localStorage）を購読する
  const unlockedKey = useSyncExternalStore(
    subscribeProgress,
    () => stages.map((s) => (store.isUnlocked(s.id) ? "1" : "0")).join(""),
    () => stages.map(() => "0").join(""),
  );

  return (
    <ArcadePanel kicker="Select Stage" title="グループを えらぶ">
      <p className="text-ink-soft mt-1 text-sm font-bold">
        まなびたい ことばの グループを えらんでね。
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {stages.map((stage, i) => {
          const locked = Boolean(stage.password) && unlockedKey[i] === "0";
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
                <p className="text-ink mt-1 text-lg font-black">
                  {stage.title}
                  {locked && <span className="ml-2 text-sm">🔒</span>}
                </p>
                <p className="text-ink-soft mt-1 text-sm font-bold">{stage.description}</p>
              </button>
            </li>
          );
        })}
      </ul>
      <ArcadeButton tone="quiet" className="mt-4 w-full" onClick={onLeave}>
        マップに もどる
      </ArcadeButton>
    </ArcadePanel>
  );
}

function PasswordGate({
  stage,
  onUnlock,
  onBack,
}: {
  stage: WordStage;
  onUnlock: () => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);

  return (
    <ArcadePanel
      kicker="Locked"
      title="この グループは まだ ひらいていません"
      className="text-center"
    >
      <div className="mt-3">
        <FeedbackMessage messageKey="stage.locked" />
      </div>
      <input
        type="text"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setWrong(false);
        }}
        autoComplete="off"
        spellCheck={false}
        placeholder="パスワード"
        aria-label="パスワード"
        className="border-hairline bg-panel text-ink mt-4 w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-center text-xl font-black"
      />
      {wrong && (
        <div className="mt-3">
          <FeedbackMessage messageKey="stage.passwordRetry" />
        </div>
      )}
      <div className="mt-4 flex justify-center gap-2">
        <ArcadeButton onClick={() => (password === stage.password ? onUnlock() : setWrong(true))}>
          ひらく
        </ArcadeButton>
        <ArcadeButton tone="quiet" onClick={onBack}>
          もどる
        </ArcadeButton>
      </div>
    </ArcadePanel>
  );
}

/* ------------------------------------------------------------------ *
 * モード選択（旧アプリの5モード＋難易度をそのまま）
 * ------------------------------------------------------------------ */

function ModeSelect({
  stage,
  furigana,
  difficulty,
  canGoBack,
  onDifficulty,
  onPick,
  onFlashcard,
  onDictionary,
  onBack,
}: {
  stage: WordStage;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  difficulty: Difficulty;
  canGoBack: boolean;
  onDifficulty: (d: Difficulty) => void;
  onPick: (mode: ArcadeMode) => void;
  onFlashcard: () => void;
  onDictionary: () => void;
  onBack: () => void;
}) {
  return (
    <ArcadePanel kicker="Mission Select" title={stage.title} className="text-center">
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
        {canGoBack ? "グループを えらびなおす" : "マップに もどる"}
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
}: {
  stage: WordStage;
  state: ArcadeState;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  store: ReturnType<typeof createProgressStore>;
  savedRef: React.RefObject<string | null>;
  onRetryWrong: (ids: readonly string[]) => void;
  onRetryAll: () => void;
  onBack: () => void;
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
      />
    </div>
  );
}
