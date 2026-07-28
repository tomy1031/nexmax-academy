/**
 * 出題スケジューラ — 苦手な語を先に出す
 *
 * 旧アプリは `shuffle(words).slice(0, n)` だったので、何度やっても同じ確率でしか
 * 苦手な語に当たらなかった。ここでは学習履歴（MasteryMap）から重みを作り、
 * 重み付き非復元抽出で出題を決める（間隔反復の簡易版）。
 *
 * 乱数は引数で受け取る。テストで固定でき、同じ入力なら同じ出題になる。
 */

import type { MasteryMap } from "@/lib/progress/store";
import type { Word } from "@/content/schema";

export type Rng = () => number;

/** 重みの内訳（調整しやすいように定数として置く）。 */
const WEIGHT = {
  /** 全ての語が持つ最低限の出やすさ。0にすると得意な語が二度と出なくなる。 */
  base: 1,
  /** まちがえた回数1回あたりの上乗せ。 */
  perMiss: 2.5,
  /** まだ一度も出ていない語の上乗せ（新出を埋もれさせない）。 */
  unseen: 1.5,
  /** 直近24時間以内にまちがえた語の上乗せ。 */
  recentMiss: 2,
  /** 正解を重ねた語の割引（1回ごと。下限あり）。 */
  perClear: 0.25,
} as const;

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 1語の出やすさ。大きいほど先に出る。 */
export function weightOf(wordId: string, mastery: MasteryMap, now: number): number {
  const record = mastery[wordId];
  if (!record) return WEIGHT.base + WEIGHT.unseen;

  const cleared = Math.max(0, record.seen - record.missed);
  let weight = WEIGHT.base + record.missed * WEIGHT.perMiss - cleared * WEIGHT.perClear;

  if (record.lastMissedAt) {
    const elapsed = now - Date.parse(record.lastMissedAt);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < RECENT_WINDOW_MS) {
      weight += WEIGHT.recentMiss;
    }
  }
  return Math.max(0.2, weight);
}

/**
 * 重み付き非復元抽出。count が語数以上なら全語を（重み順の揺らぎつきで）返す。
 */
export function selectWords({
  words,
  count,
  mastery = {},
  rng = Math.random,
  now = Date.now(),
}: {
  words: readonly Word[];
  count: number;
  mastery?: MasteryMap;
  rng?: Rng;
  now?: number;
}): Word[] {
  const pool = words.map((word) => ({ word, weight: weightOf(word.id, mastery, now) }));
  const picked: Word[] = [];
  const take = Math.min(count, pool.length);

  for (let i = 0; i < take; i += 1) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let threshold = rng() * total;
    let chosenIndex = pool.length - 1;
    for (let j = 0; j < pool.length; j += 1) {
      threshold -= pool[j]!.weight;
      if (threshold <= 0) {
        chosenIndex = j;
        break;
      }
    }
    picked.push(pool[chosenIndex]!.word);
    pool.splice(chosenIndex, 1);
  }
  return picked;
}

/** 4択の並び。正解＋誤答3つをシャッフルする。 */
export function buildChoices(word: Word, rng: Rng = Math.random): string[] {
  return shuffle([word.meaningEn, ...word.wrongMeanings], rng);
}

/** Fisher-Yates。rng を渡せばテストで再現できる。 */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * 何問目でどの景色にいるか。ステージの fieldSequence を出題数で等分する
 *（数問ごとに景色が変わる＝進んでいる実感）。
 */
export function fieldForIndex(
  fieldSequence: readonly string[],
  index: number,
  total: number,
): string {
  if (fieldSequence.length === 0) return "forest";
  const perField = Math.max(1, Math.ceil(Math.max(1, total) / fieldSequence.length));
  const segment = Math.min(fieldSequence.length - 1, Math.floor(index / perField));
  return fieldSequence[segment] ?? fieldSequence[0]!;
}
