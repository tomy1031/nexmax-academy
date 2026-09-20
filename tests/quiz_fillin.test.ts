import { describe, expect, it } from "vitest";
import { quizQuestionSchema, type QuizQuestion } from "@/content/schema";
import {
  checkFillin,
  correctAnswerText,
  draftAnswered,
  gradeDraft,
  quizDraftSchema,
} from "@/lib/quiz/draft";
import { fillinModelText, fillinSlots, fillinText } from "@/lib/quiz/fillin";

/**
 * 型の ある 文の うめこみ（`fillin`）— メールの 型を 自分で 打つ 問い
 *
 * 2026-09-20 に 連絡文の 練習を 別ページから もんだいへ 移した ときの 新しい 型。
 * ここで 固定するのは 3つ:
 *  1. **欄の 並び**（宛先 → 本文の 【 】）＝下書きの 並び。ずれると こたえが 1つ ずれて 記録される
 *  2. **採点は やさしい**（正解の ことばが 入って いれば 合格。前後に 足しても 落とさない）
 *  3. **ぜんぶ うめるまで「こたえた」に しない**（宛先の 無い メールは 送れない）
 */

function parse(question: unknown): Extract<QuizQuestion, { type: "fillin" }> {
  const result = quizQuestionSchema.parse(question);
  if (result.type !== "fillin") throw new Error("fillin ではない");
  return result;
}

const QUESTION = parse({
  id: "mail",
  type: "fillin",
  q: "メールを 完成させて ください。",
  explain: "【問題】【原因】が そろうと 相手は 動けます。",
  formTitle: "📧 メール作成",
  head: [
    { kind: "write", label: "宛先", answer: "システム管理部の 佐藤さん", placeholder: "だれに？" },
    { kind: "fixed", label: "件名", text: "【重要】システムエラーに ついて" },
  ],
  intro: "お疲れ様です。",
  blanks: [
    { label: "問題", answer: "ログインできない" },
    { label: "原因", answer: "サーバーの エラー" },
  ],
  outro: "よろしく お願い いたします。",
});

describe("fillin の 欄の 並び", () => {
  it("宛先（打つ 行）→ 本文の 【 】 の 順に ならぶ（件名は 打たないので 入らない）", () => {
    expect(fillinSlots(QUESTION).map((slot) => slot.label)).toEqual(["宛先", "問題", "原因"]);
    expect(fillinSlots(QUESTION).map((slot) => slot.area)).toEqual(["head", "body", "body"]);
  });

  it("AIには 1本の メールとして 渡す。空の 欄は「まだ」と 書いて 渡す", () => {
    const text = fillinText(QUESTION, ["佐藤さん", "", "サーバーの エラー"]);
    expect(text).toContain("宛先：佐藤さん");
    expect(text).toContain("件名：【重要】システムエラーに ついて");
    expect(text).toContain("【原因】サーバーの エラー");
    /*
     * 空の 欄を 黙って 抜くと、AIは 書けて いない ことに 気づかず
     * ブラッシュアップで 勝手に 埋める（言って いない 中身を 足さない）。
     */
    expect(text).toContain("【問題】（まだ 書いて いません）");
  });

  it("お手本は 欄の 正解から 組み立てる（同じ 文を 2か所に 持たない）", () => {
    expect(fillinModelText(QUESTION)).toContain("【問題】ログインできない");
    expect(fillinModelText(QUESTION)).toContain("宛先：システム管理部の 佐藤さん");
  });
});

describe("fillin の 採点", () => {
  const grade = (inputs: string[]) => gradeDraft(QUESTION, { kind: "fillin", inputs });

  it("そのまま 写せば 合格", () => {
    const result = grade(["システム管理部の 佐藤さん", "ログインできない", "サーバーの エラー"]);
    expect(result.correct).toBe(true);
    expect(result.earned).toBe(1);
  });

  it("前後に ことばが 付いても 落とさない（意味が つたわれば 合格）", () => {
    const result = grade([
      "システム管理部の 佐藤さん",
      "ユーザーが ログインできない こと",
      "サーバーの エラーです",
    ]);
    expect(result.correct).toBe(true);
  });

  it("足りない ものは 合格に しない（一部だけ 合って いる ときは「あと すこし」）", () => {
    const result = grade(["システム管理部の 佐藤さん", "ログイン", "サーバーの エラー"]);
    expect(result.correct).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.earned).toBe(0);
  });

  it("欄を 入れかえたら 通らない（どこに 入れるかが 問いの 中身）", () => {
    const result = grade(["システム管理部の 佐藤さん", "サーバーの エラー", "ログインできない"]);
    expect(result.correct).toBe(false);
  });

  it("1つも 書いて いない ときは 記録も 空（見送り）", () => {
    expect(grade(["", "", ""]).answer).toBe("");
  });

  it("記録は 穴うめと 同じ 形（（1）…　（2）…）で 残す", () => {
    const result = grade(["佐藤さん", "ログインできない", ""]);
    expect(result.answer).toBe("（1）佐藤さん　（2）ログインできない　（3）");
    expect(correctAnswerText(QUESTION)).toBe(
      "（1）システム管理部の 佐藤さん　（2）ログインできない　（3）サーバーの エラー",
    );
  });
});

describe("fillin の こたえた 判定と 答え合わせ", () => {
  it("1つでも 空なら「まだ」（宛先の 無い メールは 送れない）", () => {
    expect(draftAnswered(QUESTION, { kind: "fillin", inputs: ["佐藤さん", "あ", ""] })).toBe(false);
    expect(draftAnswered(QUESTION, { kind: "fillin", inputs: ["佐藤さん", "あ", "い"] })).toBe(
      true,
    );
  });

  it("欄ごとに ○✗ を 返す（まちがえた ところに 正しい ことばを 置く）", () => {
    const answer = gradeDraft(QUESTION, {
      kind: "fillin",
      inputs: ["システム管理部の 佐藤さん", "ログイン", ""],
    }).answer;
    const checks = checkFillin(QUESTION, answer);
    expect(checks.map((check) => check.ok)).toEqual([true, false, false]);
    expect(checks[1]).toMatchObject({ label: "問題", own: "ログイン", right: "ログインできない" });
    // 書いて いない 欄は 空で 返す（「…」の 見た目に なる）
    expect(checks[2]?.own).toBe("");
  });

  it("採点が 合格なら 欄は ぜんぶ ○（画面が 自分に 矛盾しない）", () => {
    const checks = checkFillin(QUESTION, "（1）ちがう　（2）ちがう　（3）ちがう", true);
    expect(checks.every((check) => check.ok)).toBe(true);
  });

  it("下書きの 形は 保存から 読み直せる（開き直しても 消えない）", () => {
    const draft = { kind: "fillin", inputs: ["佐藤さん", "", ""] };
    expect(quizDraftSchema.safeParse(draft).success).toBe(true);
  });
});
