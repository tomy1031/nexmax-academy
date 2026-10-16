import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizResultCard } from "../src/components/quiz/quiz-runner";
import {
  passLine,
  summarizeQuiz,
  type QuizResult,
  type QuizState,
} from "../src/components/quiz/quiz-reducer";
import { quizSetSchema, type QuizSet } from "../src/content/schema";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * もんだい（正解の ある quizset）の けっか画面は **合格か 不合格かを 先に、はっきり 出す**
 *（規律1・台帳 #381）。前は 合格でも 不合格でも「よく できました！」／「ここまで すすんだね」で、
 * `passRate` を 見て いなかった。
 *
 * 見張るのは 3つ。
 *  1. 「合格ライン Nもん」「あと Nもん」の 数が、合否の 判定（丸めた ％）と 食い違わない
 *  2. 画面: 合格・不合格・とちゅうまで を 記号と ことばで 言い、次の 一手を 1つ 添える
 *  3. 中身の ない ことば（よく できました・ここまで すすんだね・がんばったね）を 出さない
 *
 * 正解の 無い 教材（自由記述だけ）の 出しかたは `quiz_result_free.test.tsx` が 見る（変えて いない）。
 */

/** `summarizeQuiz` に 渡せる 最小の 状態（n問 中 correct問 正解・配点は 1）。 */
function stateOf(n: number, correct: number, passRate: number): QuizState {
  const questions = Array.from({ length: n }, (_, i) => ({ id: `q${i}`, points: 1 }));
  const results = questions.map((q, i) => ({
    questionId: q.id,
    correct: i < correct,
    earned: i < correct ? 1 : 0,
  }));
  return { questions, results, passRate } as unknown as QuizState;
}

describe("合格ライン（passLine）は 合否の 判定と 同じ 数え方", () => {
  it("1〜40問 × 合格 1〜100% の どれでも、ちょうど その 数で 合格・1つ 少ないと 不合格", () => {
    for (let n = 1; n <= 40; n++) {
      for (let rate = 1; rate <= 100; rate++) {
        const line = passLine(n, rate);
        expect(summarizeQuiz(stateOf(n, line, rate)).passed, `${n}問 ${rate}%`).toBe(true);
        if (line > 0) {
          expect(summarizeQuiz(stateOf(n, line - 1, rate)).passed, `${n}問 ${rate}%`).toBe(false);
        }
      }
    }
  });

  it("丸めの ぶん 切り上げより 少なく なる ことが ある（3問・67% → 2もん で 合格）", () => {
    // 2 / 3 = 66.7% → 丸めて 67%。切り上げ（ceil(3 × 0.67) = 3）だと「あと 1もん」と 誤って 言う
    expect(passLine(3, 67)).toBe(2);
    expect(summarizeQuiz(stateOf(3, 2, 67)).passed).toBe(true);
  });

  it("よく 使う 教材の 形（5問・60%）は 3もん", () => {
    expect(passLine(5, 60)).toBe(3);
  });
});

const QUIZ: QuizSet = quizSetSchema.parse(
  JSON.parse(readFileSync(join("content", "quizsets", "houkoku_kanryou_quiz.json"), "utf8")),
);

/** 先頭から correct 問だけ 正解で 出した 回の けっか画面を 文字列に する。 */
function renderResult(correct: number, skipped = 0): string {
  const review = QUIZ.questions.map((question, i) => {
    const result: QuizResult = {
      questionId: question.id,
      correct: i < correct,
      earned: i < correct ? question.points : 0,
      answer: "えらんだ こたえ",
    };
    return { question, result };
  });
  const state = {
    questions: QUIZ.questions,
    results: review.map(({ result }) => result),
    passRate: QUIZ.passRate,
  } as unknown as QuizState;
  return renderToStaticMarkup(
    <QuizResultCard
      set={QUIZ}
      embedded
      summary={summarizeQuiz(state)}
      review={review}
      skipped={skipped}
      furigana={buildFuriganaIndex(QUIZ.furigana ?? [])}
      freeOnly={false}
      onRetryAll={() => {}}
    />,
  );
}

/** ルビ（<rt>…</rt>）と タグを 落とした、目に 見える 文。 */
function visibleText(html: string): string {
  return html.replace(/<rt>.*?<\/rt>/g, "").replace(/<[^>]+>/g, "");
}

/** 案内の 札（FeedbackMessage・role="status"）の 中だけの 文。 */
function statusText(html: string): string {
  const found = /role="status"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  if (!found?.[1]) throw new Error("案内の 札（role=status）が 見つからない");
  return visibleText(found[1]);
}

/** けっかの 見出し（data-quiz-verdict）の 印と 名前。 */
function heading(html: string): { verdict: string; label: string } {
  const found = /<h2 data-quiz-verdict="([^"]+)" aria-label="([^"]+)"/.exec(html);
  if (!found?.[1] || !found[2]) throw new Error("けっかの 見出しが 見つからない");
  return { verdict: found[1], label: found[2] };
}

const EMPTY_PRAISE = ["よく できました", "ここまで すすんだね", "がんばったね"];

describe("正解の ある もんだいの けっか画面", () => {
  const total = QUIZ.questions.length;
  const line = passLine(total, QUIZ.passRate);

  it("前提: この 教材は 5問・合格 60%（3もん）", () => {
    expect(total).toBe(5);
    expect(QUIZ.passRate).toBe(60);
    expect(line).toBe(3);
  });

  it("合格ラインに とどくと ⭕ 合格・合格ライン・「つぎへ」の 1手", () => {
    const html = renderResult(total);
    expect(heading(html)).toEqual({ verdict: "pass", label: "合格" });
    const text = visibleText(html);
    expect(text).toContain("⭕");
    expect(text).toContain(`合格ライン ${line}もん（60%）`);
    expect(text).not.toContain("不合格");
    expect(text).not.toContain("せいかいで 合格");
    const status = statusText(html);
    expect(status).toContain("合格ラインに とどきました");
    expect(status).toContain("いちばん 下の ボタンで つぎへ 進みましょう");
  });

  it("ちょうど 合格ライン（3 / 5）でも 合格", () => {
    expect(heading(renderResult(line)).verdict).toBe("pass");
  });

  it("とどかないと ❌ 不合格・あと 何もん・「もう一度 やる」の 1手", () => {
    const html = renderResult(line - 1);
    expect(heading(html)).toEqual({ verdict: "fail", label: "不合格" });
    const text = visibleText(html);
    expect(text).toContain("❌");
    expect(text).toContain(`合格ライン ${line}もん（60%）`);
    expect(text).toContain("あと 1もん せいかいで 合格");
    const status = statusText(html);
    expect(status).toContain("まちがえた もんだいを 直しましょう");
    expect(status).toContain("「もう一度 やる」で、こたえを のこした まま 直せます");
  });

  it("0問 正解なら「あと 3もん」", () => {
    expect(visibleText(renderResult(0))).toContain(`あと ${line}もん せいかいで 合格`);
  });

  it("しおりで 途中から 始めた 回は 合否を 言わない（⏸ とちゅうまで）", () => {
    const html = renderResult(total, 3);
    expect(heading(html)).toEqual({ verdict: "partial", label: "とちゅうまで" });
    const text = visibleText(html);
    expect(text).not.toContain("合格");
    expect(text).toContain("まだ やって いない もんだいが 3問 あります");
  });

  it("中身の ない ことばを 出さない（合格でも 不合格でも）", () => {
    for (const correct of [0, line - 1, line, total]) {
      const text = visibleText(renderResult(correct));
      for (const word of EMPTY_PRAISE) {
        expect(text, `${correct}問 正解: ${word}`).not.toContain(word);
      }
    }
  });

  it("採点の 見せ方（何もん中 何もん・％）は そのまま", () => {
    expect(visibleText(renderResult(line - 1))).toContain(`${line - 1} / ${total} もん せいかい`);
    expect(visibleText(renderResult(line - 1))).toContain("40%");
  });

  it("見出しと 合格ラインの 漢字には ふりがなが 付く（規律2）", () => {
    const fail = renderResult(0);
    expect(fail).toContain("<ruby>不合格<rt>ふごうかく</rt></ruby>");
    expect(fail).toContain("<ruby>合格<rt>ごうかく</rt></ruby><span>ライン");
    expect(renderResult(total)).toContain("<ruby>合格<rt>ごうかく</rt></ruby>");
  });

  it("カードの どこにも ルビの 外の 漢字が 無い（合格・不合格・とちゅうまで）", () => {
    for (const [correct, skipped] of [
      [total, 0],
      [0, 0],
      [total, 3],
    ] as const) {
      const bare = renderResult(correct, skipped)
        .replace(/<ruby>[\s\S]*?<\/ruby>/g, "")
        .replace(/<[^>]+>/g, "")
        .match(/[㐀-鿿々]+/g);
      expect(bare, `${correct}問 正解・飛ばし ${skipped}`).toBeNull();
    }
  });
});
