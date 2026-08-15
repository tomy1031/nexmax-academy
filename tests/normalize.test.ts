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

describe("自由入力の救済（学習者有利・P8）", () => {
  it("文末の「です」「でした」の有無で落とさない", () => {
    expect(answerMatches("大阪です", ["大阪"])).toBe(true);
    // 逆向き（accept 側に「です」が付いている）でも落とさない
    expect(answerMatches("おおさか", ["おおさかです"])).toBe(true);
    expect(answerMatches("受託開発でした", ["受託開発"])).toBe(true);
  });

  it("文で答えても、こたえの語が入っていれば正解", () => {
    expect(answerMatches("ホームページを つくります", ["ホームページ"])).toBe(true);
    expect(answerMatches("しゃちょうは まついさんです", ["まつい"])).toBe(true);
    // 長音のゆれも包含のときに吸収する
    expect(answerMatches("さあばあを つくる しごと", ["サーバー"])).toBe(true);
  });

  it("1文字のこたえは包含で通さない（「人」がどこにでも当たってしまう）", () => {
    expect(answerMatches("人", ["人"])).toBe(true);
    expect(answerMatches("三人の 人が いました", ["人"])).toBe(false);
  });

  it("ゆるめても 別の語までは通さない", () => {
    expect(answerMatches("そうだん", ["報連相", "ほうれんそう"])).toBe(false);
    expect(answerMatches("れんらく", ["ほうこく"])).toBe(false);
    expect(answerMatches("です", ["大阪"])).toBe(false);
    expect(answerMatches("   ", ["大阪"])).toBe(false);
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
