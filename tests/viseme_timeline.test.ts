import { describe, expect, it } from "vitest";

import { visemeAt, visemeTimeline } from "@/lib/meeting/viseme-timeline";

describe("visemeTimeline — セリフを 1モーラ 1コマに 並べる", () => {
  it("ひらがなは 母音の 形に なる", () => {
    expect(visemeTimeline("おはよう")).toEqual(["o", "a", "o", "u"]);
  });

  it("小さい ゃゅょ は 前の 字と 1コマ（きょう＝2コマ）", () => {
    expect(visemeTimeline("きょう")).toEqual(["o", "u"]);
  });

  it("カタカナも 読む。ン は 閉じ、ィ は 前と 1コマ", () => {
    expect(visemeTimeline("ヘンディ")).toEqual(["e", "closed", "i"]);
  });

  it("ー は 前の 形を のばす", () => {
    expect(visemeTimeline("ミーティング")).toEqual(["i", "i", "i", "closed", "u"]);
  });

  it("、 は 2コマ 閉じる。文末の 。 は 数えない", () => {
    expect(visemeTimeline("はい、そうです。")).toEqual([
      "a",
      "i",
      "closed",
      "closed",
      "o",
      "u",
      "e",
      "u",
    ]);
  });

  it("◯ は 声と 同じく「まる」と 数える（◯◯さん で 口が 前に ずれない）", () => {
    // まる・まる・さ（文末の ん は 閉じなので 数えない）
    expect(visemeTimeline("◯◯さん")).toEqual(["a", "u", "a", "u", "a"]);
    expect(visemeTimeline("では ◯◯さん、お願い")).toEqual([
      "e",
      "a",
      "a",
      "u",
      "a",
      "u",
      "a",
      "closed",
      "closed",
      "closed",
      "o",
      "i",
    ]);
  });

  it("漢字・空白は 数えない（呼ぶ側が かなに してから 渡す）", () => {
    expect(visemeTimeline("今日は よろしく")).toEqual(["a", "o", "o", "i", "u"]);
  });
});

describe("visemeAt — 声の 進みで 形を 選ぶ", () => {
  const line = ["a", "i", "u"] as const;

  it("進みの 割合の 位置の 形を 出す", () => {
    expect(visemeAt(line, 0)).toBe("a");
    expect(visemeAt(line, 0.5)).toBe("i");
    expect(visemeAt(line, 0.99)).toBe("u");
    expect(visemeAt(line, 1)).toBe("u");
  });

  it("進みが 読めない・並びが 空なら null（呼ぶ側が 元の 動かし方に 戻す）", () => {
    expect(visemeAt(line, null)).toBeNull();
    expect(visemeAt(line, Number.NaN)).toBeNull();
    expect(visemeAt([], 0.5)).toBeNull();
  });
});
