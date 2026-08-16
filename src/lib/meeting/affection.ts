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
 * AIに通せなかったとき（キーが無い・混んでいる）も miss と同じ 1点にする
 *（2点にすると、判定の無い教室では 全員が 満タンになって 差が 消える）。
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
 * 判定を通せなかったとき（キーが無い・混んでいる）の点。**miss と同じ 1点**。
 *
 * ここを `good`（2点）にしていたときは、AI判定が使えない教室——キー未登録が
 * 標準なので、**ほとんどの教室**——で 5問×2点＋完走2点＝12＝満タンになり、
 * 何を書いても必ずハートが満タンで ごほうびも開いた。がんばって長い文を書いた
 * 学習者と、1文字だけ書いた学習者が、画面の上で 完全に 同じになる。
 *
 * かといって 0点にはしない。判定できないのは**こちらの都合**で、学習者の答えの
 * せいではない。「日本語で 声を 出して 会話を 前に 進めた」ぶんは miss と同じ
 * 1点として必ず入る——だから `minimumHearts()` の保証（ぜんぶ答えて完走すれば
 * threshold に届く）は、AIが居ない教室でもそのまま成り立つ。
 * ハートが下がらない・罰を見せない（P8）も変わらない。
 */
export const FALLBACK_POINTS = AFFECTION_POINTS.miss;

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
