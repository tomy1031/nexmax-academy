/**
 * リスニング中の単語チェック（純関数）
 *
 * 旧アプリの2つのしくみを移植する:
 *   キーワード発見     … 聞こえた言葉を入れると見つかる（listening/renraku）
 *   隠し原稿リベール   … 入れた言葉の場所が原稿に浮かび上がる（listening/soudan）
 *
 * 旧実装は「漢字用の配列」と「ひらがな用の配列」を別々に持ち、入力がどちらの
 * 表記かで分岐していた。ここでは共有の正規化を1回通すだけで両方に当たる。
 */

import { normalizeReading } from "@/lib/text/normalize";

/* ------------------------------------------------------------------ *
 * キーワード発見
 * ------------------------------------------------------------------ */

export interface KeywordHuntState {
  /** まだ見つかっていない言葉。 */
  readonly remaining: readonly string[];
  /** 見つけた言葉（見つけた順）。 */
  readonly found: readonly string[];
  readonly score: number;
}

export const POINTS_PER_KEYWORD = 5;

export function createKeywordHunt(keywords: readonly string[]): KeywordHuntState {
  return { remaining: keywords, found: [], score: 0 };
}

export interface KeywordHuntResult {
  readonly state: KeywordHuntState;
  /** 今回見つけた言葉（なければ null）。 */
  readonly hit: string | null;
  /** すでに見つけていた言葉をもう一度入れた。 */
  readonly duplicate: boolean;
}

/**
 * 入力を1つ受ける。表記が違っても（漢字/ひらがな/カタカナ/全角）同じ言葉に当たる。
 */
export function submitKeyword(state: KeywordHuntState, input: string): KeywordHuntResult {
  const needle = normalizeReading(input);
  if (!needle) return { state, hit: null, duplicate: false };

  const hit = state.remaining.find((kw) => normalizeReading(kw) === needle);
  if (!hit) {
    const duplicate = state.found.some((kw) => normalizeReading(kw) === needle);
    return { state, hit: null, duplicate };
  }

  return {
    state: {
      remaining: state.remaining.filter((kw) => kw !== hit),
      found: [...state.found, hit],
      score: state.score + POINTS_PER_KEYWORD,
    },
    hit,
    duplicate: false,
  };
}

/* ------------------------------------------------------------------ *
 * 隠し原稿リベール
 * ------------------------------------------------------------------ */

export interface RevealState {
  /** 原稿の全文（改行なしで連結したもの）。 */
  readonly transcript: string;
  /** 見えている文字の位置。 */
  readonly revealed: ReadonlySet<number>;
}

export function createReveal(transcript: string): RevealState {
  // 記号・空白は最初から見せておく（形だけ分かると「発掘」しやすい）
  const revealed = new Set<number>();
  for (let i = 0; i < transcript.length; i += 1) {
    if (!/[\p{Letter}\p{Number}]/u.test(transcript[i] ?? "")) revealed.add(i);
  }
  return { transcript, revealed };
}

export interface RevealResult {
  readonly state: RevealState;
  /** 今回あらたに見えた文字数。 */
  readonly newlyRevealed: number;
}

/**
 * 入力した言葉が原稿にあれば、その場所を見えるようにする。
 * 表記が違っても当たるよう、正規化した文字列の上で探して元の位置へ戻す。
 */
export function revealWith(state: RevealState, input: string): RevealResult {
  const needle = normalizeReading(input);
  if (!needle) return { state, newlyRevealed: 0 };

  // 正規化後の位置 → 元の位置 の対応表を作る（正規化で文字が消えることがある）
  const map: number[] = [];
  let normalized = "";
  for (let i = 0; i < state.transcript.length; i += 1) {
    const piece = normalizeReading(state.transcript[i] ?? "");
    for (let k = 0; k < piece.length; k += 1) map.push(i);
    normalized += piece;
  }

  const revealed = new Set(state.revealed);
  let count = 0;
  let from = 0;
  for (;;) {
    const at = normalized.indexOf(needle, from);
    if (at < 0) break;
    for (let k = at; k < at + needle.length; k += 1) {
      const original = map[k];
      if (original !== undefined && !revealed.has(original)) {
        revealed.add(original);
        count += 1;
      }
    }
    from = at + 1;
  }

  return { state: { ...state, revealed }, newlyRevealed: count };
}

/** 表示率（%）。クリア条件の判定に使う。 */
export function revealRate(state: RevealState): number {
  if (state.transcript.length === 0) return 100;
  return Math.round((state.revealed.size / state.transcript.length) * 100);
}
