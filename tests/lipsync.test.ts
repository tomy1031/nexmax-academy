import { describe, expect, it } from "vitest";
import { buildMoraTimeline, timelineDuration } from "../src/lib/lipsync";

describe("buildMoraTimeline", () => {
  it("母音ごとに口形状を割り当てる", () => {
    expect(buildMoraTimeline("あいうえお").map((e) => e.viseme)).toEqual([
      "aa",
      "ih",
      "ou",
      "ee",
      "oh",
    ]);
  });

  it("子音つきモーラは母音の口形状になる", () => {
    expect(buildMoraTimeline("かきくけこ").map((e) => e.viseme)).toEqual([
      "aa",
      "ih",
      "ou",
      "ee",
      "oh",
    ]);
  });

  it("カタカナをひらがなとして扱う", () => {
    expect(buildMoraTimeline("テスト").map((e) => e.viseme)).toEqual(["ee", "ou", "oh"]);
  });

  it("拗音は直前のモーラに統合され、小書き文字の母音を採る", () => {
    // きょ → 1モーラ・お段
    expect(buildMoraTimeline("きょう").map((e) => e.viseme)).toEqual(["oh", "ou"]);
  });

  it("長音は直前の口形状を保つ", () => {
    expect(buildMoraTimeline("かー").map((e) => e.viseme)).toEqual(["aa", "aa"]);
  });

  it("撥音・促音・句読点は口を閉じる", () => {
    expect(buildMoraTimeline("あん、あっ。").map((e) => e.viseme)).toEqual([
      "aa",
      null,
      null,
      "aa",
      null,
      null,
    ]);
  });

  it("空白は無視する", () => {
    expect(buildMoraTimeline("あ い").map((e) => e.viseme)).toEqual(["aa", "ih"]);
  });

  it("イベントが隙間なく連続する", () => {
    const events = buildMoraTimeline("おはようございます");
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.start).toBeCloseTo(events[i - 1]!.end, 10);
    }
    expect(events[0]!.start).toBe(0);
  });

  it("音声長を渡すとタイムライン全体をその長さに合わせる", () => {
    const events = buildMoraTimeline("おはようございます。よろしく。", 4.2);
    expect(timelineDuration(events)).toBeCloseTo(4.2, 6);
  });

  it("空文字はイベントなし・全長0", () => {
    expect(buildMoraTimeline("")).toEqual([]);
    expect(timelineDuration([])).toBe(0);
  });
});
