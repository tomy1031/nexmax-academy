import { describe, expect, it } from "vitest";
import {
  ANSWERS_MESSAGE,
  DONE_MESSAGE,
  OWNS_DONE_MESSAGE,
  PROGRESS_MESSAGE,
  PROGRESS_REQUEST_MESSAGE,
  parseProgressPosition,
  readLinkMessage,
} from "@/lib/answers/link-message";

/*
 * ツール教材から 親へ 届く 合図の 読み取り。
 *
 * ここは いま **関門の 鍵**（手押しの「おわりました」を 引っこめる）と
 * **学習者の こたえ**（先生の 画面に 残る）を 運んで いる。取りちがえの 害が
 * いちばん 大きい ところなのに、画面の 効果の 中に あって 通しでは 確かめにくい。
 */

const LINK = "houkoku_search";

describe("合図を 読む", () => {
  it("知らない 形・種別は 受けない", () => {
    expect(readLinkMessage(null, LINK)).toBeNull();
    expect(readLinkMessage("おわりました", LINK)).toBeNull();
    expect(readLinkMessage({ type: 42 }, LINK)).toBeNull();
    expect(readLinkMessage({ type: "nexmax:nanika", id: LINK }, LINK)).toBeNull();
  });

  it("鍵と 記録の 合図は **ID が 合って いる ときだけ** 受ける", () => {
    expect(readLinkMessage({ type: OWNS_DONE_MESSAGE, id: LINK }, LINK)).toEqual({
      kind: "owns-done",
    });
    // よその 教材の 名前／id 無し で 関門を 開けさせない
    expect(readLinkMessage({ type: OWNS_DONE_MESSAGE, id: "renraku_builder" }, LINK)).toBeNull();
    expect(readLinkMessage({ type: OWNS_DONE_MESSAGE }, LINK)).toBeNull();
    expect(readLinkMessage({ type: ANSWERS_MESSAGE, id: "hoka", answers: [] }, LINK)).toBeNull();
    expect(readLinkMessage({ type: ANSWERS_MESSAGE }, LINK)).toBeNull();
  });

  it("こたえは そのまま 手わたす（中身の 検査は `parseLinkAnswers` の 仕事）", () => {
    const answers = [{ id: "kaikyuu", text: "CEO" }];
    expect(readLinkMessage({ type: ANSWERS_MESSAGE, id: LINK, answers }, LINK)).toEqual({
      kind: "answers",
      answers,
    });
  });

  it("「おわった」だけは id が 無くても 受ける（id を 付けない 古い ページが ある）", () => {
    // public/tools/romaji/app.js は id を 付けずに 送る
    expect(readLinkMessage({ type: DONE_MESSAGE }, LINK)).toEqual({ kind: "done" });
    expect(readLinkMessage({ type: DONE_MESSAGE, id: LINK }, LINK)).toEqual({ kind: "done" });
    // ただし **ちがう id** が 付いて いれば 受けない
    expect(readLinkMessage({ type: DONE_MESSAGE, id: "hoka" }, LINK)).toBeNull();
  });
});

describe("1問ずつ 送る ツール（Renraku Master・2026-11-02）", () => {
  it("回の 鍵と「まるごとか」も そのまま 手わたす（形の 検査は 保存側）", () => {
    const answers = [{ id: "m1-q1", text: "@here", correct: true }];
    expect(
      readLinkMessage(
        { type: ANSWERS_MESSAGE, id: "renraku_slack", answers, attemptId: "x", fullSet: false },
        "renraku_slack",
      ),
    ).toEqual({ kind: "answers", answers, attemptId: "x", fullSet: false });
  });
});

describe("進み具合の 合図（相談の 練習問題・2026-11-17「状況はSupabase保存できるように」）", () => {
  const LINK_ID = "soudan_renshu";

  it("数だけの しおりを 受ける。status は completed 以外 started に そろえる", () => {
    expect(
      readLinkMessage(
        { type: PROGRESS_MESSAGE, id: LINK_ID, status: "completed", position: { open: 3, s1: 3 } },
        LINK_ID,
      ),
    ).toEqual({ kind: "progress", status: "completed", position: { open: 3, s1: 3 } });
    expect(
      readLinkMessage(
        { type: PROGRESS_MESSAGE, id: LINK_ID, status: "?", position: { s1: 1 } },
        LINK_ID,
      ),
    ).toEqual({ kind: "progress", status: "started", position: { s1: 1 } });
  });

  it("形の 崩れた しおり・よその 教材の 合図は まるごと 捨てる", () => {
    for (const position of [
      null,
      [],
      {},
      { s1: "3" },
      { S1: 3 },
      { s1: Number.NaN },
      { s1: 10_000_000 },
      Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, 1])),
    ]) {
      expect(
        readLinkMessage({ type: PROGRESS_MESSAGE, id: LINK_ID, position }, LINK_ID),
      ).toBeNull();
    }
    expect(
      readLinkMessage({ type: PROGRESS_MESSAGE, id: "hoka", position: { s1: 1 } }, LINK_ID),
    ).toBeNull();
    expect(parseProgressPosition({ intro: 1, open: 2, p5: 0 })).toEqual({
      intro: 1,
      open: 2,
      p5: 0,
    });
  });

  it("「記録から 戻して」は id が 合う ときだけ", () => {
    expect(readLinkMessage({ type: PROGRESS_REQUEST_MESSAGE, id: LINK_ID }, LINK_ID)).toEqual({
      kind: "progress-request",
    });
    expect(readLinkMessage({ type: PROGRESS_REQUEST_MESSAGE }, LINK_ID)).toBeNull();
  });
});
