import { describe, expect, it } from "vitest";
import { asksToSkip, needsJapaneseInput } from "../src/lib/meeting/input";

describe("needsJapaneseInput", () => {
  it("日本語が 1つも 無い ときだけ 声を かける", () => {
    expect(needsJapaneseInput("watashi wa Sok desu")).toBe(true);
    expect(needsJapaneseInput("わたしは Sok です。")).toBe(false);
    expect(needsJapaneseInput("")).toBe(false);
  });
});

describe("asksToSkip", () => {
  it("救援の 言い方を 受け取る（「まだ 言えない」ボタンの 代わり）", () => {
    expect(asksToSkip("すみません、つぎを おねがいします")).toBe(true);
    expect(asksToSkip("つぎに いきましょう")).toBe(true);
    expect(asksToSkip("わかりません")).toBe(true);
    expect(asksToSkip("スキップ")).toBe(true);
  });

  it("ふつうの 答えを 逃げ道と 読まない", () => {
    expect(asksToSkip("わたしは ソクです。")).toBe(false);
    expect(asksToSkip("プノンペンから 来ました。")).toBe(false);
    // 4問目の 型文の 答え。ここを 逃げ道に すると、答えた のに 質問が 飛ぶ
    expect(asksToSkip("すこし むずかしいです。")).toBe(false);
    expect(asksToSkip("")).toBe(false);
  });
});
