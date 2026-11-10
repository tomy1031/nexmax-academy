/**
 * 連絡の もんだい（content/quizsets/renraku_quiz.json）の 形の 見張り
 *
 * 2026-11-10 の 指定「連絡の 問題ですが、穴埋め問題は なしで その 代わり 4択問題を もう少し
 * 細かく 問題を 作成して ください」。
 *  - 穴うめ（語群・書きこみ）を 置かない。どの 問いも 4択
 *  - 聞いた 順に 細かく 問う（3つの お願いは 1つずつ 別の 問いに する）
 *  - 正解の 位置が 1か所に かたよらない（選択肢は 画面で まぜない ので、データの 順が そのまま 出る）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface Question {
  readonly id: string;
  readonly type: string;
  readonly q: string;
  readonly options?: readonly string[];
  readonly answer?: number;
  readonly explain?: string;
}

const quiz = JSON.parse(readFileSync(join("content", "quizsets", "renraku_quiz.json"), "utf8")) as {
  questions: readonly Question[];
};

describe("連絡の もんだい", () => {
  it("穴うめは 無く、どの 問いも 4択（正解は 選択肢の 中）", () => {
    for (const question of quiz.questions) {
      expect(question.type, question.id).toBe("choose");
      expect(question.options, question.id).toHaveLength(4);
      expect(question.answer, question.id).toBeGreaterThanOrEqual(0);
      expect(question.answer, question.id).toBeLessThan(4);
      expect(new Set(question.options).size, `${question.id} の 選択肢が 重なって いる`).toBe(4);
      expect(question.explain, question.id).toBeTruthy();
    }
  });

  it("3つの お願いを 1つずつ 問う", () => {
    const asks = quiz.questions.map((question) => question.q);
    for (const n of ["1つめ", "2つめ", "3つめ"]) {
      expect(
        asks.filter((q) => q.startsWith(`${n}の お願い`)),
        n,
      ).toHaveLength(1);
    }
  });

  it("正解の 位置が 1か所に かたよらない", () => {
    const counts = [0, 0, 0, 0];
    for (const question of quiz.questions) counts[question.answer!]! += 1;
    const most = Math.max(...counts);
    expect(most, `正解の 位置: ${counts.join(" / ")}`).toBeLessThanOrEqual(
      Math.ceil(quiz.questions.length / 2),
    );
    expect(Math.min(...counts), `正解の 位置: ${counts.join(" / ")}`).toBeGreaterThan(0);
  });
});
