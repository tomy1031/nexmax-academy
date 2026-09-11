import { describe, expect, it } from "vitest";
import { LINK_ANSWER_PROMPTS } from "@/content/link-answers";
import { linkAnswerRows, parseLinkAnswers } from "@/lib/answers/link-answers-db";

/*
 * ツール教材（link）に 書いた こたえを、先生の 画面（`/admin/records`）へ 届ける ところ。
 * 2026-09-11 の 指定「B: 先生の 画面（/admin）へ 届ける」。
 *
 * DBへの 書き込みは 通信なので ここでは 見ない。見るのは **行の 組み立て**——
 * ここが ずれると、記録は 入るのに 先生の 画面で 意味の 無い 行に なる
 *（並びが ちがう・問いの 文が 引けない・他人の 欄が 混ざる）。
 */

const LINK = "houkoku_search";

describe("ツールから 届く こたえ", () => {
  it("形の 合わない ものは 捨てる（外から 来る ものを 信じない）", () => {
    expect(parseLinkAnswers(null)).toEqual([]);
    expect(parseLinkAnswers("こたえ")).toEqual([]);
    expect(
      parseLinkAnswers([
        { id: "kaikyuu", text: "CEO" },
        { id: "", text: "空の id" },
        { id: "houkoku", text: 3 },
        "文字列",
        { text: "id が 無い" },
      ]),
    ).toEqual([{ id: "kaikyuu", text: "CEO" }]);
  });
});

describe("記録の 行に する", () => {
  const answers = [
    { id: "joushi", text: "The boss is closer." },
    { id: "kaikyuu_order", text: "社長　取締役　部長" },
    { id: "kaikyuu", text: "CEO, manager, staff" },
    { id: "houkoku", text: "We report only when there is a problem." },
  ];
  const rows = linkAnswerRows({
    profileId: "p1",
    linkId: LINK,
    answers,
    attemptId: "a1",
  });

  it("台帳の 順に ならべる（届いた 順では ない）", () => {
    // 先生の 画面の Q1・Q2… は この 番号で 並ぶ
    expect(rows.map((row) => row.question_id)).toEqual(Object.keys(LINK_ANSWER_PROMPTS[LINK]!));
    expect(rows.map((row) => row.question_index)).toEqual([0, 1, 2, 3]);
  });

  it("こたえの 文を そのまま 残す（正解は 無いので 採点しない）", () => {
    const order = rows.find((row) => row.question_id === "kaikyuu_order");
    expect(order?.answer_text).toBe("社長　取締役　部長");
    expect(order?.question_type).toBe("free");
    expect(order?.correct).toBe(true);
    expect(order?.earned).toBe(order?.max_points);
  });

  it("1回の 挑戦として まとまる（教材の id で 引ける）", () => {
    for (const row of rows) {
      expect(row.attempt_id).toBe("a1");
      expect(row.profile_id).toBe("p1");
      expect(row.quiz_set_id).toBe(LINK);
      expect(row.full_set).toBe(true);
    }
  });

  it("台帳に 無い id は 落とす（問いの 文の 無い 行を 先生に 見せない）", () => {
    const extra = linkAnswerRows({
      profileId: "p1",
      linkId: LINK,
      answers: [{ id: "nazono_ran", text: "？" }, ...answers],
      attemptId: "a1",
    });
    expect(extra.map((row) => row.question_id)).not.toContain("nazono_ran");
  });

  it("書かなかった 欄は 行に しない（空の 行を 増やさない）", () => {
    const few = linkAnswerRows({
      profileId: "p1",
      linkId: LINK,
      answers: [{ id: "kaikyuu_order", text: "社長" }],
      attemptId: "a1",
    });
    expect(few).toHaveLength(1);
    expect(few[0]?.question_index).toBe(0);
  });

  it("知らない 教材では 1行も 作らない", () => {
    expect(linkAnswerRows({ profileId: "p1", linkId: "nazo", answers, attemptId: "a1" })).toEqual(
      [],
    );
  });
});
