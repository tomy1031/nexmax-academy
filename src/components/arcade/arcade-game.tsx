"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { Word, WordStage } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { NekuMax } from "@/components/nekumax";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { isHiraganaInputReady } from "@/lib/text/normalize";
import { createProgressStore, subscribeProgress } from "@/lib/progress/store";
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
import { ApproachField } from "./approach-field";
import { ArcadeResult } from "./arcade-result";
import { FlashcardDeck } from "./flashcard-deck";
import { MeaningChoice } from "./meaning-choice";
import { ReadingInput } from "./reading-input";
import { WordDictionary } from "./word-dictionary";
import { fieldForIndex } from "./scheduler";
import { useCountdown } from "./use-countdown";

/**
 * ことばアーケード（旧 wordtest / DATA DIVE）の画面シェル。
 *
 * 中心体験は変えない: 用語が迫ってくる → 読みをひらがなで入力して止める →
 * 英語の意味を選ぶ → 結果で弱点が分かる → まちがえた ことばだけ もう一度。
 */

type Screen =
  | { kind: "menu" }
  | { kind: "hiraCheck"; mode: ArcadeMode }
  | { kind: "play" }
  | { kind: "result" }
  | { kind: "flashcard" }
  | { kind: "dictionary" };

/** 解説の自動送り（クリック・Enterで早送りできる）。 */
const EXPLAIN_MS = 2800;

export function ArcadeGame({ stage }: { stage: WordStage }) {
  const store = useMemo(() => createProgressStore(), []);
  const furigana = useMemo(() => buildFuriganaIndex(stage.furigana ?? []), [stage.furigana]);

  const needsPassword = Boolean(stage.password);
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [session, setSession] = useState<ArcadeState | null>(null);
  const savedRef = useRef<string | null>(null);

  // 解錠状態は外部ストア（localStorage）として購読する。
  // サーバ描画では未解錠として返し、マウント後に本当の値へ切り替わる。
  const unlocked = useSyncExternalStore(
    subscribeProgress,
    () => !needsPassword || store.isUnlocked(stage.id),
    () => !needsPassword,
  );

  // 遷移は純関数の reducer に任せ、ここは保持だけを受け持つ。
  const dispatch = useCallback((action: ArcadeAction) => {
    setSession((prev) => (prev ? arcadeReducer(prev, action) : prev));
  }, []);

  const start = useCallback(
    (mode: ArcadeMode, onlyWordIds?: readonly string[]) => {
      // 苦手な語を先に出すため、開始のたびに最新の学習履歴を読む。
      const mastery = store.readMastery(stage.id);
      setSession(createSession({ stage, mode, difficulty, mastery, onlyWordIds }));
      savedRef.current = null;
      setScreen({ kind: "play" });
    },
    [stage, difficulty, store],
  );

  return (
    <ArcadeShell stage={stage}>
      {screen.kind === "menu" && (
        <ArcadeMenu
          stage={stage}
          furigana={furigana}
          unlocked={unlocked}
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          onUnlock={() => store.unlock(stage.id)}
          onPlay={(mode) =>
            mode === "test" ? setScreen({ kind: "hiraCheck", mode }) : start(mode)
          }
          onFlashcard={() => setScreen({ kind: "flashcard" })}
          onDictionary={() => setScreen({ kind: "dictionary" })}
        />
      )}

      {screen.kind === "hiraCheck" && (
        <HiraganaCheck
          onReady={() => start(screen.mode)}
          onCancel={() => setScreen({ kind: "menu" })}
        />
      )}

      {screen.kind === "play" && session && (
        <PlayScreen
          state={session}
          furigana={furigana}
          dispatch={dispatch}
          onFinished={() => setScreen({ kind: "result" })}
        />
      )}

      {screen.kind === "result" && session && (
        <ResultScreen
          stage={stage}
          state={session}
          furigana={furigana}
          store={store}
          savedRef={savedRef}
          onRetryWrong={(ids) => start(session.mode, ids)}
          onRetryAll={() => start(session.mode)}
          onBack={() => setScreen({ kind: "menu" })}
        />
      )}

      {screen.kind === "flashcard" && (
        <FlashcardDeck
          words={stage.words}
          furigana={furigana}
          onBack={() => setScreen({ kind: "menu" })}
        />
      )}

      {screen.kind === "dictionary" && (
        <WordDictionary
          words={stage.words}
          furigana={furigana}
          onBack={() => setScreen({ kind: "menu" })}
        />
      )}
    </ArcadeShell>
  );
}

/* ------------------------------------------------------------------ *
 * 外枠
 * ------------------------------------------------------------------ */

function ArcadeShell({ stage, children }: { stage: WordStage; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← まなびマップ
        </Link>
        <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
          🕹️ ことばアーケード ／ {stage.title}
        </span>
      </header>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * メニュー（モード・難しさ・パスワード）
 * ------------------------------------------------------------------ */

const MODE_CARDS: {
  mode: ArcadeMode;
  title: string;
  sub: string;
  face: string;
  shadow: string;
}[] = [
  {
    mode: "practice",
    title: "れんしゅう",
    sub: "たのしく おぼえる",
    face: "#3aa458",
    shadow: "#2c7f44",
  },
  { mode: "test", title: "テスト", sub: "点数を 見る", face: "#f2654a", shadow: "#c94d36" },
  {
    mode: "quiz",
    title: "もんだいだけ",
    sub: "入力なしで 意味クイズ",
    face: "#8d6ae8",
    shadow: "#7452cc",
  },
];

function ArcadeMenu({
  stage,
  furigana,
  unlocked,
  difficulty,
  onDifficulty,
  onUnlock,
  onPlay,
  onFlashcard,
  onDictionary,
}: {
  stage: WordStage;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  unlocked: boolean;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  onUnlock: () => void;
  onPlay: (mode: ArcadeMode) => void;
  onFlashcard: () => void;
  onDictionary: () => void;
}) {
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);

  if (!unlocked) {
    return (
      <div className="card-pop mx-auto max-w-md p-6 text-center sm:p-8">
        <NekuMax variant="guide" size={92} className="mx-auto" bob />
        <div className="mt-4">
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
          className="border-hairline bg-panel text-ink mt-4 w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-center text-xl font-extrabold"
        />
        {wrong && (
          <div className="mt-3">
            <FeedbackMessage messageKey="stage.passwordRetry" />
          </div>
        )}
        <button
          type="button"
          onClick={() => (password === stage.password ? onUnlock() : setWrong(true))}
          className="btn-game mt-4 w-full px-6 py-3 text-lg"
        >
          ひらく
        </button>
      </div>
    );
  }

  return (
    <div className="card-pop p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <NekuMax variant="book" size={88} bob />
        <div className="flex-1">
          <h1 className="text-ink text-2xl font-extrabold sm:text-3xl">{stage.title}</h1>
          <p className="text-ink-soft mt-1 font-bold">
            <RubyText text={stage.description} index={furigana} />
          </p>
          <p className="text-ink-faint mt-1 text-sm font-bold">
            ことば {stage.words.length}こ ／ 1回の もんだい {stage.questionCount}こ ／ 合格{" "}
            {stage.passRate}%
          </p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-ink-soft mb-2 text-sm font-extrabold">
          むずかしさ（スピードと 時間だけが かわるよ）
        </h2>
        <div className="flex gap-2">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onDifficulty(key)}
              aria-pressed={difficulty === key}
              className={`rounded-full border-2 px-4 py-2 text-sm font-extrabold transition ${
                difficulty === key
                  ? "bg-sky border-sky text-white"
                  : "border-hairline bg-panel text-ink-soft"
              }`}
            >
              {DIFFICULTY[key].label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {MODE_CARDS.map((card) => (
          <button
            key={card.mode}
            type="button"
            onClick={() => onPlay(card.mode)}
            className="btn-game flex-col px-4 py-5 text-lg"
            style={{ "--btn-face": card.face, "--btn-shadow": card.shadow } as React.CSSProperties}
          >
            <span>{card.title}</span>
            <span className="text-xs font-bold opacity-90">{card.sub}</span>
          </button>
        ))}
      </section>

      <section className="mt-3 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onFlashcard}
          className="btn-game px-4 py-4"
          style={{ "--btn-face": "#0288d1", "--btn-shadow": "#0272ae" } as React.CSSProperties}
        >
          フラッシュカード
        </button>
        <button
          type="button"
          onClick={onDictionary}
          className="btn-game px-4 py-4"
          style={{ "--btn-face": "#f0a819", "--btn-shadow": "#c8890f" } as React.CSSProperties}
        >
          辞書
        </button>
      </section>
    </div>
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
    <div className="card-pop mx-auto max-w-lg p-6 text-center sm:p-8">
      <h2 className="text-ink text-2xl font-extrabold">ひらがな入力チェック</h2>
      <p className="text-ink-soft mt-1 font-bold">つぎの ことばを 入力してください。</p>
      <p className="text-navy mt-4 text-4xl font-extrabold">{target}</p>
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
        className="border-hairline bg-panel text-ink mt-4 w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-center text-2xl font-extrabold"
      />
      {miss && (
        <div className="mt-3 text-left">
          <FeedbackMessage messageKey="reading.needHiragana" />
        </div>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={submit} className="btn-game px-8 py-3 text-lg">
          けってい
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-game px-6 py-3"
          style={{ "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties}
        >
          <span className="text-ink">やめる</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * プレイ
 * ------------------------------------------------------------------ */

function PlayScreen({
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

  // 解説は自動で消える。クリック／Enterで早送りできる。
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

  if (!question) return null;
  const { word, choices } = question;
  const field = fieldForIndex(state.fieldSequence, state.index, state.questions.length);

  return (
    <div className="flex flex-col gap-4">
      <Hud state={state} />

      <ApproachField
        term={word.term}
        reading={word.reading}
        showFurigana={state.furiganaOn}
        remaining={readingLeft}
        field={field}
        frozen={phase.kind !== "reading"}
      />

      {phase.kind === "reading" && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-ink font-extrabold">
            よみを ひらがなで 入力して、<span className="text-sky">Enter</span>！
          </p>
          {state.hint && <FeedbackMessage messageKey={state.hint} className="w-full max-w-2xl" />}
          <ReadingInput
            key={resetKey}
            onSubmit={(input) => dispatch({ type: "submitReading", input })}
          />
        </div>
      )}

      {phase.kind === "meaning" && (
        <div className="flex flex-col items-center gap-3">
          {phase.readingOk === false && (
            <div className="w-full max-w-3xl">
              <p className="text-ink mb-2 text-center font-extrabold">
                よみ: <span className="text-sky">{word.reading}</span>
              </p>
              {state.hint && <FeedbackMessage messageKey={state.hint} />}
            </div>
          )}
          <p className="text-ink font-extrabold">英語の 意味を えらぼう！</p>
          <MeaningChoice
            choices={choices}
            remaining={meaningLeft}
            onChoose={(choice) => dispatch({ type: "chooseMeaning", choice })}
          />
        </div>
      )}

      {phase.kind === "explain" && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => dispatch({ type: "advance" })}
          className="card-pop w-full p-5 text-left"
        >
          <FeedbackMessage messageKey={phase.feedback} />
          <p className="text-ink mt-3 text-lg font-extrabold">
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
          <p className="text-ink-faint mt-3 text-xs font-bold">（おす／Enter で つぎへ）</p>
        </motion.button>
      )}

      <div className="flex justify-center gap-2">
        {state.mode !== "test" && (
          <button
            type="button"
            onClick={() => dispatch({ type: "toggleFurigana" })}
            className="btn-game px-4 py-2 text-sm"
            style={
              {
                "--btn-face": state.furiganaOn ? "#0288d1" : "#ffffff",
                "--btn-shadow": state.furiganaOn ? "#0272ae" : "#cfe6f3",
                color: state.furiganaOn ? undefined : "var(--color-ink)",
              } as React.CSSProperties
            }
          >
            ふりがな {state.furiganaOn ? "ON" : "OFF"}
          </button>
        )}
        <button
          type="button"
          onClick={() => dispatch({ type: "quit" })}
          className="btn-game px-4 py-2 text-sm"
          style={{ "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties}
        >
          <span className="text-ink">やめる</span>
        </button>
      </div>
    </div>
  );
}

function Hud({ state }: { state: ArcadeState }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="border-hairline bg-panel text-ink rounded-full border-2 px-3 py-1 text-sm font-extrabold">
        もんだい {Math.min(state.index + 1, state.questions.length)} / {state.questions.length}
      </span>
      <div className="flex items-center gap-2">
        {state.mode === "practice" && (
          <>
            <span className="border-hairline bg-panel rounded-full border-2 px-3 py-1 text-sm font-extrabold">
              <span className="text-ink-soft">Score </span>
              <span className="text-navy">{state.score}</span>
            </span>
            <span
              className="border-hairline bg-panel rounded-full border-2 px-3 py-1 text-sm"
              aria-label={`のこり ライフ ${state.life}`}
            >
              {"❤️".repeat(Math.max(0, state.life))}
              {"🤍".repeat(Math.max(0, START_LIFE - Math.max(0, state.life)))}
            </span>
            {state.combo >= 2 && (
              <span className="bg-sun text-ink rounded-full px-3 py-1 text-sm font-extrabold">
                {state.combo} れんぞく！
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * けっか
 * ------------------------------------------------------------------ */

function ResultScreen({
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

  // 結果は1回だけ保存する（再描画で二重計上しない）
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
  );
}
