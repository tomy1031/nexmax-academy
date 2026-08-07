import { describe, expect, it } from "vitest";
import {
  answerMatches,
  inspectReadingInput,
  isHiraganaInputReady,
  looseReading,
  normalizeReading,
  readingMatches,
  toHiragana,
} from "../src/lib/text/normalize";

describe("表記ゆれ正規化（唯一の実装）", () => {
  it("カタカナをひらがなに寄せる", () => {
    expect(toHiragana("エンジニア")).toBe("えんじにあ");
    expect(toHiragana("サーバー")).toBe("さーばー");
  });

  it("全角英数・半角カナを NFKC でそろえる", () => {
    expect(normalizeReading("ｻｰﾊﾞｰ")).toBe(normalizeReading("サーバー"));
  });

  it("空白と句読点は判定に影響しない", () => {
    expect(normalizeReading("ようけん ていぎ、")).toBe("ようけんていぎ");
  });

  it("「づ／ぢ」のゆれを吸収する（旧実装が弾いていたケース）", () => {
    expect(readingMatches("つづく", "つずく")).toBe(true);
    expect(readingMatches("はなぢ", "はなじ")).toBe(true);
  });

  it("長音のゆれを最終手段で吸収する", () => {
    expect(looseReading("さーばー")).toBe("さあばあ");
    expect(readingMatches("さあばあ", "さーばー")).toBe(true);
    expect(readingMatches("こんぴゅーた", "こんぴゅうた")).toBe(true);
  });

  it("を・や行の長音展開を取り違えない", () => {
    expect(looseReading("をー")).toBe("をお");
    expect(looseReading("きょー")).toBe("きょお");
  });

  it("別の語まで一致させない", () => {
    expect(readingMatches("ほうこく", "れんらく")).toBe(false);
    expect(readingMatches("", "ほうこく")).toBe(false);
  });

  it("カタカナ入力もひらがなの読みとして正解にする", () => {
    expect(readingMatches("ヨウケンテイギ", "ようけんていぎ")).toBe(true);
  });

  it("自由入力は候補のいずれかに当たれば正解", () => {
    expect(answerMatches("ホウレンソウ", ["報連相", "ほうれんそう"])).toBe(true);
    expect(answerMatches("そうだん", ["報連相", "ほうれんそう"])).toBe(false);
  });
});

describe("入力の見守り", () => {
  it("漢字・英字・カタカナをそれぞれ見分ける", () => {
    expect(inspectReadingInput("要件定義")).toBe("kanji");
    expect(inspectReadingInput("youkenteigi")).toBe("latin");
    expect(inspectReadingInput("ヨウケンテイギ")).toBe("katakana");
  });

  it("ひらがなだけなら注意を出さない", () => {
    expect(inspectReadingInput("ようけんていぎ")).toBeNull();
    expect(inspectReadingInput("")).toBeNull();
  });

  it("ひらがな入力チェックは漢字・英字を通さない", () => {
    expect(isHiraganaInputReady("あいうえお", "あいうえお")).toBe(true);
    expect(isHiraganaInputReady("アイウエオ", "あいうえお")).toBe(true);
    expect(isHiraganaInputReady("aiueo", "あいうえお")).toBe(false);
    expect(isHiraganaInputReady("愛上尾", "あいうえお")).toBe(false);
  });
});
