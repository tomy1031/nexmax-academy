/**
 * リスニングの聞き取り判定（純関数）
 *
 * 旧アプリ（listening/soudan・listening/renraku）の移植。
 * 原典は **入力欄が1つ** で、そこに入れた言葉が
 *   ①キーワードか ②キーワードを含むか ③本文に出てくるか
 * を順に見て、点数を変えながら原稿の該当箇所を開いていく作りだった。
 * 「キーワード発見」と「原稿リベール」は別々の機能ではなく、
 * ひとつの入力に対する結果の大小でしかない。
 *
 * 旧実装は漢字用とひらがな用の配列を別々に持って分岐していたが、
 * ここは共有の正規化（normalize.ts）を1回通すだけで両方に当たる。
 */

import { normalizeReading } from "@/lib/text/normalize";

/** 判定の種類。点数と文言はここで決まる（原典の配点をそのまま使う）。 */
export type HitKind =
  /** キーワードそのもの（原稿の表記と一致）。 */
  | "keyword"
  /** キーワードの読み・別表記。 */
  | "hiragana"
  /** 複数のキーワードを含む言い方。 */
  | "contains"
  /** キーワードは含むが、本文にその言い方では出てこない。 */
  | "close"
  /** キーワードではないが本文に出てくる。 */
  | "partial"
  /** 短すぎて判定できない。 */
  | "tooShort"
  /** 本文に出てこない。 */
  | "miss";

/**
 * 長い言葉ほど点が高い。
 *
 * 1語ずつ拾うより、聞こえた**ひとかたまり**を書き取るほうが難しく、
 * 聞き取りの練習としても価値が高い。短い語の連打で稼げるままだと、
 * 学習者はいちばん楽な当て方に寄っていく。
 */
export function lengthBonus(text: string, rules: ListeningRules): number {
  const extra = normalizeReading(text).length - rules.minLength;
  return extra <= 0 ? 0 : Math.min(10, extra);
}

export const POINTS: Record<HitKind, number> = {
  keyword: 5,
  hiragana: 3,
  contains: 5, // 含まれていたキーワード1つにつき
  close: 0,
  partial: 2,
  tooShort: 0,
  miss: 0,
};

/** ミスできる回数の既定（教材ごとに変えられる — listeningSchema の check）。 */
export const MAX_MISS = 3;

/** 受けつける最小の文字数の既定。 */
export const MIN_LENGTH = 3;

/** 聞き取りチェックの設定（教材から渡す）。 */
export interface ListeningRules {
  /** ひらがなだけの入力を、何文字から受けつけるか。 */
  readonly minLength: number;
  readonly maxMiss: number;
}

export const DEFAULT_RULES: ListeningRules = { minLength: MIN_LENGTH, maxMiss: MAX_MISS };

export interface ListeningState {
  readonly transcript: string;
  readonly keywords: readonly string[];
  readonly rules: ListeningRules;
  /**
   * 隠せる文字の数（かな・漢字・数字）。表示率の分母。
   *
   * 以前は原稿の長さを分母にしていたので、句読点や空白は最初から見えている
   * ぶんだけ**何も当てていないのに 11% から始まっていた**。
   * 学習者から見ると「もう1割わかった」と嘘をつかれたことになる。
   */
  readonly hideableCount: number;
  /** 見つけたキーワード。 */
  readonly foundKeywords: readonly string[];
  /** 一度当てた入力（同じ語で二度稼げないようにする）。 */
  readonly usedInputs: readonly string[];
  readonly score: number;
  readonly kanjiHits: number;
  readonly hiraganaHits: number;
  readonly otherHits: number;
  readonly misses: number;
  /** 原稿の見えている文字の位置。 */
  readonly revealed: ReadonlySet<number>;
  /** 入力の履歴（新しい順に画面へ出す）。 */
  readonly log: readonly LogEntry[];
}

export interface LogEntry {
  readonly input: string;
  readonly kind: HitKind;
  readonly points: number;
  /** 見つかったキーワード（contains のときは複数）。 */
  readonly keywords: readonly string[];
}

export function createListening(
  transcript: string,
  keywords: readonly string[],
  rules: ListeningRules = DEFAULT_RULES,
): ListeningState {
  // 記号・空白は最初から見えている（形だけ分かると「発掘」しやすい）
  const revealed = new Set<number>();
  let hideableCount = 0;
  for (let i = 0; i < transcript.length; i += 1) {
    if (isHideable(transcript[i])) hideableCount += 1;
    else revealed.add(i);
  }
  return {
    transcript,
    keywords,
    rules,
    hideableCount,
    foundKeywords: [],
    usedInputs: [],
    score: 0,
    kanjiHits: 0,
    hiraganaHits: 0,
    otherHits: 0,
    misses: 0,
    revealed,
    log: [],
  };
}

/**
 * 入力を1つ受ける。原典の判定順をそのまま守る:
 *   1. キーワードそのもの → 5点（読み・別表記なら 3点）
 *   2. キーワードを含む言い方 → 含んだ数 × 5点。ただし本文に無ければ「おしい」
 *   3. 短すぎる入力 → ミス
 *   4. 本文に出てくる → 2点
 *   5. どれでもない → ミス
 * 当たった言葉は、その場で原稿の該当箇所を開く。
 */
export function submitListening(state: ListeningState, raw: string): ListeningState {
  const input = raw.trim();
  if (!input) return state;

  const needle = normalizeReading(input);
  if (!needle) return state;

  // 同じ入力で二度は稼げない
  if (state.usedInputs.includes(needle)) {
    return push(state, { input, kind: "miss", points: 0, keywords: [] }, { countMiss: false });
  }

  const remaining = state.keywords.filter((kw) => !state.foundKeywords.includes(kw));

  // 1. キーワードそのもの
  const exact = remaining.find((kw) => kw === input);
  const byReading = remaining.find((kw) => normalizeReading(kw) === needle);
  if (exact || byReading) {
    const hit = exact ?? byReading!;
    const kind: HitKind = exact ? "keyword" : "hiragana";
    return award(state, input, needle, kind, POINTS[kind] + lengthBonus(input, state.rules), [hit]);
  }

  // 2. キーワードを含む言い方
  const contained = remaining.filter((kw) => needle.includes(normalizeReading(kw)));
  if (contained.length > 0) {
    if (isInTranscript(state, needle)) {
      return award(
        state,
        input,
        needle,
        "contains",
        POINTS.contains * contained.length + lengthBonus(input, state.rules),
        contained,
      );
    }
    return push(state, { input, kind: "close", points: 0, keywords: contained });
  }

  // 3. 短すぎる入力（ひらがなだけなら minLength、漢字まじりはその1つ手前から）
  const allKana = /^[ぁ-ゖー0-9]+$/.test(needle);
  const floor = allKana ? state.rules.minLength : Math.max(1, state.rules.minLength - 1);
  if (needle.length < floor) {
    return push(state, { input, kind: "tooShort", points: 0, keywords: [] });
  }

  // 4. キーワードではないが本文に出てくる
  if (isInTranscript(state, needle)) {
    return award(
      state,
      input,
      needle,
      "partial",
      POINTS.partial + lengthBonus(input, state.rules),
      [],
    );
  }

  // 5. 該当なし
  return push(state, { input, kind: "miss", points: 0, keywords: [] });
}

function award(
  state: ListeningState,
  input: string,
  needle: string,
  kind: HitKind,
  points: number,
  keywords: readonly string[],
): ListeningState {
  // 当たった言葉と、そのキーワードの表記の両方で原稿を開く
  let revealed = state.revealed;
  for (const form of [input, ...keywords]) {
    revealed = revealWith(state.transcript, revealed, normalizeReading(form));
  }

  const next: ListeningState = {
    ...state,
    revealed,
    score: state.score + points,
    foundKeywords: [...state.foundKeywords, ...keywords],
    usedInputs: [...state.usedInputs, needle],
    kanjiHits: state.kanjiHits + (kind === "keyword" || kind === "contains" ? keywords.length : 0),
    hiraganaHits: state.hiraganaHits + (kind === "hiragana" ? 1 : 0),
    otherHits: state.otherHits + (kind === "partial" ? 1 : 0),
  };
  return push(next, { input, kind, points, keywords }, { countMiss: false });
}

function push(
  state: ListeningState,
  entry: LogEntry,
  { countMiss = true }: { countMiss?: boolean } = {},
): ListeningState {
  const isMiss = countMiss && (entry.kind === "miss" || entry.kind === "tooShort");
  return {
    ...state,
    misses: state.misses + (isMiss ? 1 : 0),
    log: [entry, ...state.log].slice(0, 8),
  };
}

/* ------------------------------------------------------------------ *
 * 原稿の開きぐあい
 * ------------------------------------------------------------------ */

/** 正規化した原稿の上で探し、元の位置へ戻して開く。 */
function revealWith(
  transcript: string,
  revealed: ReadonlySet<number>,
  needle: string,
): ReadonlySet<number> {
  if (!needle) return revealed;

  const map: number[] = [];
  let normalized = "";
  for (let i = 0; i < transcript.length; i += 1) {
    const piece = normalizeReading(transcript[i] ?? "");
    for (let k = 0; k < piece.length; k += 1) map.push(i);
    normalized += piece;
  }

  const next = new Set(revealed);
  let from = 0;
  for (;;) {
    const at = normalized.indexOf(needle, from);
    if (at < 0) break;
    for (let k = at; k < at + needle.length; k += 1) {
      const original = map[k];
      if (original !== undefined) next.add(original);
    }
    from = at + 1;
  }
  return next;
}

function isInTranscript(state: ListeningState, needle: string): boolean {
  return normalizeReading(state.transcript).includes(needle);
}

/**
 * 原稿の表示率（%）。答え合わせへ進めるかの判定に使う。
 *
 * **分母は「隠せる文字」だけ**。句読点や空白は最初から見えているので、
 * それを数に入れると何も当てていないのに 11% から始まる。
 */
export function revealRate(state: ListeningState): number {
  if (state.hideableCount === 0) return 100;
  let shown = 0;
  for (const index of state.revealed) {
    if (isHideable(state.transcript[index])) shown += 1;
  }
  return Math.round((shown / state.hideableCount) * 100);
}

/** 隠す対象の文字か（かな・漢字・数字）。 */
function isHideable(char: string | undefined): boolean {
  return char !== undefined && /[\p{Letter}\p{Number}]/u.test(char);
}

/**
 * 保存してある入力を順に流し込んで、続きから始められるようにする。
 *
 * 開いた場所そのもの（位置の集合）ではなく**入力した言葉**を保存する。
 * 位置は台本を1文字直すだけでずれるが、言葉なら意味が変わらない。
 */
export function replayListening(state: ListeningState, inputs: readonly string[]): ListeningState {
  let next = state;
  for (const input of inputs) next = submitListening(next, input);
  // やり直しの途中でついたミスは持ち越さない（前回の失敗を今日の回数に足さない）
  return { ...next, misses: 0, log: [] };
}

/** あと何こ見つければよいか。「のこり」を主役に出すために使う。 */
export function remainingKeywords(state: ListeningState): number {
  return state.keywords.length - state.foundKeywords.length;
}

/* ------------------------------------------------------------------ *
 * 何を 鳴らすか（音か 動画か）
 * ------------------------------------------------------------------ */

/**
 * その 教材が 鳴らす もの。
 *
 * ## なぜ 画面の 中で 分岐させないか
 * 判断そのものを **試せる ところに 置く** ため。画面（`playback-mode.tsx`）は
 * この 答えで 札を 選ぶだけに して、決まりは ここで 1回 書く。
 * 単体テストは DOM を 持たない（`vitest.config.ts` の environment は node）ので、
 * JSX の 中に 埋めると **この 分岐だけ 誰も 確かめられなく なる**。
 *
 * ## 2つ 以上 来たら 動画 → YouTube → 音 の 順
 * 2つ 置くのは スキーマが 止める（`listeningSchema` の検査）。それでも 来たら
 * どれかを 出す——**画面が 落ちない** ほうへ 倒す（合流は git ∪ DB で、
 * DB側は 古いスキーマの ままでも 読める）。
 */
export function mediaKind(listening: {
  audioUrl?: string;
  videoUrl?: string;
  youtube?: string;
}): "video" | "youtube" | "audio" | "none" {
  if (listening.videoUrl) return "video";
  if (listening.youtube) return "youtube";
  if (listening.audioUrl) return "audio";
  return "none";
}
