import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LINK_ANSWER_PROMPTS } from "@/content/link-answers";
import { quizSetSchema, stageSchema } from "@/content/schema";
import { replacedContent } from "@/lib/stage-routes";

/**
 * 調査（リサーチ）を 別ページ（link）から もんだい（quizset）へ 差し替えた ところ（2026-09-18）。
 *
 * 指定:「別ウィンドウで表示する形式をやめて、いつものクイズ形式に」
 *      「『問題』のコンポーネントに差し替え。全ページ表示・提出型」
 *      「新しいUIはより理解を必要とする」（＝新しい 部品は 作らない。いまの 型だけ）
 *      「元のものはいったん残して非表示に」（＝元の 別ページは 消さず ステージから 外す）
 *
 * 別ページの 検査（`houkoku_search_tool.test.ts`）が 見て いた 学習上の 約束を、
 * もんだいの 側でも 同じに 保つ。
 */

function read<T>(...path: string[]): T {
  return JSON.parse(readFileSync(join(...path), "utf8")) as T;
}

const quiz = quizSetSchema.parse(read("content", "quizsets", "houkoku_search_quiz.json"));
const stage = stageSchema.parse(read("content", "stages", "houkoku.json"));

/** 学習者が 読む 文を ぜんぶ 集める。 */
function learnerTexts(): string[] {
  const texts: string[] = [quiz.title, quiz.description];
  for (const q of quiz.questions) {
    texts.push(q.q, q.explain, q.section ?? "", q.sectionNote ?? "");
    for (const hint of q.hints ?? []) texts.push(hint.title, hint.text);
    if (q.type === "free") texts.push(q.placeholder ?? "", q.starter ?? "");
  }
  return texts.filter((text) => text !== "");
}

describe("調査の もんだい", () => {
  it("答え（正しい 並び）を 先に ばらして いない", () => {
    // 正しい 並びは つぎの ページ（会社の ポジション）で 出す。ここに 混ぜると 調べる 理由が 消える
    const all = learnerTexts().join("\n");
    for (const rank of ["社長", "部長", "課長", "社員", "係長", "主任"]) {
      expect(all, `${rank} が もんだいの 中に 出て いる`).not.toContain(rank);
    }
    // 藤木さんの 役は リスニングで もう 出て いる ので、手がかりとして 置く
    expect(all).toContain("取締役");
  });

  it("問いは 元の 別ページと 同じ 文・同じ id（そのまま 載せる）", () => {
    const original = LINK_ANSWER_PROMPTS.houkoku_search ?? {};
    expect(quiz.questions.map((q) => q.id)).toEqual(Object.keys(original));
    for (const q of quiz.questions) expect(q.q).toBe(original[q.id]);
  });

  it("全問1ページ・ぜんぶ 書くまで 出せない・1文字でも 書けば うまる", () => {
    expect(quiz.answerMode).toBe("all");
    expect(quiz.requireAll).toBe(true);
    for (const q of quiz.questions) {
      // 新しい 部品は 作らない（いまの 型だけ）。どれも 正解の 無い 自由記述
      expect(q.type).toBe("free");
      // 「とりあえず埋めた時にまだ提出できない」を 起こさない。書けば 点（中身は 先生が 読む）
      if (q.type === "free") expect(q.minLength).toBe(1);
    }
  });
});

describe("報告ステージの 並び", () => {
  it("調査は もんだいに 差し替わり、元の 別ページは ステージに 無い（非表示）", () => {
    const refs = stage.contents.map((content) => `${content.type}:${content.ref}`);
    expect(refs).not.toContain("link:houkoku_search");
    const at = refs.indexOf("quizset:houkoku_search_quiz");
    // 並びは 変えない: 報告の もんだい → 調査 → 答え合わせ（会社の ポジション）
    expect(refs[at - 1]).toBe("quizset:houkoku_quiz");
    expect(refs[at + 1]).toBe("article:houkoku_hierarchy");
    // 出すまで つぎへ 進めない（2026-09-11「提出して初めて次の画面に行けます」）
    expect(stage.contents[at]?.gates).toBe(true);
  });
});

describe("古い URL の 行き先", () => {
  it("別ページの URL（短い形・ID つき）は もんだいへ", () => {
    const now = { type: "quizset", ref: "houkoku_search_quiz" };
    expect(replacedContent("houkoku", "link")).toEqual(now);
    expect(replacedContent("houkoku", "link-houkoku_search")).toEqual(now);
  });

  it("ほかの ステージ・ほかの 教材は 引かない", () => {
    expect(replacedContent("kaisha", "link")).toBeNull();
    expect(replacedContent("houkoku", "link-houkoku_quest")).toBeNull();
    expect(replacedContent("houkoku", "quiz")).toBeNull();
  });
});
