/**
 * 好感度（ハート）の 加点 — 純粋な計算だけ
 *
 * ## ハートは 下がらない（設計01 P8）
 * 会話の練習で「減る数字」を見せると、学習者は次の一言を出さなくなる。
 * だからここには **減らす道が1本も無い**。言い直しても、噛み合わなくても、
 * 合計は前より小さくならない——それが型で保証されるように、加点は
 * 「その質問で すでに 足した ぶんとの 差」だけを足す形にしてある。
 *
 * ## なぜ質問ごとに持つのか
 * 同じ質問に最大3回まで言い直せる（MAX_ATTEMPTS）。1発話ごとに素直に足すと、
 * **言い直した人ほど ハートが多く貯まる**。逆に「1回目だけ数える」にすると、
 * 言い直して良くなった人が損をする。だから質問ごとに「いちばん良かった判定の点」を
 * 持ち、良くなったぶんだけ差を足す。下がらない・言い直しが損にならない、の両立。
 *
 * ## 点の配り方（miss でも 上がる）
 * veryGood / good は 2点、miss は 1点。**miss を 0点にしない**のは、
 * 噛み合わなくても「日本語で 声を 出して 会話を 前に 進めた」こと自体が
 * この教材のねらいだから（罰を見せない）。完走すると +2。
 *
 * 画面（meeting-session.tsx）とテストの両方から使うので、ここには React を置かない。
 */

import type { JudgeGrade } from "@/lib/meeting/judge";

/** 判定3段 → ハートの点。 */
export const AFFECTION_POINTS: Record<JudgeGrade, number> = {
  veryGood: 2,
  good: 2,
  miss: 1,
};

/**
 * 判定を通せなかったとき（キーが無い・混んでいる）の点。
 * こちらの都合で落ちたぶんを学習者から引かない。答えた人と同じ扱いにする。
 */
export const FALLBACK_POINTS = AFFECTION_POINTS.good;

/** さいごまで 話しきったときの ごほうび。 */
export const COMPLETION_BONUS = 2;

/**
 * 好感度の状態。合計そのものは持たず、**内訳から毎回組み立てる**
 * （合計と内訳を両方持つと、片方だけ更新した瞬間に静かに食い違う）。
 */
export interface AffectionState {
  /** 質問ID → その質問で すでに 足した 点。 */
  readonly perQuestion: Readonly<Record<string, number>>;
  /** 完走ボーナスを 足したか。 */
  readonly finished: boolean;
}

export const EMPTY_AFFECTION: AffectionState = { perQuestion: {}, finished: false };

/** 判定（判定できなかったときは null）を点に写す。 */
export function pointsForGrade(grade: JudgeGrade | null): number {
  return grade === null ? FALLBACK_POINTS : AFFECTION_POINTS[grade];
}

/** いま貯まっているハート。 */
export function heartsOf(state: AffectionState): number {
  let total = state.finished ? COMPLETION_BONUS : 0;
  for (const points of Object.values(state.perQuestion)) total += points;
  return total;
}

/**
 * 1つの発話を点に写す。
 *
 * すでに足したぶんより低い判定が来ても**下げない**（言い直しで悪くなっても減らない）。
 * 変わらないときは同じ状態をそのまま返す＝画面の再描画も祝いの演出も起きない。
 */
export function awardAnswer(
  state: AffectionState,
  questionId: string,
  grade: JudgeGrade | null,
): AffectionState {
  const already = state.perQuestion[questionId] ?? 0;
  const earned = Math.max(already, pointsForGrade(grade));
  if (earned === already) return state;
  return { ...state, perQuestion: { ...state.perQuestion, [questionId]: earned } };
}

/** 完走ボーナス。2度目は足さない。 */
export function awardCompletion(state: AffectionState): AffectionState {
  return state.finished ? state : { ...state, finished: true };
}

/**
 * とっておきの話が開くか。
 * **完走が条件に入っている**ので、途中で貯まっても最後まで話しきるまで開かない（P2）。
 */
export function rewardOpen(state: AffectionState, threshold: number): boolean {
  return state.finished && heartsOf(state) >= threshold;
}

/**
 * すべての質問が miss でも完走すれば貯まる最低ライン。
 *
 * 教材の `threshold` はこれ以下にしておく——さもないと「ぜんぶ 答えたのに
 * 開かない箱」が残り、いちばん助けが要る学習者だけがごほうびを見られない。
 * エンジンは与えられた値に従うだけなので、この式は**教材を作る側の目安**として置く。
 */
export function minimumHearts(questionCount: number): number {
  return questionCount * AFFECTION_POINTS.miss + COMPLETION_BONUS;
}

/** メーターに塗るハートの数（満タンを超えても はみ出さない）。 */
export function filledHearts(hearts: number, maxHearts: number): number {
  return Math.max(0, Math.min(maxHearts, hearts));
}
