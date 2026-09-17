import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionBody } from "../src/components/quiz/question-types";
import { quizSetSchema, type QuizQuestion } from "../src/content/schema";
import { leaksAnswerOrder, wordbankDisplayOrder } from "../src/lib/quiz/bank-order";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * 語群の ふだの 並び（2026-09-17「報告の問題の選択肢の順番が答えのまま」
 * 「今後の問題作成の時に同じ問題が起こらないように」）。
 *
 * 語群は「答えを 出た 順に → まぎらわしい 語」と 書かれがちで、画面が その 順の まま
 * 並べて いた。直したのは データでは なく **画面の 並べかた**——次に 作る もんだいも
 * 同じ 形で 書かれるので、書く 人に 頼らない。ここでは
 *  1. 並べかたの 約束（中身は 変えない・いつも 同じ 順・答えの 順に ならない）
 *  2. **git に ある 語群 すべて**が、画面では 答えの 順に ならない こと
 *  3. 画面の 部品が その 並べかたを 通して いる こと（データの 順に 戻さない）
 * を 見る。
 */

type Wordbank = Extract<QuizQuestion, { type: "wordbank" }>;

describe("答えの 順が 見えて いるか（leaksAnswerOrder）", () => {
  it("答えが 出た 順に 並んで いれば 漏れ（先頭に 固まって いなくても）", () => {
    expect(leaksAnswerOrder(["報告", "早く", "連絡"], ["報告", "早く"])).toBe(true);
    expect(leaksAnswerOrder(["報告", "連絡", "早く"], ["報告", "早く"])).toBe(true);
  });

  it("順が 1つでも 入れかわって いれば 漏れでは ない", () => {
    expect(leaksAnswerOrder(["早く", "連絡", "報告"], ["報告", "早く"])).toBe(false);
  });

  it("いちばん 左の ふだが 1つ目の 答えなら、ほかが まざって いても 漏れ", () => {
    // 左から 押す 学習者は、1つ目の 穴だけは 当たって しまう
    expect(leaksAnswerOrder(["報告", "連絡", "早く", "隠す"], ["報告", "隠す", "早く"])).toBe(true);
  });

  it("穴が 1つ なら、いちばん 左に 答えが ある ときだけ 漏れ", () => {
    expect(leaksAnswerOrder(["報告", "連絡"], ["報告"])).toBe(true);
    expect(leaksAnswerOrder(["連絡", "報告"], ["報告"])).toBe(false);
  });
});

describe("画面に 出す 語群の 順（wordbankDisplayOrder）", () => {
  const question = {
    id: "h_blank1",
    blanks: ["報告", "スケジュール", "隠す", "悪い ニュース", "早く"],
    bank: [
      "報告",
      "スケジュール",
      "隠す",
      "悪い ニュース",
      "早く",
      "連絡",
      "メール",
      "休む",
      "良い ニュース",
      "ゆっくり",
    ],
  };

  it("語を 足したり 消したり しない", () => {
    expect([...wordbankDisplayOrder(question)].sort()).toEqual([...question.bank].sort());
  });

  it("同じ もんだいなら いつも 同じ 順（サーバと ブラウザで 食い違わない）", () => {
    expect(wordbankDisplayOrder(question)).toEqual(wordbankDisplayOrder({ ...question }));
  });

  it("データの 順とは ちがい、答えの 順にも ならない", () => {
    const shown = wordbankDisplayOrder(question);
    expect(shown).not.toEqual(question.bank);
    expect(leaksAnswerOrder(shown, question.blanks)).toBe(false);
  });

  it("まぜ直しが 尽きても（まぎらわしい 語が 無い 語群でも）漏れない 並びに 落ちる", () => {
    // 穴3つ・語3つ。6通りの うち 漏れない のは 4通り——種を 変えても 当たらない 場合の 受け皿を 見る
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
      const blanks = ["あさ", "ひる", "よる"];
      const shown = wordbankDisplayOrder({ id, blanks, bank: blanks });
      expect([...shown].sort()).toEqual([...blanks].sort());
      expect(leaksAnswerOrder(shown, blanks)).toBe(false);
    }
  });

  it("まぜる 余地が 小さい 語群（2語）でも 答えの 順に ならない", () => {
    // 穴2つ・語2つは どう まぜても 答えの 順か その 逆の 2通りしか 無い
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const shown = wordbankDisplayOrder({
        id,
        blanks: ["はい", "いいえ"],
        bank: ["はい", "いいえ"],
      });
      expect(leaksAnswerOrder(shown, ["はい", "いいえ"])).toBe(false);
    }
  });
});

/** content/ の 下に ある 語群を ぜんぶ 拾う（quizset 以外に 置かれても 見のがさない）。 */
function gitWordbanks(): { file: string; question: Wordbank }[] {
  const root = new URL("../content", import.meta.url).pathname;
  const found: { file: string; question: Wordbank }[] = [];
  const visit = (node: unknown, file: string) => {
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, file));
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "wordbank" && Array.isArray(record.bank)) {
      found.push({ file, question: record as unknown as Wordbank });
    }
    Object.values(record).forEach((child) => visit(child, file));
  };
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) visit(JSON.parse(readFileSync(full, "utf8")), full);
    }
  };
  walk(root);
  return found;
}

describe("git に ある 語群", () => {
  const all = gitWordbanks();

  it("語群が 見つかって いる（0件で 素通りしない）", () => {
    // 報告の 2問（h_blank1・h_blank2）は 必ず ある
    const ids = all.map((w) => w.question.id);
    expect(ids).toContain("h_blank1");
    expect(ids).toContain("h_blank2");
  });

  it.each(
    all.map((w) => [`${w.file.split("/content/")[1]} ${w.question.id}`, w.question] as const),
  )("%s は 画面で 答えの 順に ならない", (_label, question) => {
    expect(leaksAnswerOrder(wordbankDisplayOrder(question), question.blanks)).toBe(false);
  });
});

describe("語群の 部品", () => {
  const set = quizSetSchema.parse({
    kind: "quizset",
    id: "bank-order-test",
    title: "テスト",
    description: "テスト",
    nekumax: "listen",
    phase: "research",
    passRate: 60,
    questions: [
      {
        id: "w1",
        type: "wordbank",
        q: "うめて ください。",
        explain: "せつめい。",
        lines: ["___ と ___ と ___"],
        blanks: ["あさ", "ひる", "よる"],
        bank: ["あさ", "ひる", "よる", "よなか", "ゆうがた"],
      },
    ],
  });
  const question = set.questions[0] as Wordbank;

  it("ふだを データの 順では なく、まぜた 順で 並べる", () => {
    const html = renderToStaticMarkup(
      <QuestionBody question={question} furigana={buildFuriganaIndex([])} dispatch={() => {}} />,
    );
    const chips = [...html.matchAll(/aria-label="([^"]+)" class="btn-island/g)].map((m) => m[1]);
    expect(chips).toEqual(wordbankDisplayOrder(question));
    expect(leaksAnswerOrder(chips as string[], question.blanks)).toBe(false);
  });
});
