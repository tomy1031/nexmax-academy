/**
 * もんだいの合否の式（学習者の画面と先生の画面で同じものを使う）
 *
 * 学習者の画面（src/components/quiz/quiz-reducer.ts の結果のまとめ）は、
 * 「正解した問題の数 ÷ 答えた問題の数」を四捨五入した割合が合格ライン以上なら合格にしている
 * （2026-08-19 の指定「何問中何問正解の何％かがわかればよい」。点ではなく問題の数）。
 * 先生の画面で点を使うと、2点・3点の問題を含むセットで合否が食い違う（2026-10-11 のレビュー）。
 * 先生の画面はここを通して、学習者が見た合否と同じものを出す。
 */

/** 正解の割合（四捨五入した %）。答えた問題が無ければ 0。 */
export function quizPercent(correct: number, answered: number): number {
  return answered > 0 ? Math.round((correct / answered) * 100) : 0;
}

/** 合格したか（学習者の画面と同じ判定）。 */
export function quizPassed(correct: number, answered: number, passRate: number): boolean {
  return answered > 0 && quizPercent(correct, answered) >= passRate;
}
