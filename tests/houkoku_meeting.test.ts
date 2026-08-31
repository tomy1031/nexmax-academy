import { describe, expect, it } from "vitest";
import meeting from "../content/meetings/kaisha_houkoku_meeting.json";
import { hintPatterns, HINT_BLANK } from "../src/lib/meeting/hint";
import { annotateRuby, buildFuriganaIndex } from "../src/lib/text/furigana";

/**
 * ヘンディさんへの 報告（`kaisha_houkoku_meeting`）の 中身を 固定する。
 *
 * 2026-08-31 の 指摘 4件のうち、**データで 直した もの**を ここで 見張る。
 * 画面の 側（カードの 見出し・答えた カードを 隠さない）は 部品の テストが 持つ。
 */

const FURIGANA = buildFuriganaIndex(meeting.furigana as [string, string][]);

/** 読み辞書を 通した ときの 読み（ルビの 付かない ところは 素の 字）。 */
function reading(text: string): string {
  return annotateRuby(text, FURIGANA)
    .map((segment) => segment.reading ?? segment.text)
    .join("");
}

describe("ふりがな", () => {
  /*
   * 「会いに」が「かいいに」に なっていた（2026-08-31 の 指摘）。
   * 送りがなで 読みが 変わる 型（会社＝かいしゃ／会い＝あい）で、
   * 1字の 辞書（["会","かい"]）だけでは 分けられない。
   */
  it("「会いに 行きましょう」は 「あいに」と 読む", () => {
    expect(reading("つぎは 松井社長に 会いに 行きましょう。")).toContain("あいに");
    expect(reading(meeting.closing)).not.toContain("かいい");
  });

  it("「会社」は 「かいしゃ」の まま（長い ほうが 先に 当たる）", () => {
    expect(reading("会社の 名前")).toBe("かいしゃの なまえ");
  });
});

describe("ヒント（答え方の 型）", () => {
  /*
   * ヒントが **答えそのもの**に なっていた（2026-08-31 の 指摘
   *「答えになってます。○年にできました、会社の名前は〇〇です など、
   *  テンプレートを 用意して あげて ください」）。
   * 読んで 写すだけの 練習に しない ため、穴（◯◯）を 必ず 1つ 置く。
   */
  it("どの ヒントにも 穴（◯◯）が ある", () => {
    for (const question of meeting.questions) {
      const patterns = hintPatterns(question.hint);
      expect(patterns.length, question.id).toBeGreaterThan(0);
      expect(
        patterns.some((pattern) => pattern.includes(HINT_BLANK)),
        question.id,
      ).toBe(true);
    }
  });

  /**
   * ヒントに **答えの ことば**を 書かない。
   *
   * しつもんに もともと 出て くる ことば（「日本人の だれと」の 日本人）は 別——
   * それは 答えでは なく、言い方の 枠である。
   */
  it("ヒントに 答えの ことばが 入っていない", () => {
    for (const question of meeting.questions) {
      for (const keyword of question.keywords) {
        if (question.ask.includes(keyword)) continue;
        expect(question.hint, `${question.id} / ${keyword}`).not.toContain(keyword);
      }
    }
  });
});

describe("判定の 見かた", () => {
  /*
   * 「2つの サービスを 教えて ください」に 1つだけ 答えて 合格に なっていた
   *（2026-08-31 の 指摘「1個しか あってないのに 正解に なった」）。
   */
  it("2つ 聞く しつもんは、2つ そろって はじめて 合格", () => {
    expect(meeting.judgePrompt).toContain("2つ そろって はじめて onTopic");
    expect(meeting.judgePrompt).not.toContain("サービスを 2つ … 1つでも 正しければ");
  });
});
