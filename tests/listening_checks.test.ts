import { describe, expect, it } from "vitest";
import {
  createListening,
  MAX_MISS,
  POINTS,
  remainingKeywords,
  revealRate,
  submitListening,
  type ListeningState,
} from "../src/components/meeting/listening-checks";

const TRANSCRIPT =
  "サーバーが止まっています。原因はまだ分かりません。テストが止まってしまいました。";
const KEYWORDS = ["サーバー", "原因", "テスト"];

function fresh(): ListeningState {
  return createListening(TRANSCRIPT, KEYWORDS);
}

describe("聞き取り判定（入力欄は1つ・原典の配点）", () => {
  it("キーワードそのものは5点、原稿もその場で開く", () => {
    const s = submitListening(fresh(), "サーバー");
    expect(s.score).toBe(POINTS.keyword);
    expect(s.foundKeywords).toEqual(["サーバー"]);
    expect(s.log[0]?.kind).toBe("keyword");
    // 原稿の「サーバー」4文字が見えている
    for (let i = 0; i < 4; i += 1) expect(s.revealed.has(i)).toBe(true);
  });

  it("読み・別表記で当てたときは3点（原典どおり点差がある）", () => {
    const s = submitListening(fresh(), "さーばー");
    expect(s.score).toBe(POINTS.hiragana);
    expect(s.log[0]?.kind).toBe("hiragana");
    expect(s.foundKeywords).toEqual(["サーバー"]);
  });

  it("キーワードを含む言い方は、含んだ数ぶん点が入る", () => {
    const s = submitListening(fresh(), "サーバーが止まっています");
    expect(s.log[0]?.kind).toBe("contains");
    expect(s.score).toBe(POINTS.contains);
    expect(s.foundKeywords).toEqual(["サーバー"]);
  });

  it("キーワードは含むが本文にない言い方は「おしい」で0点", () => {
    const s = submitListening(fresh(), "サーバーが動いています");
    expect(s.log[0]?.kind).toBe("close");
    expect(s.score).toBe(0);
    expect(s.foundKeywords).toEqual([]);
  });

  it("キーワードでなくても本文にあれば2点", () => {
    const s = submitListening(fresh(), "分かりません");
    expect(s.log[0]?.kind).toBe("partial");
    expect(s.score).toBe(POINTS.partial);
    expect(s.otherHits).toBe(1);
  });

  it("短すぎる入力はミスとして数える", () => {
    const s = submitListening(fresh(), "あい");
    expect(s.log[0]?.kind).toBe("tooShort");
    expect(s.misses).toBe(1);
  });

  it("本文にない言葉はミス。3回までで、それ以上は増え続ける", () => {
    let s = fresh();
    for (let i = 0; i < MAX_MISS; i += 1) s = submitListening(s, `りんご${i}`);
    expect(s.misses).toBe(MAX_MISS);
    expect(s.score).toBe(0);
  });

  it("同じ言葉を二度入れても点は増えない", () => {
    const once = submitListening(fresh(), "サーバー");
    const twice = submitListening(once, "サーバー");
    expect(twice.score).toBe(once.score);
    expect(twice.foundKeywords).toEqual(["サーバー"]);
  });

  it("表記がちがっても同じ言葉として扱う（半角カナ・ひらがな）", () => {
    expect(submitListening(fresh(), "ｻｰﾊﾞｰ").foundKeywords).toEqual(["サーバー"]);
  });

  it("見つけるほど原稿が開き、のこりが減る", () => {
    const start = fresh();
    expect(remainingKeywords(start)).toBe(3);

    const s = ["サーバー", "原因", "テスト"].reduce(submitListening, start);
    expect(remainingKeywords(s)).toBe(0);
    expect(revealRate(s)).toBeGreaterThan(revealRate(start));
    expect(s.score).toBe(POINTS.keyword * 3);
  });

  it("空の入力は何も起こさない", () => {
    const s = fresh();
    expect(submitListening(s, "   ")).toBe(s);
  });

  it("記号は最初から見えていて、文字は隠れている", () => {
    const s = fresh();
    expect(s.revealed.has(TRANSCRIPT.indexOf("。"))).toBe(true);
    expect(s.revealed.has(0)).toBe(false);
    expect(revealRate(s)).toBeLessThan(20);
  });
});
