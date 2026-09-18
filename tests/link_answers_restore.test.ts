import { describe, expect, it } from "vitest";
import { latestLinkAnswers } from "@/lib/answers/link-answers-db";
import {
  ANSWERS_MESSAGE,
  RESTORE_REQUEST_MESSAGE,
  readLinkMessage,
} from "@/lib/answers/link-message";

/*
 * 調査（リサーチ）の こたえを **とどくまで 送り直し、空の 端末では 戻す** ところ。
 *
 * 2026-09-18 に DB の こたえが 0件と 分かった。ツールは 出した 瞬間に 1回だけ
 * 親へ 渡して いて、受け手が いない ときに 出した ものは 二度と 送られなかった。
 * いまは アプリが DB に 入れた ときだけ 札（key）を 返し、ツールは それまで 送り直す。
 * 別の 端末・別の URL で 開いた ときは、DB の 最後の こたえを 戻す。
 */

const LINK = "houkoku_search";

describe("こたえの 合図の 札（key）", () => {
  it("札を そのまま 受け取る（返事に 付けて 返す ため）", () => {
    const answers = [{ id: "kaikyuu", text: "CEO" }];
    expect(readLinkMessage({ type: ANSWERS_MESSAGE, id: LINK, answers, key: "k1" }, LINK)).toEqual({
      kind: "answers",
      answers,
      key: "k1",
    });
  });

  it("形の おかしい 札は 捨てる（記録は 受ける。返事を 返さない だけ）", () => {
    const answers = [{ id: "kaikyuu", text: "CEO" }];
    for (const key of [42, "", "x".repeat(101), null]) {
      const message = readLinkMessage({ type: ANSWERS_MESSAGE, id: LINK, answers, key }, LINK);
      expect(message).toEqual({ kind: "answers", answers });
    }
  });
});

describe("前の こたえを ください", () => {
  it("この 教材あての ときだけ 受ける", () => {
    expect(readLinkMessage({ type: RESTORE_REQUEST_MESSAGE, id: LINK }, LINK)).toEqual({
      kind: "restore-request",
    });
    // よその 教材・id 無しの 頼みに、この 学習者の こたえを 渡さない
    expect(readLinkMessage({ type: RESTORE_REQUEST_MESSAGE, id: "hoka" }, LINK)).toBeNull();
    expect(readLinkMessage({ type: RESTORE_REQUEST_MESSAGE }, LINK)).toBeNull();
  });
});

describe("DB の 行から 最後の 1回ぶんを 取り出す", () => {
  /** 新しい 順（`readOwnQuizResultRows` と 同じ 並び）。 */
  const rows = [
    { question_id: "houkoku", answer_text: "新しい 報告", attempt_id: "b", created_at: "2" },
    { question_id: "kaikyuu_order", answer_text: "社長　部長", attempt_id: "b", created_at: "2" },
    { question_id: "kaikyuu_order", answer_text: "古い 並び", attempt_id: "a", created_at: "1" },
    { question_id: "joushi", answer_text: "古い 上司", attempt_id: "a", created_at: "1" },
  ];

  it("いちばん 新しい 回だけを、台帳の 順で 返す", () => {
    expect(latestLinkAnswers(LINK, rows)).toEqual([
      { id: "kaikyuu_order", text: "社長　部長" },
      { id: "houkoku", text: "新しい 報告" },
    ]);
  });

  it("古い 回の 欄を 混ぜない（消した はずの 文を 生き返らせない）", () => {
    const ids = latestLinkAnswers(LINK, rows).map((answer) => answer.id);
    expect(ids).not.toContain("joushi");
  });

  it("まだ 出して いない・台帳に 無い 教材では 空", () => {
    expect(latestLinkAnswers(LINK, [])).toEqual([]);
    expect(latestLinkAnswers("nazo", rows)).toEqual([]);
  });
});
