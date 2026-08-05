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

export const POINTS: Record<HitKind, number> = {
  keyword: 5,
  hiragana: 3,
  contains: 5, // 含まれていたキーワード1つにつき
  close: 0,
  partial: 2,
  tooShort: 0,
  miss: 0,
};

/** ミスできる回数（原典と同じ3回）。 */
export const MAX_MISS = 3;

export interface ListeningState {
  readonly transcript: string;
  readonly keywords: readonly string[];
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

export function createListening(transcript: string, keywords: readonly string[]): ListeningState {
  // 記号・空白は最初から見えている（形だけ分かると「発掘」しやすい）
  const revealed = new Set<number>();
  for (let i = 0; i < transcript.length; i += 1) {
    if (!/[\p{Letter}\p{Number}]/u.test(transcript[i] ?? "")) revealed.add(i);
  }
  return {
    transcript,
    keywords,
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
    return award(state, input, needle, kind, POINTS[kind], [hit]);
  }

  // 2. キーワードを含む言い方
  const contained = remaining.filter((kw) => needle.includes(normalizeReading(kw)));
  if (contained.length > 0) {
    if (isInTranscript(state, needle)) {
      return award(state, input, needle, "contains", POINTS.contains * contained.length, contained);
    }
    return push(state, { input, kind: "close", points: 0, keywords: contained });
  }

  // 3. 短すぎる入力（ひらがなだけなら3文字、それ以外は2文字から）
  const allKana = /^[ぁ-ゖー0-9]+$/.test(needle);
  if ((allKana && needle.length < 3) || (!allKana && needle.length < 2)) {
    return push(state, { input, kind: "tooShort", points: 0, keywords: [] });
  }

  // 4. キーワードではないが本文に出てくる
  if (isInTranscript(state, needle)) {
    return award(state, input, needle, "partial", POINTS.partial, []);
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

/** 原稿の表示率（%）。クリア条件の判定に使う。 */
export function revealRate(state: ListeningState): number {
  if (state.transcript.length === 0) return 100;
  return Math.round((state.revealed.size / state.transcript.length) * 100);
}

/** あと何こ見つければよいか。「のこり」を主役に出すために使う。 */
export function remainingKeywords(state: ListeningState): number {
  return state.keywords.length - state.foundKeywords.length;
}
