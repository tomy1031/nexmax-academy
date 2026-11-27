import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { quizSetSchema, type QuizQuestion } from "@/content/schema";
import { AiReviewCard } from "@/components/quiz/ai-review-card";
import type { AnswerCheck } from "@/components/quiz/answer-check";
import {
  buildQuizReviewPrompt,
  fieldAfter,
  parseQuizReview,
  reviewWithoutAi,
  type QuizReviewContext,
} from "@/lib/quiz/ai-review";
import { fillinSlotAiMayAccept, fillinSlotMiss, fillinSlotOk } from "@/lib/quiz/draft";
import { fillinSlots, type FillinSlot } from "@/lib/quiz/fillin";
import { answerReadings } from "@/lib/quiz/fillin-match";
import { buildFuriganaIndex, kanaOf } from "@/lib/text/furigana";

/**
 * 連絡文の 練習（初級：メール）— **ひらがな・カタカナで 書いた 答えも ⭕**と、
 * **✗の わけを はっきり 出す**（2026-11-27 の 指定）
 *
 * 「連絡文の練習のclaudeの判定が厳密すぎます。もう少しひらがなを使っていたりカタカナを
 *  使っているものは許容して欲しいです。何が間違っているのか明確になるようなメッセージを
 *  表示するようにしてください。」
 *
 * ここで 固定するのは:
 *  1. 漢字の ことばを かな（ひらがな・カタカナ）で 書いた 欄は、アプリの ⭕に なる
 *     （教材の 読み辞書で 正解の 漢字を 読みに そろえて くらべる）。時刻・日・朝夜の かなも
 *  2. かなで 書いても、中身が ちがう もの（数字・日・朝夜・打ち消し・ことば）は ✗の まま
 *  3. ✗の 欄には **わけ**が 付く（数字が ちがう・となりの 欄の 中身・ことばが 足りない …）
 *  4. AIへの 頼みに「字の 種類は 見ない」と 書いて ある（Claude・Gemini 共通の 文）
 *  5. 「なおすところ」に どの 欄の 話か（【宛先】）と わけが 出る。AIに つながらなくても 出る
 */

const raw = readFileSync(
  join(__dirname, "..", "content", "quizsets", "renraku_contact_quiz.json"),
  "utf8",
);
const set = quizSetSchema.parse(JSON.parse(raw));
const index = buildFuriganaIndex(set.furigana ?? []);
const mails = set.questions.filter(
  (q): q is Extract<QuizQuestion, { type: "fillin" }> => q.type === "fillin",
);
const mail = (id: string) => mails.find((q) => q.id === id)!;
const slotOf = (id: string, label: string) => fillinSlots(mail(id)).find((s) => s.label === label)!;
const readingsOf = (slot: FillinSlot) => answerReadings([slot.answer, ...slot.accept], index);
const ok = (id: string, label: string, written: string) => {
  const slot = slotOf(id, label);
  return fillinSlotOk(slot, written, readingsOf(slot));
};
const missOf = (id: string, label: string, written: string) => {
  const slots = fillinSlots(mail(id));
  const at = slots.findIndex((s) => s.label === label);
  return fillinSlotMiss(slots, at, written, slots.map(readingsOf));
};

/** ひらがなを カタカナに（学生が カタカナで 打った 形）。 */
const katakana = (value: string) =>
  [...value]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : ch;
    })
    .join("");

describe("かなで 書いた 欄は ⭕（教材の 正解 ぜんぶ）", () => {
  /*
   * 学生が 打つ かなを 教材の 読み辞書から 作る。数字は 数字の まま（「月15日」を
   *「がつじゅうごにち」に しない——学生は 数字で 打つ）。月・日は がつ・にち で 打つ。
   */
  const studentIndex = buildFuriganaIndex([
    ...(set.furigana ?? []).filter(([surface]) => !/\d/.test(surface)),
    ["月", "がつ"],
    ["日", "にち"],
  ]);

  it("正解を ぜんぶ ひらがなで 書いても、ぜんぶ カタカナで 書いても ⭕", () => {
    expect(mails.length).toBeGreaterThanOrEqual(10);
    const missed: string[] = [];
    let checked = 0;
    for (const q of mails) {
      for (const slot of fillinSlots(q)) {
        const kana = kanaOf(slot.answer.replace(/\s+/g, ""), studentIndex);
        if (kana === null) continue; // 辞書で 読めない 漢字が 残る 正解は ここでは 見ない
        checked += 1;
        for (const written of [kana, katakana(kana)]) {
          if (!fillinSlotOk(slot, written, readingsOf(slot))) {
            missed.push(`${q.id} ${slot.label}: ${written}`);
          }
        }
      }
    }
    // 何も 見ずに 通らない ように（正解の ほとんどは 辞書で 読める）
    expect(checked).toBeGreaterThanOrEqual(30);
    expect(missed).toEqual([]);
  });

  it.each([
    ["mail_1", "宛先", "しすてむかんりぶのさとうさん"],
    ["mail_1", "宛先", "システムカンリブノサトウサン"],
    ["mail_1", "宛先", "システム管理部のさとうさん"],
    ["mail_1", "宛先", "しすてむ管理部 サトウ様"],
    ["mail_1", "問題", "ろぐいんできません"],
    ["mail_1", "原因", "さーばーのえらー"],
    ["mail_1", "直る予定", "きょうの15じ"],
    ["mail_1", "直る予定", "ほんじつ ごご3じ"],
    ["mail_2", "宛先", "さくらでざいんのすずきさま"],
    ["mail_2", "原因", "がぞうふぁいるがこわれています"],
    ["mail_3", "直る予定", "あしたのあさ9じ"],
    ["mail_3", "直る予定", "アシタ アサ 9ジ"],
    ["mail_4", "変更前", "13じかいし"],
    ["mail_5", "変更前", "こんしゅうのきんようび"],
    ["mail_5", "変更後", "らいしゅうのげつようび"],
    ["mail_6", "変更後", "5がつ15にち"],
    ["mail_6", "変更前", "5がつとおか"],
    ["mail_9", "期限", "こんしゅうきんようびの18じ"],
    ["mail_9", "期限", "今週の金曜日の午後6時"],
  ])("%s【%s】に「%s」は ⭕", (id, label, written) => {
    expect(ok(id, label, written)).toBe(true);
  });

  it("読み辞書を 渡さない 採点（字の まま）は これまでどおり", () => {
    const slot = slotOf("mail_1", "宛先");
    expect(fillinSlotOk(slot, "しすてむかんりぶのさとうさん")).toBe(false);
    expect(fillinSlotOk(slot, "システム管理部の佐藤さん")).toBe(true);
  });
});

describe("かなで 書いても、中身が ちがえば ✗", () => {
  it.each([
    ["mail_1", "宛先", "さとうさん"],
    ["mail_1", "宛先", "しすてむかんりぶ"],
    ["mail_1", "問題", "ろぐいんできる"],
    ["mail_1", "原因", "さーばーのえらーではない"],
    ["mail_1", "原因", "ねっとわーくのえらー"],
    ["mail_1", "直る予定", "きょうの16じ"],
    ["mail_1", "直る予定", "あしたの15じ"],
    ["mail_3", "直る予定", "あしたのよる9じ"],
    ["mail_5", "変更後", "こんしゅうのきんようび"],
    ["mail_6", "変更後", "5がつ10にち"],
  ])("%s【%s】に「%s」は ✗", (id, label, written) => {
    expect(ok(id, label, written)).toBe(false);
  });

  it("かなで 書いた 日時が ちがう 欄は AIにも 渡さない", () => {
    const slot = slotOf("mail_3", "直る予定");
    expect(fillinSlotAiMayAccept(slot, "あしたのよる9じ", readingsOf(slot))).toBe(false);
    expect(fillinSlotAiMayAccept(slot, "きょうのあさ9じ", readingsOf(slot))).toBe(false);
  });

  it("メモを 丸ごと 貼った ものは かなでも 通らない", () => {
    const memo = kanaOf(mail("mail_1").scene!.text.replace(/\s+/g, ""), index) ?? "";
    expect(memo.length).toBeGreaterThan(40);
    expect(ok("mail_1", "宛先", memo)).toBe(false);
  });
});

describe("✗の わけ", () => {
  it.each([
    ["mail_1", "直る予定", "今日の16:00", "number"],
    ["mail_1", "直る予定", "きょう", "numberMissing"],
    ["mail_1", "直る予定", "明日の15:00", "day"],
    ["mail_3", "直る予定", "明日の夜9時", "part"],
    ["mail_3", "直る予定", "あしたのよる9じ", "part"],
    ["mail_1", "問題", "ログインできる", "negation"],
    ["mail_1", "宛先", "佐藤さん", "words"],
    ["mail_1", "宛先", "さとうさん", "words"],
  ])("%s【%s】に「%s」は %s", (id, label, written, kind) => {
    expect(missOf(id, label, written)).toEqual({ kind });
  });

  it("となりの 欄の 中身を 書いたら、どの 欄の 中身かを 言う（変更前と 変更後の 入れちがい）", () => {
    expect(missOf("mail_4", "変更前", "15:00")).toEqual({ kind: "otherSlot", label: "変更後" });
    expect(missOf("mail_4", "変更後", "13じかいし")).toEqual({
      kind: "otherSlot",
      label: "変更前",
    });
  });

  it("メモを そのまま 写した ものは copied、中身は 合って いるが 長すぎる ものは tooLong", () => {
    const memo = mail("mail_1").scene!.text;
    expect(missOf("mail_1", "宛先", memo)).toEqual({ kind: "copied" });
    expect(missOf("mail_4", "変更後", "15:00に なりますので、よろしく おねがい します")).toEqual({
      kind: "tooLong",
    });
  });

  it("自分で 組み立てた 文に、正解に 無い 日を 書いた ことを わけに しない", () => {
    // 正解は「15:00」。「明日の」は メモの とおりで、まちがいでは ない（2026-11-18 の 指定）
    expect(missOf("mail_4", "変更後", "明日の16:00開始に変更")).toEqual({ kind: "number" });
  });

  it("⭕の 欄は わけ 無し", () => {
    expect(missOf("mail_1", "宛先", "しすてむかんりぶのさとうさん")).toBeNull();
  });
});

describe("直した 形（？？？）は かなで 書いた ことばを 書いて ある と みる", () => {
  const slot = slotOf("mail_1", "宛先");
  it.each([
    ["さとうさん", "？？？の 佐藤さん"],
    ["しすてむかんりぶ", "システム管理部の ？？？"],
    ["しすてむかんりぶのさとさん", "システム管理部の ？？？"],
  ])("「%s」→「%s」", (value, expected) => {
    expect(fieldAfter(slot.answer, value, readingsOf(slot))).toBe(expected);
  });
});

describe("AIへの 頼み（Claude・Gemini 共通）", () => {
  const context: QuizReviewContext = {
    question: "メールを 完成させて ください。",
    scene: "",
    model: "",
    note: "",
    itemKind: "field",
    items: [
      {
        id: "f1",
        label: "宛先",
        value: "しすてむかんりの さとうさん",
        answer: "システム管理部の 佐藤さん",
        ok: false,
        aiJudges: true,
      },
    ],
    written: "宛先：しすてむかんりの さとうさん",
  };

  it("字の 種類（漢字・ひらがな・カタカナ）では ✗に しないと 伝える", () => {
    const prompt = buildQuizReviewPrompt(context);
    expect(prompt).toContain("**字の 種類（漢字・ひらがな・カタカナ）は 見ません**");
    expect(prompt).toContain("読みが 同じなら 同じ 中身で ⭕です");
    expect(prompt).toContain("「漢字で 書いて いない」「カタカナで 書く」は ✗の 理由にも");
    // 欄を 中身で 見る ときにも
    expect(prompt).toContain("漢字を ひらがな・カタカナで 書いた もの");
  });

  it("Slack（観点）の 頼みにも 同じ 決まりが 入る", () => {
    const prompt = buildQuizReviewPrompt({
      ...context,
      itemKind: "point",
      items: [{ id: "ketsuron", label: "1行目で 何の 連絡かが 分かる" }],
    });
    expect(prompt).toContain("**字の 種類（漢字・ひらがな・カタカナ）は 見ません**");
  });
});

describe("なおすところの 見出し", () => {
  const furigana = buildFuriganaIndex([]);
  const plain = (html: string) => html.replace(/<rt>.*?<\/rt>/g, "").replace(/<[^>]+>/g, "");
  const render = (check: AnswerCheck, fallback = "") =>
    plain(
      renderToStaticMarkup(
        createElement(AiReviewCard, {
          check,
          labels: new Map([
            ["f1", "宛先"],
            ["ketsuron", "1行目で 何の 連絡かが 分かる"],
          ]),
          furigana,
          aiFurigana: furigana,
          gated: true,
          fallback,
        }),
      ),
    );
  const base = { ok: false, of: "", aiNote: "", polished: "" };

  it("欄は【欄の 名前】と アプリの わけを 出し、AIの ひとことを 下に 添える", () => {
    const text = render({
      ...base,
      items: [
        {
          id: "f1",
          ok: false,
          note: "部署の 名前が ありません。",
          reason: "下の ？？？の ところの ことばが 足りないか、メモと ちがいます。",
          before: "佐藤さん",
          after: "？？？の 佐藤さん",
        },
      ],
    });
    expect(text).toContain("【宛先】");
    const reasonAt = text.indexOf("下の ？？？の ところの ことばが 足りないか");
    const noteAt = text.indexOf("部署の 名前が ありません。");
    expect(reasonAt).toBeGreaterThan(text.indexOf("【宛先】"));
    expect(noteAt).toBeGreaterThan(reasonAt);
    expect(text).toContain("？？？の 佐藤さん");
  });

  it("観点（Slack）も【観点の 名前】を 出して から AIの ひとこと", () => {
    const text = render({
      ...base,
      items: [{ id: "ketsuron", ok: false, note: "何の 連絡かが わかりません。" }],
    });
    expect(text).toContain("【1行目で 何の 連絡かが 分かる】");
    expect(text.indexOf("何の 連絡かが わかりません。")).toBeGreaterThan(
      text.indexOf("【1行目で 何の 連絡かが 分かる】"),
    );
  });

  it("AIに つながらなくても、アプリの わけと 直した 形が 出る", () => {
    const review = reviewWithoutAi(
      [
        {
          id: "f1",
          label: "宛先",
          value: "さとうさん",
          answer: "システム管理部の 佐藤さん",
          ok: false,
          reason: "下の ？？？の ところの ことばが 足りないか、メモと ちがいます。",
          readings: readingsOf(slotOf("mail_1", "宛先")),
        },
      ],
      false,
    );
    expect(review.items[0]).toMatchObject({
      ok: false,
      reason: "下の ？？？の ところの ことばが 足りないか、メモと ちがいます。",
      before: "さとうさん",
      after: "？？？の 佐藤さん",
    });
    const text = render({ ...base, ...review, aiNote: "x" }, "メモの ことばと ちがうようです。");
    expect(text).toContain("【宛先】");
    expect(text).toContain("足りないか、メモと ちがいます。");
    // わけが ある ときは 逃げ道の 1行は 出さない
    expect(text).not.toContain("ちがうようです");
  });

  it("AIの 返事を 読んでも アプリの わけは 残る", () => {
    const review = parseQuizReview(
      { ok: false, items: [{ id: "f1", ok: false, note: "部署が ありません。" }], polished: "" },
      {
        itemKind: "field",
        items: [
          {
            id: "f1",
            label: "宛先",
            value: "さとうさん",
            answer: "システム管理部の 佐藤さん",
            ok: false,
            reason: "わけ",
          },
        ],
        written: "宛先：さとうさん",
      },
    );
    expect(review?.items[0]).toMatchObject({ reason: "わけ", note: "部署が ありません。" });
  });
});
