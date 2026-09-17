import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionBody } from "../src/components/quiz/question-types";
import { quizSetSchema, type QuizQuestion } from "../src/content/schema";
import { answerLeakScore, lowestLeakScore, wordbankDisplayOrder } from "../src/lib/quiz/bank-order";
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

/** 並びを ぜんぶ 作る（小さい 穴の 数で 下限を 総当たりで 確かめる ため）。 */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

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
    // 左から ぜんぶ 押しても、飛ばして 押しても 1つ目が 当たる（ほかの 答えは 見えない 並び）
    const blanks = ["報告", "早く", "隠す", "連絡", "相談"];
    expect(answerLeakScore(["報告", "隠す", "メール", "相談", "早く", "連絡"], blanks)).toBe(2);
  });

  it("穴が 1つなら、左から ぜんぶ 押す ときだけ 数える（答えは 1枚なので 飛ばせば 当たる）", () => {
    expect(answerLeakScore(["報告", "連絡"], ["報告"])).toBe(1);
    expect(answerLeakScore(["連絡", "報告"], ["報告"])).toBe(0);
  });

  it("左から 当たらなくても、答えの 順で となりあえば 数える", () => {
    // 報告 → 早く が となりあって いる
    expect(answerLeakScore(["隠す", "連絡", "報告", "早く"], ["報告", "早く", "隠す"])).toBe(1);
  });

  it("穴が 3つ 以上なら、答えの 逆の 順で となりあう 組も 数える（右から 押せば 当たる）", () => {
    // 再検収で 見つかった 連絡の r_blank1 の 並び。答えだけを 見ると ちょうど 逆さ
    const blanks = ["正しい", "短く", "4つ", "何を して ほしいか"];
    const shown = [
      "何を して ほしいか",
      "長く",
      "3つ",
      "4つ",
      "だれが 悪いか",
      "短く",
      "新しい",
      "正しい",
    ];
    expect(answerLeakScore(shown, blanks)).toBe(3);
    // 穴が 2つなら 入れかえは 逆さしか 無いので 数えない
    expect(answerLeakScore(["早く", "報告", "連絡"], ["報告", "早く"])).toBe(0);
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

  it("手数が 尽きても 見え具合を ゆるめて 並びを 返す（語を 変えず・いつも 同じ 順で）", () => {
    // 画面では 使わない 小さな 上限で、ゆるめる 道と さいごの まぜる だけの 道を 通す
    for (const stepLimit of [1, 3, 10, 25]) {
      const shown = wordbankDisplayOrder(question, stepLimit);
      expect([...shown].sort()).toEqual([...question.bank].sort());
      expect(wordbankDisplayOrder(question, stepLimit)).toEqual(shown);
    }
  });

  it("スキーマが 弾く 端の 形（同じ 語が 2つ・語群に 無い 答え）でも 語を 変えずに 返す", () => {
    const odd = [
      { id: "dup-answers", blanks: ["A", "B", "C"], bank: ["A", "A", "B", "C", "D"] },
      { id: "missing", blanks: ["A", "Z", "B", "C"], bank: ["A", "B", "C", "D", "E"] },
    ];
    for (const q of odd) {
      for (const stepLimit of [3, 5000]) {
        expect([...wordbankDisplayOrder(q, stepLimit)].sort()).toEqual([...q.bank].sort());
      }
    }
  });

  it("教材では ありえない 大きさの 語群でも 落ちずに 返す（呼び出しの 深さが 尽きない）", () => {
    const bank = ["答え", ...Array.from({ length: 6000 }, (_, i) => `はずれ${i}`)];
    const shown = wordbankDisplayOrder({ id: "huge", blanks: ["答え"], bank });
    expect(shown).toHaveLength(bank.length);
    expect(new Set(shown)).toEqual(new Set(bank));
  });

  it.each([1, 2, 3, 4, 5])(
    "穴が %i つの 下限は、まぎらわしい 語 1つで 総当たりした 最小と 同じ",
    (holes) => {
      const blanks = Array.from({ length: holes }, (_, i) => `答え${i}`);
      const least = Math.min(
        ...permutations([...blanks, "はずれ"]).map((shown) => answerLeakScore(shown, blanks)),
      );
      expect(least).toBe(lowestLeakScore(holes));
    },
  );

  /*
   * さがす 手数に 上限が あり（当たると ゆるめる）、「必ず」とは 言い切れない。代わりに
   * 穴の 数・まぎらわしい 語の 数を 変えた 多くの もんだいで 確かめる（id を 変える＝
   * まぜかたが 変わる）。まぎらわしい 語 8つは、1段で さがして いた ころ 半分が
   * 下限に 届かなかった 形。
   */
  it.each([1, 2, 3, 4, 5, 6, 8])(
    "穴が %i つの もんだいを たくさん 作っても、いつも 下限まで 下がる",
    (holes) => {
      const blanks = Array.from({ length: holes }, (_, i) => `答え${i}`);
      for (const extra of [1, 2, 4, 8]) {
        const bank = [...blanks, ...Array.from({ length: extra }, (_, i) => `はずれ${i}`)];
        for (let n = 0; n < 200; n += 1) {
          const shown = wordbankDisplayOrder({ id: `q${n}`, blanks, bank });
          expect(shown[0]).not.toBe(blanks[0]);
          expect(answerLeakScore(shown, blanks)).toBe(lowestLeakScore(holes));
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
    expect(answerLeakScore(shown, question.blanks)).toBe(lowestLeakScore(question.blanks.length));
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
    expect(answerLeakScore(chips, question.blanks)).toBe(lowestLeakScore(question.blanks.length));
  });
});
