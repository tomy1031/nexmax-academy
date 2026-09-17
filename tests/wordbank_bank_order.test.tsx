import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionBody } from "../src/components/quiz/question-types";
import { quizSetSchema, type QuizQuestion } from "../src/content/schema";
import { answerLeakScore, wordbankDisplayOrder } from "../src/lib/quiz/bank-order";
import { buildFuriganaIndex } from "../src/lib/text/furigana";

/*
 * 語群の ふだの 並び（2026-09-17「報告の問題の選択肢の順番が答えのまま」
 * 「今後の問題作成の時に同じ問題が起こらないように」）。
 *
 * 語群は「答えを 出た 順に → まぎらわしい 語」と 書かれがちで、画面が その 順の まま
 * 並べて いた。直したのは データでは なく **画面の 並べかた**——次に 作る もんだいも
 * 同じ 形で 書かれるので、書く 人に 頼らない。ここでは
 *  1. 見え具合の 数えかた（左から 押す 学習者が 何を 得るか）
 *  2. 並べかたの 約束（中身は 変えない・いつも 同じ 順・答えが 見えない）
 *  3. **git に ある 語群 すべて**が、画面では 答えが 見えない こと
 *  4. 画面の 部品が その 並べかたを 通して いる こと（データの 順に 戻さない）
 * を 見る。
 */

type Wordbank = Extract<QuizQuestion, { type: "wordbank" }>;

/**
 * 画面で 許す 見え具合。穴が 3つの ときは どう 並べても 1 に なる（bank-order.ts の 註）。
 * ほかの 形は ほとんど 0 に なるが、候補から 選ぶので まれに 1 が 残る。
 */
const ALLOWED = 1;

describe("答えの 見え具合（answerLeakScore）", () => {
  it("データの 順（答えを 出た 順 → まぎらわしい 語）は 大きく 出る", () => {
    const blanks = ["報告", "早く", "隠す"];
    // 左から 押すと 3つ ＋ 飛ばして 押すと 3つ ＋ となりあう 組が 2つ
    expect(answerLeakScore(["報告", "早く", "隠す", "連絡"], blanks)).toBe(8);
  });

  it("まぎらわしい 語を あいだに はさんでも、答えの 順の まま なら 見えて いる", () => {
    // 検収で 見つかった IT の 確認（q_itwords）の、1回 まぜた だけの 並び。
    // まぎらわしい 語を 飛ばして 押すと 2〜4番目が 当たり、その 3つは となりあって いる
    const blanks = [
      "requirements definition",
      "design document",
      "specification",
      "application",
      "database",
      "source code",
    ];
    const shown = [
      "source code",
      "keyboard",
      "meeting",
      "design document",
      "specification",
      "application",
      "requirements definition",
      "database",
    ];
    expect(answerLeakScore(shown, blanks)).toBe(5);
  });

  it("いちばん 左が 1つ目の 答えなら、ほかが まざって いても 数える", () => {
    // 左から ぜんぶ 押しても、飛ばして 押しても 1つ目が 当たる
    expect(answerLeakScore(["報告", "隠す", "連絡", "早く"], ["報告", "早く", "隠す"])).toBe(2);
  });

  it("穴が 1つなら、左から ぜんぶ 押す ときだけ 数える（答えは 1枚なので 飛ばせば 当たる）", () => {
    expect(answerLeakScore(["報告", "連絡"], ["報告"])).toBe(1);
    expect(answerLeakScore(["連絡", "報告"], ["報告"])).toBe(0);
  });

  it("左から 当たらなくても、答えの 順で となりあえば 数える", () => {
    // 報告 → 早く が となりあって いる
    expect(answerLeakScore(["隠す", "連絡", "報告", "早く"], ["報告", "早く", "隠す"])).toBe(1);
  });

  it("左から 当たらず、となりあいも 無ければ 0", () => {
    expect(answerLeakScore(["早く", "連絡", "報告"], ["報告", "早く"])).toBe(0);
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

  it("語を 足したり 消したり しない（同じ 語が 2つ あっても）", () => {
    expect([...wordbankDisplayOrder(question)].sort()).toEqual([...question.bank].sort());
    const twice = { id: "dup", blanks: ["A"], bank: ["A", "A", "B"] };
    expect([...wordbankDisplayOrder(twice)].sort()).toEqual(["A", "A", "B"]);
  });

  it("同じ もんだいなら いつも 同じ 順（サーバと ブラウザで 食い違わない）", () => {
    expect(wordbankDisplayOrder(question)).toEqual(wordbankDisplayOrder({ ...question }));
  });

  it("報告の 1問目は、左から 押しても 1つも 当たらない", () => {
    const shown = wordbankDisplayOrder(question);
    expect(shown).not.toEqual(question.bank);
    expect(answerLeakScore(shown, question.blanks)).toBe(0);
  });

  /*
   * 候補から 選ぶので「必ず」とは 証明できない。代わりに 穴の 数・語群の 大きさを
   * 変えた 多くの もんだいで 確かめる（id を 変える＝まぜかたが 変わる）。
   */
  it.each([1, 2, 3, 4, 5, 6])(
    "穴が %i つの もんだいを たくさん 作っても、答えが 見える 並びに ならない",
    (holes) => {
      const blanks = Array.from({ length: holes }, (_, i) => `答え${i}`);
      for (const extra of [1, 2, 4]) {
        const bank = [...blanks, ...Array.from({ length: extra }, (_, i) => `はずれ${i}`)];
        for (let n = 0; n < 300; n += 1) {
          const shown = wordbankDisplayOrder({ id: `q${n}`, blanks, bank });
          expect(shown[0]).not.toBe(blanks[0]);
          expect(answerLeakScore(shown, blanks)).toBeLessThanOrEqual(ALLOWED);
        }
      }
    },
  );
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
  )("%s は 画面で 答えが 見えない", (_label, question) => {
    const shown = wordbankDisplayOrder(question);
    expect(shown[0]).not.toBe(question.blanks[0]);
    expect(answerLeakScore(shown, question.blanks)).toBeLessThanOrEqual(ALLOWED);
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
        lines: ["___ と ___ と ___ と ___"],
        blanks: ["あさ", "ひる", "ゆうがた", "よる"],
        bank: ["あさ", "ひる", "ゆうがた", "よる", "よなか", "まよなか"],
      },
    ],
  });
  const question = set.questions[0] as Wordbank;

  it("ふだを データの 順では なく、まぜた 順で 並べる", () => {
    const html = renderToStaticMarkup(
      <QuestionBody question={question} furigana={buildFuriganaIndex([])} dispatch={() => {}} />,
    );
    const chips = [...html.matchAll(/aria-label="([^"]+)" class="btn-island/g)].map((m) => m[1]!);
    expect(chips).toEqual(wordbankDisplayOrder(question));
    expect(chips).not.toEqual(question.bank);
    expect(answerLeakScore(chips, question.blanks)).toBeLessThanOrEqual(ALLOWED);
  });
});
