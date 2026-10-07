import { describe, expect, it } from "vitest";
import { emptyArticleBlock } from "@/components/studio/drafts";
import { articleBlockSchema, articleSchema } from "@/content/schema";
import {
  checkFormInput,
  composeFormAnswers,
  countBlanks,
  fillFormTemplate,
  formPrompt,
  groupFormEntries,
  parseFormTemplate,
  readPercent,
  type FormBlock,
} from "@/lib/answers/form-answers";
import { formAnswerRows, loadFormEntries, saveFormAnswers } from "@/lib/answers/form-answers-db";
import { createMemoryBackend } from "@/lib/progress/store";

/*
 * 記事の 書きこみフォーム（`form` ブロック）。2026-10-07 の 指定
 *「入力フォームを作って、学習の記録にデータが載るように」
 *「一度入れたものは入力フォームの下に本人が参照できるように」。
 *
 * DBへの 書き込みは 通信なので ここでは 見ない。見るのは **型の 切りかた・文の
 * 組み立て・行の 形**——ここが ずれると、記録は 入るのに 先生の 表で 文が 欠ける。
 */

const BLOCK: FormBlock = {
  kind: "form",
  title: "あなたの 朝礼を 書いて みよう",
  fields: [
    { id: "kinou", label: "①", title: "きのう したこと", template: "きのうは、＿＿＿＿しました。" },
    {
      id: "shinchoku",
      label: "②",
      title: "機能の 進捗",
      template: "＿＿＿＿機能の 進捗は、＿＿％です。",
    },
    {
      id: "mondai",
      label: "④",
      title: "問題",
      template: "＿＿＿＿で 問題が あります。今、＿＿＿＿して います。",
      none: "問題は ありません。",
    },
  ],
};

describe("型を 切る", () => {
  it("＿ の 続きが 1つの 欄。すぐ あとが ％ なら 数字の 欄", () => {
    expect(parseFormTemplate("＿＿＿＿機能の 進捗は、＿＿％です。")).toEqual([
      { kind: "blank", numeric: false },
      { kind: "text", text: "機能の 進捗は、" },
      { kind: "blank", numeric: true },
      { kind: "text", text: "％です。" },
    ]);
    expect(countBlanks("きのうは、＿＿しました。")).toBe(1);
    expect(countBlanks(BLOCK.fields[2]!.template)).toBe(2);
  });

  it("書いた ものを 型に 戻して 1文に する（前後の 空白は 落とす・全角の 数字は 半角に）", () => {
    expect(fillFormTemplate("＿＿＿＿機能の 進捗は、＿＿％です。", [" 商品一覧 ", "６０"])).toBe(
      "商品一覧機能の 進捗は、60％です。",
    );
  });

  it("％は 0〜100 の 整数だけ", () => {
    expect(readPercent("60")).toBe(60);
    expect(readPercent("１００")).toBe(100);
    expect(readPercent("0")).toBe(0);
    expect(readPercent("120")).toBeNull();
    expect(readPercent("６０％")).toBeNull();
    expect(readPercent("たくさん")).toBeNull();
    expect(readPercent("")).toBeNull();
  });
});

describe("出す 前の 見なおし（中身の 良し悪しは 見ない）", () => {
  it("空いて いる 欄と ％の 形だけを 言う", () => {
    expect(
      checkFormInput(BLOCK.fields, {
        kinou: { values: [""], none: false },
        shinchoku: { values: ["商品一覧", "200"], none: false },
        mondai: { values: ["画像", ""], none: false },
      }),
    ).toEqual({ kinou: "empty", shinchoku: "percent", mondai: "empty" });
  });

  it("「ない」を えらんだ 欄は 空でも よく、その 言い方で 残る", () => {
    const inputs = {
      kinou: { values: ["商品名と 値段を 表示"], none: false },
      shinchoku: { values: ["商品一覧", "60"], none: false },
      mondai: { values: ["", ""], none: true },
    };
    expect(checkFormInput(BLOCK.fields, inputs)).toEqual({});
    expect(composeFormAnswers(BLOCK.fields, inputs)).toEqual({
      kinou: "きのうは、商品名と 値段を 表示しました。",
      shinchoku: "商品一覧機能の 進捗は、60％です。",
      mondai: "問題は ありません。",
    });
  });
});

describe("記録の 行（quiz_results）", () => {
  it("教材＝記事、問い＝欄、こたえ＝組み立てた 1文。正解の 無い 自由記述として 残す", () => {
    const rows = formAnswerRows({
      profileId: "p1",
      articleId: "asakai_lecture",
      fields: BLOCK.fields,
      answers: { kinou: "きのうは、A しました。", mondai: "問題は ありません。" },
      attemptId: "a1",
    });
    expect(rows).toEqual([
      expect.objectContaining({
        quiz_set_id: "asakai_lecture",
        question_id: "kinou",
        question_index: 0,
        question_type: "free",
        answer_text: "きのうは、A しました。",
        correct: true,
        attempt_id: "a1",
        profile_id: "p1",
      }),
      expect.objectContaining({ question_id: "mondai", question_index: 2 }),
    ]);
  });

  it("先生の 画面の 問いは 札＋名前", () => {
    expect(formPrompt(BLOCK.fields[1]!)).toBe("② 機能の 進捗");
  });

  it("読み返しは 1回ずつ まとめて 新しい 順。ほかの 欄の 行は まざらない", () => {
    const entries = groupFormEntries(
      [
        {
          question_id: "kinou",
          answer_text: "古い",
          attempt_id: "old",
          created_at: "2026-10-01T01:00:00Z",
        },
        {
          question_id: "kinou",
          answer_text: "新しい",
          attempt_id: "new",
          created_at: "2026-10-07T01:00:00Z",
        },
        {
          question_id: "mondai",
          answer_text: "問題は ありません。",
          attempt_id: "new",
          created_at: "2026-10-07T01:00:00Z",
        },
        {
          question_id: "q1",
          answer_text: "別の 記録",
          attempt_id: "new",
          created_at: "2026-10-07T01:00:00Z",
        },
      ],
      BLOCK.fields.map((field) => field.id),
    );
    expect(entries.map((entry) => entry.id)).toEqual(["new", "old"]);
    expect(entries[0]!.answers).toEqual({ kinou: "新しい", mondai: "問題は ありません。" });
  });
});

describe("デモモード（鍵ゼロ）は 端末に 置いて、下の 一覧に 出る", () => {
  it("保存した ものが 新しい 順で 読める", async () => {
    const backend = createMemoryBackend();
    const first = await saveFormAnswers(
      { articleId: "asakai_lecture", fields: BLOCK.fields, answers: { kinou: "1回目" } },
      backend,
    );
    const second = await saveFormAnswers(
      { articleId: "asakai_lecture", fields: BLOCK.fields, answers: { kinou: "2回目" } },
      backend,
    );
    expect(first.ok && second.ok).toBe(true);
    const entries = await loadFormEntries("asakai_lecture", BLOCK.fields, backend);
    expect(entries?.map((entry) => entry.answers.kinou)).toEqual(["2回目", "1回目"]);
  });
});

describe("スキーマ", () => {
  it("型に ＿ が 無い 欄・id の かさなりは 通さない", () => {
    expect(
      articleBlockSchema.safeParse({
        kind: "form",
        fields: [{ id: "a", title: "題", template: "書く ところが 無い" }],
      }).success,
    ).toBe(false);
    expect(
      articleBlockSchema.safeParse({
        kind: "form",
        fields: [
          { id: "a", title: "題", template: "＿＿" },
          { id: "a", title: "題", template: "＿＿" },
        ],
      }).success,
    ).toBe(false);
    expect(articleBlockSchema.safeParse(BLOCK).success).toBe(true);
  });

  it("スタジオで 足した フォームは そのまま 保存できる", () => {
    expect(
      articleSchema.safeParse({
        kind: "article",
        id: "draft",
        title: "題",
        description: "説明",
        blocks: [emptyArticleBlock("form")],
      }).success,
    ).toBe(true);
  });
});
