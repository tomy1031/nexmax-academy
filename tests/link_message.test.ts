import { describe, expect, it } from "vitest";
import {
  ANSWERS_MESSAGE,
  DONE_MESSAGE,
  OWNS_DONE_MESSAGE,
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
