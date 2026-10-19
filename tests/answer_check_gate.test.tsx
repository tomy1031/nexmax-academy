import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { quizQuestionSchema, type QuizQuestion } from "@/content/schema";
import { CheckBand } from "@/components/quiz/check-parts";
import { gatesOnAnswerCheck } from "@/lib/quiz/ai-review";
import { buildFuriganaIndex } from "@/lib/text/furigana";

/**
 * こたえの チェックを **関門に しない** 問い（`ai.gate: false`・願い #586 の A）
 *
 * 2026-10-08 の 指定: 書けば 点の 自由記述 12問に ⭕✗と ブラッシュアップを 補助として
 * 足すが、**進みかたは 変えない**。ここが 壊れると、
 * - 関門に なって しまう → 報告・会社の 教材で 学習者が 止まる（授業が 止まる）
 * - Slack（上級）の 関門が 外れる → 2026-09-21 の 指定が 黙って 消える
 */

function free(ai?: Record<string, unknown>): QuizQuestion {
  return quizQuestionSchema.parse({
    id: "q1",
    type: "free",
    q: "どうして ですか。",
    minLength: 5,
    explain: "りゆうを 書きます。",
    ...(ai ? { ai } : {}),
  });
}

const AI = { checks: [{ id: "naze", label: "りゆうが ある" }], model: "おもしろいからです。" };

describe("関門に なるか", () => {
  it("観点の ある 自由記述は 既定で 関門（Slack の 上級）", () => {
    expect(gatesOnAnswerCheck(free(AI))).toBe(true);
    expect(gatesOnAnswerCheck(free({ ...AI, gate: true }))).toBe(true);
  });

  it("gate: false は 見せるだけ（進みかたは 変えない）", () => {
    expect(gatesOnAnswerCheck(free({ ...AI, gate: false }))).toBe(false);
  });

  it("観点の ない 自由記述は これまでどおり 関門に しない", () => {
    expect(gatesOnAnswerCheck(free())).toBe(false);
  });

  it("4択は 関門に しない", () => {
    const choose = quizQuestionSchema.parse({
      id: "c1",
      type: "choose",
      q: "どれ？",
      options: ["あ", "い"],
      answer: 0,
      explain: "あ です。",
    });
    expect(gatesOnAnswerCheck(choose)).toBe(false);
  });
});

describe("まとめの 帯", () => {
  const furigana = buildFuriganaIndex([]);

  it("関門の 問いは「次の もんだいに 進めます」と 言う", () => {
    const html = renderToStaticMarkup(<CheckBand ok left={0} aiNote="" furigana={furigana} />);
    expect(html).toContain("進");
    expect(html).toContain("OKです");
  });

  it("関門で ない 問いは 進む 話を しない（✗でも 進めない とは 読ませない）", () => {
    const ok = renderToStaticMarkup(
      <CheckBand ok left={0} aiNote="" furigana={furigana} gated={false} />,
    );
    const ng = renderToStaticMarkup(
      <CheckBand ok={false} left={2} aiNote="" furigana={furigana} gated={false} />,
    );
    expect(ok).toContain("OKです");
    expect(ok).not.toContain("進");
    expect(ng).toContain("2こ");
    expect(ng).toContain("できます");
    expect(ng).not.toContain("進");
  });
});
