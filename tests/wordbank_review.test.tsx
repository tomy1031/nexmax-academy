import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WordbankReview } from "../src/components/quiz/wordbank-review";
import { quizSetSchema, type QuizQuestion } from "../src/content/schema";
import {
  checkWordbank,
  formatWordbankAnswer,
  gradeDraft,
  parseWordbankAnswer,
} from "../src/lib/quiz/draft";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * 穴うめの 答え合わせ（2026-09-11 の 指定「答えが 出るだけで、どこを どう
 * 間違えたか わかりません。構造的に 直せそうでしょうか？」）。
 *
 * 見るのは 2つ:
 *  1. 記録に 残るのは **文だけ**なので、その 文から 穴ごとの ことばを
 *     読み戻せる こと（組み立てと 読み戻しが ずれて いない こと）
 *  2. 画面に、まちがえた あなの **となりに 正しい ことば**が 出る こと
 */

const set = quizSetSchema.parse({
  kind: "quizset",
  id: "wordbank-review-test",
  title: "テスト",
  description: "テスト",
  nekumax: "listen",
  phase: "research",
  passRate: 60,
  furigana: [
    ["時間", "じかん"],
    ["問題", "もんだい"],
    ["会議", "かいぎ"],
    ["悪", "わる"],
  ],
  questions: [
    {
      id: "w1",
      type: "wordbank",
      q: "うめて ください。",
      explain: "せつめい。",
      lines: ["今 少し ___ よろしいでしょうか。", "システムに ___ が あります。"],
      blanks: ["お時間", "問題"],
      bank: ["お時間", "問題", "会議", "悪い ニュース"],
    },
    {
      id: "w2",
      type: "wordbank",
      q: "そろえて ください。",
      explain: "せつめい。",
      unordered: true,
      lines: ["___ と ___"],
      blanks: ["お時間", "問題"],
      bank: ["お時間", "問題", "会議"],
    },
  ],
});

const ordered = set.questions[0] as Extract<QuizQuestion, { type: "wordbank" }>;
const unordered = set.questions[1] as Extract<QuizQuestion, { type: "wordbank" }>;
const furigana = buildFuriganaIndex(set.furigana ?? []);

describe("こたえの 文の 組み立てと 読み戻し", () => {
  it("空白の 入った ことばでも、そのまま 往復できる", () => {
    const filled = ["悪い ニュース", "問題"];
    const text = formatWordbankAnswer(filled);
    expect(text).toBe("（1）悪い ニュース　（2）問題");
    expect(parseWordbankAnswer(text, 2)).toEqual(filled);
  });

  it("採点が 残す 文を、そのまま 読み戻せる（2か所が ずれて いない）", () => {
    const grade = gradeDraft(ordered, { kind: "wordbank", filled: ["会議", "問題"] });
    expect(parseWordbankAnswer(grade.answer, 2)).toEqual(["会議", "問題"]);
  });

  it("書かなかった 穴は 空欄で 返る（古い 記録・壊れた 文でも 落ちない）", () => {
    expect(parseWordbankAnswer("", 2)).toEqual(["", ""]);
    expect(parseWordbankAnswer("こわれた 文", 2)).toEqual(["", ""]);
  });
});

describe("穴ごとの 答え合わせ", () => {
  it("位置で くらべる（並びに 意味の ある 問い）", () => {
    const checks = checkWordbank(ordered, formatWordbankAnswer(["会議", "問題"]));
    expect(checks).toEqual([
      { own: "会議", right: "お時間", ok: false },
      { own: "問題", right: "問題", ok: true },
    ]);
  });

  it("unordered では 位置で くらべない（そろって いれば ○）", () => {
    const checks = checkWordbank(unordered, formatWordbankAnswer(["問題", "お時間"]));
    expect(checks.map((c) => c.ok)).toEqual([true, true]);
  });
});

describe("答え合わせの 画面", () => {
  const html = renderToStaticMarkup(
    <WordbankReview
      question={ordered}
      answer={formatWordbankAnswer(["会議", "問題"])}
      furigana={furigana}
    />,
  );

  it("問いと 同じ 文の 形で 返す（ことばを 横に 並べるだけに しない）", () => {
    expect(html).toContain("よろしいでしょうか");
    expect(html).toContain("システムに");
  });

  it("まちがえた あなの となりに 正しい ことばが 出る", () => {
    // 自分が 入れた ことば → 正しい ことば の 順で 並ぶ
    const own = html.indexOf("会議");
    const right = html.indexOf("時間");
    expect(own).toBeGreaterThan(-1);
    expect(right).toBeGreaterThan(own);
    expect(html).toContain("✗");
  });

  it("合って いた あなには ○の しるしが 付き、正解は 出ない（二度 書かない）", () => {
    expect(html).toContain("✓");
    // 「問題」は 自分の こたえとして 1回だけ 出る（正解の 札は 付かない）
    expect(html.split("問題").length - 1).toBe(1);
  });

  it("いくつ まちがえたかを ことばでも 言う（色と 記号だけに たよらない）", () => {
    expect(html).toContain("1つ");
  });

  it("書かなかった 穴は 空白の まま 出さない（言って あげる）", () => {
    const blank = renderToStaticMarkup(
      <WordbankReview question={ordered} answer="" furigana={furigana} />,
    );
    // 画面では 「書」に ルビが 付く（規律2）ので、そのままの 文字列では 出ない
    expect(blank).toContain("<ruby>書<rt>か</rt></ruby>");
    expect(blank).toContain("いて いません");
  });
});
