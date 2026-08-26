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

/**
 * 4択の基準持ち時間。難しさの time を掛ける（旧 mcqLimit の 9000ms）。
 *
 * 読みのフェーズに秒数は無い。用語がカメラに届いた時が時間切れで、
 * それは3Dの世界が距離と速さから決める（旧 gameLoop の `enemyZ > 30`）。
 */
export const BASE_CHOICE_SECONDS = 9;

export const START_LIFE = 5;

export interface ArcadeQuestion {
  readonly word: Word;
  readonly choices: readonly string[];
}

export type ArcadePhase =
  | { readonly kind: "reading" }
  /** readingOk が null のときは読みを聞いていない（問題だけモード）。 */
  | { readonly kind: "meaning"; readonly readingOk: boolean | null }
  /**
   * 解説。**当たったか**と **何を えらんだか**を 持つ。
   *
   * 前は `feedback` だけを 持って いたので、画面は「⭕か ✕か」を
   * 文言の ちがい（🎉 / 💪）でしか 出せず、外しても 当たっても 同じ 形の
   * カードが 出て いた。学習者から「誤った語を 入れても 正解に なる」と
   * 見えたのは これ（点の 数え方は 前から 正しい）。2026-08-26。
   */
  | {
      readonly kind: "explain";
      readonly feedback: FeedbackKey;
      readonly ok: boolean;
      /** 4択で 押した 札。時間切れ・読みだけの ときは null。 */
      readonly chosen: string | null;
    }
  | { readonly kind: "finished"; readonly reason: "cleared" | "lifeOut" | "quit" };

/**
 * 直前に 起きた ことの しるし（画面の 手ごたえ専用。点には 関わらない）。
 *
 * `seq` は **同じ ことが つづいても 演出を 出し直す**ための 番号。
 * これが 無いと 2回 つづけて 外したとき、2回目の 揺れが 出ない。
 */
export type FlashKind = "hit" | "miss" | "timeup";

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
  /** 直前の 手ごたえ（⭕／✕／時間切れ）。次の 問題に 進むと 消える。 */
  readonly flash: FlashKind | null;
  /** 手ごたえの 通し番号（同じ しるしが つづいても 演出を 出し直す）。 */
  readonly flashSeq: number;
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
    flash: null,
    flashSeq: 0,
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
        : onReadingMissed(state, "reading.retry", "miss");
    }

    case "readingTimeout":
      if (state.phase.kind !== "reading") return state;
      return onReadingMissed(state, "reading.timeup", "timeup");

    case "chooseMeaning": {
      if (state.phase.kind !== "meaning") return state;
      const word = currentWord(state);
      if (!word) return state;
      const correct = action.choice === word.meaningEn;
      return closeQuestion(state, state.phase.readingOk, correct, action.choice);
    }

    case "meaningTimeout":
      if (state.phase.kind !== "meaning") return state;
      return closeQuestion(state, state.phase.readingOk, false, null, true);

    case "advance": {
      if (state.phase.kind !== "explain") return state;
      if (state.mode === "practice" && state.life <= 0) {
        return { ...state, phase: { kind: "finished", reason: "lifeOut" } };
      }
      const next = state.index + 1;
      if (next >= state.questions.length) {
        return { ...state, phase: { kind: "finished", reason: "cleared" } };
      }
      return { ...state, index: next, phase: startPhase(state.mode), hint: null, flash: null };
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
    ...flashOf(state, "hit"),
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    score: state.score + gain,
    lastGain: gain,
    phase: { kind: "meaning", readingOk: true },
  };
}

function onReadingMissed(state: ArcadeState, feedback: FeedbackKey, flash: FlashKind): ArcadeState {
  return {
    ...state,
    // 意味フェーズの間、正しい読みと一緒に励ましを出しておく。
    hint: feedback,
    ...flashOf(state, flash),
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
  chosen: string | null = null,
  timeup = false,
): ArcadeState {
  const word = currentWord(state);
  if (!word) return state;

  const combo = meaningOk ? state.combo + 1 : 0;
  const gain = meaningOk && state.mode === "practice" ? meaningGain(combo) : 0;
  return {
    ...state,
    hint: null,
    ...flashOf(state, meaningOk ? "hit" : timeup ? "timeup" : "miss"),
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    score: state.score + gain,
    lastGain: gain,
    life: !meaningOk && state.mode === "practice" ? state.life - 1 : state.life,
    outcomes: [...state.outcomes, { wordId: word.id, readingOk, meaningOk }],
    phase: {
      kind: "explain",
      feedback: meaningOk ? "meaning.correct" : timeup ? "meaning.timeup" : "meaning.retry",
      ok: meaningOk,
      chosen,
    },
  };
}

/** 手ごたえの しるしを 1つ 進める（番号を 足すので 同じ しるしでも 出し直せる）。 */
function flashOf(state: ArcadeState, flash: FlashKind): { flash: FlashKind; flashSeq: number } {
  return { flash, flashSeq: state.flashSeq + 1 };
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

/**
 * 景色の流れと用語の近づく速さ（旧 currentSpeed）。
 * テストはゆっくり一定、れんしゅうは速め。難易度で倍率をかける。
 */
export function sceneSpeed(mode: ArcadeMode, difficulty: Difficulty): number {
  const base = mode === "test" ? 0.45 : 0.7;
  return base * DIFFICULTY[difficulty].speed;
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
  /** 合格に 要る 点（切り上げ）。**画面に そのまま 出す**ので ここで 決める。 */
  readonly needed: number;
  /** 合格ライン（％）。ステージの 設定を そのまま 持ち歩く。 */
  readonly passRate: number;
  /**
   * さいごまで やったか。**合否を 出して よいのは これが true の ときだけ**。
   *
   * 途中で「やめる」を 押しても、答えた ぶんだけで 割合を 出すと
   * 「3問 やって ぜんぶ 当たった＝合格」に なって しまう。それは 合格では ない。
   */
  readonly completed: boolean;
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
  /*
   * 合格ラインを **点で** 出す。前は 割合だけを 持って いたので、画面には
   * 「80%」としか 出せず、あと 何問 当てれば よいのかが 分からなかった
   *（2026-08-26 の 指摘「OKかNGが わからないのは ストレス」）。
   */
  const needed = Math.ceil((maxScore * state.passRate) / 100);
  const completed = total > 0 && total === state.questions.length;
  const passed = completed && score >= needed;
  const missedWordIds = state.outcomes
    .filter((o) => o.readingOk === false || !o.meaningOk)
    .map((o) => o.wordId);

  return {
    total,
    readingCorrect,
    meaningCorrect,
    score,
    maxScore,
    needed,
    passRate: state.passRate,
    completed,
    passed,
    missedWordIds,
  };
}
