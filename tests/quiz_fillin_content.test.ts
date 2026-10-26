import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quizSetSchema, type QuizQuestion } from "@/content/schema";
import { createQuizSession, quizReducer } from "@/components/quiz/quiz-reducer";
import {
  parseQuizReview,
  buildQuizReviewPrompt,
  type QuizReviewContext,
} from "@/lib/quiz/ai-review";
import { checkFillin, fillinSlotAiMayAccept, fillinSlotOk } from "@/lib/quiz/draft";
import { fillinSlots, type FillinSlot } from "@/lib/quiz/fillin";

/**
 * メールの 欄を **中身で** 見る（2026-10-26 の 指定）
 *
 * 「AIのチェックが厳密すぎる。１言１句ではなく、内容を捉えられているかを確認するように
 *  してほしい。例（これは誤りではない）正解：システム管理部の佐藤さん 誤り：システム管理部佐藤さん」
 *
 * ここで 固定するのは 3つ:
 *  1. **アプリの ⭕**は 助詞・呼び方・ていねいな 形・時刻の 書き方の ちがいでは 落とさない。
 *     数字・日にち・打ち消しが ちがう もの、中身の かたまりが 欠けた ものは ✗
 *  2. アプリが ✗に した 欄は **AIが 中身で ⭕に できる**。ただし 数字・日にちが ちがう 欄と、
 *     メモを 丸ごと 貼った 欄は AIにも 渡さない。⭕を ✗には できない
 *  3. AIが ⭕に した 問いは、出した ときの **点も ⭕**（答え合わせで ✗が 出ない）
 */

const slot = (answer: string): FillinSlot => ({ label: "欄", answer, accept: [], area: "body" });
const ok = (answer: string, written: string) => fillinSlotOk(slot(answer), written);
const aiMay = (answer: string, written: string) => fillinSlotAiMayAccept(slot(answer), written);

describe("アプリの ⭕：1字1句 同じで なくて よい", () => {
  it.each([
    // 指定の 例
    ["システム管理部の 佐藤さん", "システム管理部佐藤さん"],
    // 呼び方の ちがい・順番の ちがい
    ["システム管理部の 佐藤さん", "システム管理部 佐藤様"],
    ["システム管理部の 佐藤さん", "佐藤さん（システム管理部）"],
    ["株式会社さくらデザインの 鈴木様", "さくらデザインの鈴木さん"],
    ["株式会社グローバル商事の 田中マネージャー", "株式会社グローバル商事 田中様"],
    ["インフラ開発部の みんな", "インフラ開発部の皆さん"],
    ["全社員", "全社員の皆様"],
    ["品質管理（QA）チームの 皆様", "品質管理チームの皆様"],
    ["営業部の 渡辺部長", "営業部の渡辺さん"],
    // ていねいな 形・助詞を 足す／抜く
    ["ログインできない", "ログインできません"],
    ["ログインできない", "ログインができない"],
    ["サーバーの エラー", "サーバーエラー"],
    ["画像ファイルが 壊れて いる", "画像ファイルが壊れています"],
    ["画像ファイルが 壊れて いる", "画像ファイルが壊れてる"],
    ["わからない 単語は 必ず 質問する こと", "わからない単語は必ず質問してください"],
    ["テストに もう 少し 時間が 必要なため", "テストに少し時間が必要なため"],
    // 時刻・日にちの 書き方
    ["今日の 15:00", "15時"],
    ["今日の 15:00", "本日15時"],
    ["今日の 15:00", "午後3時"],
    ["明日の 朝 9:00", "明日の9時"],
    ["13:00開始", "13時開始"],
    ["今週の 金曜日", "今週金曜日"],
    ["今週の 金曜日の 18:00", "今週金曜18時"],
    ["5月10日", "5/10"],
  ])("「%s」に「%s」は ⭕", (answer, written) => {
    expect(ok(answer, written)).toBe(true);
  });

  it.each([
    // 中身の かたまりが 欠けて いる
    ["システム管理部の 佐藤さん", "佐藤さん"],
    ["システム管理部の 佐藤さん", "システム管理部"],
    ["ログインできない", "ログイン"],
    // 反対の 意味
    ["ログインできない", "ログインできる"],
    ["スマホ版も 確認する こと", "スマホ版は確認しない"],
    ["スマホ版は テストしなくて いい こと", "スマホ版もテストすること"],
    // 数字・日にちが ちがう（変更前と 変更後の 取りちがえ）
    ["今日の 15:00", "今日の16:00"],
    ["今日の 15:00", "明日の15:00"],
    ["今週の 金曜日", "来週の月曜日"],
    ["5月10日", "5月15日"],
    ["今週の 金曜日の 18:00", "金曜日の18:00"],
    // ちがう もの
    ["サーバーの エラー", "ネットワークのエラー"],
  ])("「%s」に「%s」は ✗", (answer, written) => {
    expect(ok(answer, written)).toBe(false);
  });

  it("メモを 丸ごと 貼った ものは 通らない（長さの 見張りは 中身の 見かたにも 効く）", () => {
    const memo =
      "システム管理部の 佐藤さんに メールを お願い！ さっきから ログインできない って ユーザーから 連絡が 来てるんだ。調べたら サーバーの エラーが 原因みたい。急いで 対応中で、今日の 15:00には 直る 予定です。";
    expect(ok("システム管理部の 佐藤さん", memo)).toBe(false);
    expect(aiMay("システム管理部の 佐藤さん", memo)).toBe(false);
  });
});

describe("教材の 正解（連絡文の 練習・初級）", () => {
  const raw = readFileSync(
    join(__dirname, "..", "content", "quizsets", "renraku_contact_quiz.json"),
    "utf8",
  );
  const mails = quizSetSchema
    .parse(JSON.parse(raw))
    .questions.filter((q): q is Extract<QuizQuestion, { type: "fillin" }> => q.type === "fillin");

  it("正解は スペースを 抜いても ⭕（学生は 分かち書きで 打たない）", () => {
    // 教材が 読めて いない と 下の 2つは 何も 見ずに 通る
    expect(mails.length).toBeGreaterThanOrEqual(10);
    const missed = mails.flatMap((q) =>
      fillinSlots(q)
        .filter((s) => !fillinSlotOk(s, s.answer.replace(/\s+/g, "")))
        .map((s) => `${q.id} ${s.label}`),
    );
    expect(missed).toEqual([]);
  });

  it("となりの 欄の 正解を 入れても ⭕に ならない（どこに 入れるかが 問いの 中身）", () => {
    const leaked = mails.flatMap((q) => {
      const slots = fillinSlots(q);
      return slots.flatMap((s, i) =>
        slots
          .filter((_, j) => j !== i)
          .filter((other) => fillinSlotOk(s, other.answer))
          .map((other) => `${q.id} ${s.label} ← ${other.answer}`),
      );
    });
    expect(leaked).toEqual([]);
  });
});

describe("AIが 中身で 見て よい 欄", () => {
  it("言いかえ・省略は AIに 渡す（アプリでは 見分けられない）", () => {
    expect(ok("ネットワークの システム障害", "ネットワーク障害")).toBe(false);
    expect(aiMay("ネットワークの システム障害", "ネットワーク障害")).toBe(true);
    expect(aiMay("明日の ミーティング", "明日の会議")).toBe(true);
  });

  it("数字・日にちが ちがう 欄は AIにも 渡さない", () => {
    expect(aiMay("今日の 15:00", "今日の16:00")).toBe(false);
    expect(aiMay("明日の 朝 9:00", "今日の9:00")).toBe(false);
    expect(aiMay("今週の 金曜日", "来週の月曜日")).toBe(false);
    expect(aiMay("ユーザー向け説明書の 3ページから 5ページ", "説明書の3〜5ページ")).toBe(true);
    expect(aiMay("ユーザー向け説明書の 3ページから 5ページ", "説明書の3〜6ページ")).toBe(false);
  });

  it("空の 欄は 渡さない", () => {
    expect(aiMay("全社員", "  ")).toBe(false);
  });
});

describe("AIの 返事の 読み取り（欄）", () => {
  const context: QuizReviewContext = {
    question: "メールを 完成させて ください。",
    scene: "",
    model: "",
    note: "",
    itemKind: "field",
    items: [
      { id: "f1", label: "宛先", value: "全員", answer: "全社員", ok: false, aiJudges: true },
      { id: "f2", label: "問題", value: "16:00", answer: "15:00", ok: false, aiJudges: false },
      { id: "f3", label: "原因", value: "サーバー", answer: "サーバー", ok: true },
    ],
    written: "",
  };

  it("「中身で 見て」の 欄だけ、AIの ⭕で ⭕に なる", () => {
    const review = parseQuizReview(
      {
        ok: true,
        items: [
          { id: "f1", ok: true, note: "" },
          { id: "f2", ok: true, note: "" },
          { id: "f3", ok: false, note: "" },
        ],
        polished: "",
      },
      context,
    );
    // f2 は 数字が ちがうので AIでも ⭕に しない。f3 の ⭕は AIが ✗と 言っても 動かない
    expect(review?.items.map((one) => one.ok)).toEqual([true, false, true]);
    expect(review?.ok).toBe(false);
  });

  it("AIが ✗と 言えば ✗の まま", () => {
    const review = parseQuizReview(
      { ok: false, items: [{ id: "f1", ok: false, note: "" }], polished: "" },
      { ...context, items: [context.items[0]!] },
    );
    expect(review?.items[0]?.ok).toBe(false);
  });

  it("頼みの 文で「中身で 見て」の 欄を 名指しし、1字1句で 見ないと 伝える", () => {
    const prompt = buildQuizReviewPrompt(context);
    expect(prompt).toContain("- f1（宛先）: ✗（中身で 見て ください）");
    expect(prompt).toContain("- f2（問題）: ✗ /");
    expect(prompt).toContain("1字1句 同じで なくて よい");
  });
});

describe("出した ときの 点は こたえの チェックの ⭕に そろえる", () => {
  const set = quizSetSchema.parse({
    kind: "quizset",
    id: "fillin_checked_fixture",
    title: "メール",
    description: "こたえの チェックの ⭕と 点を そろえる",
    questions: [
      {
        id: "mail",
        type: "fillin",
        q: "メールを 完成させて ください。",
        explain: "原因を 書きます。",
        head: [{ kind: "write", label: "宛先", answer: "全社員" }],
        blanks: [{ label: "原因", answer: "ネットワークの システム障害" }],
      },
    ],
  });
  const written = (checked?: string[]) => {
    const answered = quizReducer(createQuizSession(set, set.questions, "all"), {
      type: "answerFillin",
      questionId: "mail",
      inputs: ["全社員", "ネットワーク障害"],
    });
    return quizReducer(answered, { type: "submit", checked });
  };

  it("チェックで ⭕に なった 問いは ⭕で 記録し、答え合わせも ぜんぶ ○", () => {
    const result = written(["mail"]).results[0]!;
    expect(result.correct).toBe(true);
    expect(result.earned).toBe(1);
    const question = set.questions[0] as Extract<QuizQuestion, { type: "fillin" }>;
    expect(checkFillin(question, result.answer, result.correct).every((one) => one.ok)).toBe(true);
  });

  it("チェックを 通って いない 問いは これまでどおり 字で 採点する", () => {
    expect(written().results[0]?.correct).toBe(false);
  });
});
