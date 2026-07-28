import { describe, expect, it } from "vitest";
import {
  annotateRuby,
  buildFuriganaIndex,
  mergeFuriganaEntries,
  type FuriganaEntry,
} from "../src/lib/text/furigana";

const DICT: FuriganaEntry[] = [
  ["新人", "しんじん"],
  ["新", "あたら"],
  ["人", "ひと"],
  ["大切", "たいせつ"],
  ["大", "おお"],
  ["報連相", "ほうれんそう"],
];

const index = buildFuriganaIndex(DICT);

describe("ルビ合成（最長一致）", () => {
  it("複合語を単漢字より先に当てる（新人→あらたひと にしない）", () => {
    expect(annotateRuby("新人です", index)).toEqual([
      { text: "新人", reading: "しんじん" },
      { text: "です" },
    ]);
  });

  it("大切を「おおき」に割らない", () => {
    expect(annotateRuby("大切な話", index)).toEqual([
      { text: "大切", reading: "たいせつ" },
      { text: "な話" },
    ]);
  });

  it("辞書にない漢字はそのまま地の文で残す", () => {
    const segments = annotateRuby("難解", index);
    expect(segments).toEqual([{ text: "難解" }]);
  });

  it("同じ語が複数回出ても全部にルビをつける", () => {
    expect(annotateRuby("人と人", index)).toEqual([
      { text: "人", reading: "ひと" },
      { text: "と" },
      { text: "人", reading: "ひと" },
    ]);
  });

  it("かなだけの見出しは辞書に採らない（ルビが二重になるのを防ぐ）", () => {
    const kanaOnly = buildFuriganaIndex([["ことば", "ことば"]]);
    expect(kanaOnly.entries).toHaveLength(0);
    expect(annotateRuby("ことば", kanaOnly)).toEqual([{ text: "ことば" }]);
  });

  it("空文字・空辞書でも壊れない", () => {
    expect(annotateRuby("", index)).toEqual([]);
    expect(annotateRuby("報連相", buildFuriganaIndex([]))).toEqual([{ text: "報連相" }]);
  });

  it("辞書を重ねると後から渡したものが勝つ", () => {
    const merged = mergeFuriganaEntries(
      [["相談", "そうだん"]],
      [
        ["相談", "そうだんA"],
        ["連絡", "れんらく"],
      ],
    );
    expect(new Map(merged).get("相談")).toBe("そうだんA");
    expect(new Map(merged).get("連絡")).toBe("れんらく");
  });
});
