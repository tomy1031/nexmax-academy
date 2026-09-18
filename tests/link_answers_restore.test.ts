import { describe, expect, it } from "vitest";
import { latestLinkAnswers } from "@/lib/answers/link-answers-db";
import { ANSWERS_MESSAGE, HELLO_MESSAGE, readLinkMessage } from "@/lib/answers/link-message";

/*
 * 調査（リサーチ）の こたえを **とどくまで 送り直し、空の 端末では 戻す** ところ。
 *
 * 2026-09-18 に DB の こたえが 0件と 分かった。ツールは 出した 瞬間に 1回だけ
 * 親へ 渡して いて、受け手が いない ときに 出した ものは 二度と 送られなかった。
 * いまは アプリが DB に 入れた ときだけ 1回の id（key）を 返し、ツールは それまで
 * 送り直す。同じ 中身は 同じ id で 送るので、送り直しても 行は 増えない。
 * 開くたびに「いま だれか」を 聞き、ちがう 人の 控えは 捨てる（教室の PC）。
 */

const LINK = "houkoku_search";
const UUID = "3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c";

describe("こたえの 合図の 1回の id（key）と 持ち主（owner）", () => {
  const answers = [{ id: "kaikyuu", text: "CEO" }];

  it("uuid の id と 持ち主を そのまま 受け取る", () => {
    expect(
      readLinkMessage({ type: ANSWERS_MESSAGE, id: LINK, answers, key: UUID, owner: "p1" }, LINK),
    ).toEqual({ kind: "answers", answers, key: UUID, owner: "p1" });
  });

  it("uuid で ない id は 捨てる（DB の 列が uuid。崩れた 形は 1回ぶんを 丸ごと 落とす）", () => {
    for (const key of [42, "", "k1", "x".repeat(101), null, `${UUID}x`]) {
      const message = readLinkMessage({ type: ANSWERS_MESSAGE, id: LINK, answers, key }, LINK);
      expect(message).toEqual({ kind: "answers", answers });
    }
  });

  it("形の おかしい 持ち主は 付けない（残すか どうかは 受け手が 決める）", () => {
    for (const owner of [42, "", "x".repeat(101), null]) {
      const message = readLinkMessage({ type: ANSWERS_MESSAGE, id: LINK, answers, owner }, LINK);
      expect(message).toEqual({ kind: "answers", answers });
    }
  });
});

describe("いま だれが 開いて いるか（hello）", () => {
  it("この 教材あての ときだけ 受ける", () => {
    expect(readLinkMessage({ type: HELLO_MESSAGE, id: LINK }, LINK)).toEqual({ kind: "hello" });
    // よその 教材・id 無しの 頼みに、この 学習者の こたえを 渡さない
    expect(readLinkMessage({ type: HELLO_MESSAGE, id: "hoka" }, LINK)).toBeNull();
    expect(readLinkMessage({ type: HELLO_MESSAGE }, LINK)).toBeNull();
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

  it("いちばん 新しい 回だけを、台帳の 順で 返す（その 1回の id も）", () => {
    expect(latestLinkAnswers(LINK, rows)).toEqual({
      answers: [
        { id: "kaikyuu_order", text: "社長　部長" },
        { id: "houkoku", text: "新しい 報告" },
      ],
      attemptId: "b",
    });
  });

  it("古い 回の 欄を 混ぜない（消した はずの 文を 生き返らせない）", () => {
    const ids = latestLinkAnswers(LINK, rows).answers.map((answer) => answer.id);
    expect(ids).not.toContain("joushi");
  });

  it("まだ 出して いない・台帳に 無い 教材では 空（id も 無い）", () => {
    expect(latestLinkAnswers(LINK, [])).toEqual({ answers: [], attemptId: null });
    expect(latestLinkAnswers("nazo", rows)).toEqual({ answers: [], attemptId: null });
  });
});
