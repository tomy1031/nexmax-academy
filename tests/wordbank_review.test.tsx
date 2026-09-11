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
  it("分かち書きの 空白（半角）が 入った ことばでも、そのまま 往復できる", () => {
    const filled = ["悪い ニュース", "問題"];
    const text = formatWordbankAnswer(filled);
    // 区切りは 全角スペース、ことばの 中の 空白は 半角。混ざらない
    expect(text).toBe("（1）悪い ニュース　（2）問題");
    expect(parseWordbankAnswer(text, 2)).toEqual(filled);
  });

  it("うしろに 空白の ある ことばでも 消さない（先生が 入れた ままの 形で 見る）", () => {
    const text = formatWordbankAnswer(["会議", "問題 "]);
    expect(parseWordbankAnswer(text, 2)).toEqual(["会議", "問題 "]);
  });

  it("ことばの 中に 区切りと 同じ 形が あると 分け方は ずれる（既知の 限界）", () => {
    // この 形の 語は 教材の 語群に 無い。**ずれても 画面が 矛盾しない**ことを 下で 見る
    const text = formatWordbankAnswer(["あ　（2）わな", "い"]);
    expect(parseWordbankAnswer(text, 2)).not.toEqual(["あ　（2）わな", "い"]);
    const checks = checkWordbank(
      { ...ordered, blanks: ["あ　（2）わな", "い"] } as typeof ordered,
      text,
      true,
    );
    expect(checks.every((check) => check.ok)).toBe(true);
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

  it("unordered で 同じ ことばを 2つ 置いたら、2つめは ✗（採点と そろえる）", () => {
    const answer = formatWordbankAnswer(["お時間", "お時間"]);
    // 採点は 不合格（`sameSet` は 数まで 見る）
    expect(gradeDraft(unordered, { kind: "wordbank", filled: ["お時間", "お時間"] }).correct).toBe(
      false,
    );
    expect(checkWordbank(unordered, answer).map((c) => c.ok)).toEqual([true, false]);
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

  it("いくつ 直すかを ことばでも 言う（色と 記号だけに たよらない）", () => {
    expect(html).toContain("1つ");
  });

  it("えらばなかった 穴は「まだ」で 出す（まちがいと 同じ 顔に しない）", () => {
    const blank = renderToStaticMarkup(
      <WordbankReview question={ordered} answer="" furigana={furigana} />,
    );
    expect(blank).toContain("まだ");
    // ✗（まちがい）の しるしは 付けない——えらばなかった ことは 別の 出来事
    expect(blank).not.toContain("✗");
    // こたえは 出す（何が 入る はずだったかは 見せる）
    expect(blank).toContain("時間");
  });

  it("合って いた 数から 言う（手ぶらで 帰さない）", () => {
    expect(html).toContain("✓が");
    // 「直」には ルビが 付く ので、地の 文の ほうで 見る
    expect(html).toContain("す ところが");
  });

  it("採点が 合格の 回は、穴も ぜんぶ ○に する（画面が 自分に 矛盾しない）", () => {
    const agreed = renderToStaticMarkup(
      <WordbankReview
        question={ordered}
        answer={formatWordbankAnswer(["会議", "問題"])}
        correct
        furigana={furigana}
      />,
    );
    expect(agreed).not.toContain("✗");
  });
});
