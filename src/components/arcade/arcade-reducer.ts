/**
 * ことばアーケードの状態機械（純関数）
 *
 * 旧アプリは `var STATE = "TITLE"` を含む十数個のグローバル変数で進行を管理していたため、
 * 遷移を追うのが難しく、モードを足すたびに回帰が出ていた。ここでは状態と遷移を
 * 判別可能ユニオン＋reducer に閉じ込め、単体テストで遷移を固定する。
 *
 * 守る中心体験（旧 wordtest_revice.md §26）:
 *   用語が迫ってくる → 読みをひらがな入力で止める → 英語の意味を選ぶ
 *   → 結果で弱点が分かる → まちがえた言葉だけ もう一度
 */

import type { Word, WordStage } from "@/content/schema";
import type { FeedbackKey } from "@/lib/feedback";
import { INPUT_ISSUE_FEEDBACK } from "@/lib/feedback";
import { inspectReadingInput, readingMatches } from "@/lib/text/normalize";
import { buildChoices, selectWords, type Rng } from "./scheduler";
import type { MasteryMap } from "@/lib/progress/store";

/** 遊び方。辞書・フラッシュカードはゲーム進行を持たないので別画面。 */
export type ArcadeMode = "practice" | "test" | "quiz";

export type Difficulty = "easy" | "normal" | "hard";

/**
 * 難しさは「速度」と「時間」だけで変える。問題数は減らさない
 *（理解設計ガイド: 難易度の実装は速度と時間）。
 */
export const DIFFICULTY: Record<Difficulty, { speed: number; time: number; label: string }> = {
  easy: { speed: 0.5, time: 2, label: "かんたん" },
  normal: { speed: 0.75, time: 1.5, label: "ふつう" },
  hard: { speed: 1, time: 1, label: "むずかしい" },
};

/** 既定は遅め（理解設計ガイド P10）。 */
export const DEFAULT_DIFFICULTY: Difficulty = "easy";

/** 用語が奥から目の前に届くまでの基準秒数。難しさの speed で割る。 */
export const BASE_APPROACH_SECONDS = 9;
/** 4択の基準持ち時間。難しさの time を掛ける。 */
export const BASE_CHOICE_SECONDS = 8;

export const START_LIFE = 5;

export interface ArcadeQuestion {
  readonly word: Word;
  readonly choices: readonly string[];
}

export type ArcadePhase =
  | { readonly kind: "reading" }
  /** readingOk が null のときは読みを聞いていない（問題だけモード）。 */
  | { readonly kind: "meaning"; readonly readingOk: boolean | null }
  | { readonly kind: "explain"; readonly feedback: FeedbackKey }
  | { readonly kind: "finished"; readonly reason: "cleared" | "lifeOut" | "quit" };

export interface WordOutcome {
  readonly wordId: string;
  /** null は「読みを聞いていない」。 */
  readonly readingOk: boolean | null;
  readonly meaningOk: boolean;
}

export interface ArcadeState {
  readonly stageId: string;
  readonly mode: ArcadeMode;
  readonly difficulty: Difficulty;
  readonly passRate: number;
  readonly fieldSequence: readonly string[];
  readonly questions: readonly ArcadeQuestion[];
  readonly index: number;
  readonly phase: ArcadePhase;
  readonly outcomes: readonly WordOutcome[];
  readonly life: number;
  readonly score: number;
  /** 直前に入った点。「+150」のポップを出すために持つ（0なら出さない）。 */
  readonly lastGain: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly furiganaOn: boolean;
  /** 入力の見守り（答えを消費しない注意）。 */
  readonly hint: FeedbackKey | null;
}

export type ArcadeAction =
  | { readonly type: "submitReading"; readonly input: string }
  | { readonly type: "readingTimeout" }
  | { readonly type: "chooseMeaning"; readonly choice: string }
  | { readonly type: "meaningTimeout" }
  | { readonly type: "advance" }
  | { readonly type: "toggleFurigana" }
  | { readonly type: "quit" };

/* ------------------------------------------------------------------ *
 * セッションを組み立てる
 * ------------------------------------------------------------------ */

export function createSession({
  stage,
  mode,
  difficulty = DEFAULT_DIFFICULTY,
  mastery = {},
  rng = Math.random,
  now = Date.now(),
  /** 「まちがえた言葉だけ」のとき、対象語を明示的に渡す。 */
  onlyWordIds,
}: {
  stage: WordStage;
  mode: ArcadeMode;
  difficulty?: Difficulty;
  mastery?: MasteryMap;
  rng?: Rng;
  now?: number;
  onlyWordIds?: readonly string[];
}): ArcadeState {
  const pool = onlyWordIds
    ? stage.words.filter((w) => onlyWordIds.includes(w.id))
    : (stage.words as readonly Word[]);
  const count = onlyWordIds ? pool.length : Math.min(stage.questionCount, pool.length);
  const words = selectWords({ words: pool, count, mastery, rng, now });
  const questions = words.map((word) => ({ word, choices: buildChoices(word, rng) }));

  return {
    stageId: stage.id,
    mode,
    difficulty,
    passRate: stage.passRate,
    fieldSequence: stage.fieldSequence,
    questions,
    index: 0,
    phase: questions.length === 0 ? { kind: "finished", reason: "cleared" } : startPhase(mode),
    outcomes: [],
    life: START_LIFE,
    score: 0,
    lastGain: 0,
    combo: 0,
    bestCombo: 0,
    furiganaOn: mode !== "test",
    hint: null,
  };
}

function startPhase(mode: ArcadeMode): ArcadePhase {
  return mode === "quiz" ? { kind: "meaning", readingOk: null } : { kind: "reading" };
}

/* ------------------------------------------------------------------ *
 * 遷移
 * ------------------------------------------------------------------ */

/**
 * 得点は旧アプリの式をそのまま使う（読み 100+（コンボ-1）×50 ／ 意味 200+コンボ×100）。
 * 数字の伸び方が手ごたえそのものなので、勝手に変えない。
 */
export function readingGain(comboAfterHit: number): number {
  return 100 + (comboAfterHit - 1) * 50;
}

export function meaningGain(comboAfterHit: number): number {
  return 200 + comboAfterHit * 100;
}

export function arcadeReducer(state: ArcadeState, action: ArcadeAction): ArcadeState {
  if (state.phase.kind === "finished" && action.type !== "toggleFurigana") return state;

  switch (action.type) {
    case "toggleFurigana":
      return { ...state, furiganaOn: !state.furiganaOn };

    case "quit":
      return { ...state, phase: { kind: "finished", reason: "quit" } };

    case "submitReading": {
      if (state.phase.kind !== "reading") return state;
      const word = currentWord(state);
      if (!word) return state;

      // 漢字・英字が混ざった入力は「答え」ではなく操作の迷い。回答として消費しない。
      const issue = inspectReadingInput(action.input);
      if (issue === "kanji" || issue === "latin") {
        return { ...state, hint: INPUT_ISSUE_FEEDBACK[issue] };
      }
      if (!action.input.trim()) return state;

      return readingMatches(action.input, word.reading)
        ? onReadingCorrect(state)
        : onReadingMissed(state, "reading.retry");
    }

    case "readingTimeout":
      if (state.phase.kind !== "reading") return state;
      return onReadingMissed(state, "reading.timeup");

    case "chooseMeaning": {
      if (state.phase.kind !== "meaning") return state;
      const word = currentWord(state);
      if (!word) return state;
      const correct = action.choice === word.meaningEn;
      return closeQuestion(state, state.phase.readingOk, correct);
    }

    case "meaningTimeout":
      if (state.phase.kind !== "meaning") return state;
      return closeQuestion(state, state.phase.readingOk, false);

    case "advance": {
      if (state.phase.kind !== "explain") return state;
      if (state.mode === "practice" && state.life <= 0) {
        return { ...state, phase: { kind: "finished", reason: "lifeOut" } };
      }
      const next = state.index + 1;
      if (next >= state.questions.length) {
        return { ...state, phase: { kind: "finished", reason: "cleared" } };
      }
      return { ...state, index: next, phase: startPhase(state.mode), hint: null };
    }

    default:
      return state;
  }
}

function onReadingCorrect(state: ArcadeState): ArcadeState {
  const combo = state.combo + 1;
  // 点が入るのは れんしゅう のときだけ（テストは成績で見る）
  const gain = state.mode === "practice" ? readingGain(combo) : 0;
  return {
    ...state,
    hint: null,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    score: state.score + gain,
    lastGain: gain,
    phase: { kind: "meaning", readingOk: true },
  };
}

function onReadingMissed(state: ArcadeState, feedback: FeedbackKey): ArcadeState {
  return {
    ...state,
    // 意味フェーズの間、正しい読みと一緒に励ましを出しておく。
    hint: feedback,
    combo: 0,
    lastGain: 0,
    life: state.mode === "practice" ? state.life - 1 : state.life,
    // 読みを外しても意味は必ず学ぶ。ここで打ち切らない。
    phase: { kind: "meaning", readingOk: false },
  };
}

function closeQuestion(
  state: ArcadeState,
  readingOk: boolean | null,
  meaningOk: boolean,
): ArcadeState {
  const word = currentWord(state);
  if (!word) return state;

  const combo = meaningOk ? state.combo + 1 : 0;
  const gain = meaningOk && state.mode === "practice" ? meaningGain(combo) : 0;
  return {
    ...state,
    hint: null,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    score: state.score + gain,
    lastGain: gain,
    life: !meaningOk && state.mode === "practice" ? state.life - 1 : state.life,
    outcomes: [...state.outcomes, { wordId: word.id, readingOk, meaningOk }],
    phase: { kind: "explain", feedback: meaningOk ? "meaning.correct" : "meaning.retry" },
  };
}

/* ------------------------------------------------------------------ *
 * 参照
 * ------------------------------------------------------------------ */

export function currentQuestion(state: ArcadeState): ArcadeQuestion | null {
  return state.questions[state.index] ?? null;
}

export function currentWord(state: ArcadeState): Word | null {
  return currentQuestion(state)?.word ?? null;
}

/** 用語が目の前に届くまでの秒数。 */
export function approachSeconds(difficulty: Difficulty): number {
  return BASE_APPROACH_SECONDS / DIFFICULTY[difficulty].speed;
}

/** 4択の持ち時間。 */
export function choiceSeconds(difficulty: Difficulty): number {
  return BASE_CHOICE_SECONDS * DIFFICULTY[difficulty].time;
}

export interface ArcadeSummary {
  readonly total: number;
  readonly readingCorrect: number;
  readonly meaningCorrect: number;
  /** 読み1点＋意味1点。 */
  readonly score: number;
  readonly maxScore: number;
  readonly passed: boolean;
  readonly missedWordIds: readonly string[];
}

/**
 * 成績のまとめ。ゲームスコア（state.score）とは別物で、
 * こちらだけが合否になる（P11: テスト評価とゲームスコアの分離）。
 */
export function summarize(state: ArcadeState): ArcadeSummary {
  const total = state.outcomes.length;
  const readingAsked = state.outcomes.filter((o) => o.readingOk !== null).length;
  const readingCorrect = state.outcomes.filter((o) => o.readingOk === true).length;
  const meaningCorrect = state.outcomes.filter((o) => o.meaningOk).length;
  const score = readingCorrect + meaningCorrect;
  const maxScore = readingAsked + total;
  const passed = maxScore > 0 && (score / maxScore) * 100 >= state.passRate;
  const missedWordIds = state.outcomes
    .filter((o) => o.readingOk === false || !o.meaningOk)
    .map((o) => o.wordId);

  return { total, readingCorrect, meaningCorrect, score, maxScore, passed, missedWordIds };
}
