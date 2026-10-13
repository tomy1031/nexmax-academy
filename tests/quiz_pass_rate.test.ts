import { describe, expect, it } from "vitest";
import { quizPassed, quizPercent } from "../src/lib/quiz/pass-rate";

/**
 * もんだいの合否の式（学習者の画面と先生の画面で同じもの）。
 * 例は 2026-10-11 のレビューで食い違いが見つかった2つのセット。
 */
describe("もんだいの合否は問題の数で決める", () => {
  it("2点の問題だけ正解しても、問題の数で届かなければ不合格（ai_jidai_check の形）", () => {
    // 9問中4問正解＝44%。点なら 8/13＝62% で届いてしまう
    expect(quizPercent(4, 9)).toBe(44);
    expect(quizPassed(4, 9, 60)).toBe(false);
  });

  it("1問目（2点）だけ正解は 3問中1問＝33%で不合格（hajimari_henji の形）", () => {
    expect(quizPassed(1, 3, 50)).toBe(false);
  });

  it("画面に出る割合（四捨五入）で判定する（67%と出して不合格にしない）", () => {
    expect(quizPercent(2, 3)).toBe(67);
    expect(quizPassed(2, 3, 67)).toBe(true);
  });

  it("1問も答えていなければ 0% で不合格", () => {
    expect(quizPercent(0, 0)).toBe(0);
    expect(quizPassed(0, 0, 0)).toBe(false);
  });
});
