import { describe, expect, it } from "vitest";
import {
  annotateRuby,
  buildFuriganaIndex,
  mergeFuriganaEntries,
  uncoveredKanji,
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

/**
 * 覆えていない漢字の洗い出し。
 * ここが漏らすと、先生は「ふりがなは付いている」と思ったまま公開し、
 * 学習者だけが読めない漢字にぶつかって、そこで学習が止まる。
 */
describe("覆えていない漢字の洗い出し", () => {
  it("辞書が空なら、その文の漢字が全部返る", () => {
    expect(uncoveredKanji("新人です", buildFuriganaIndex([]))).toEqual(["新", "人"]);
  });

  it("全部覆われていれば空", () => {
    expect(uncoveredKanji("大切な新人", index)).toEqual([]);
  });

  it("部分的に覆われている場合、覆われていない字だけが返る", () => {
    // 「新人」は辞書にあるので数えない。「報告」は辞書に無いので2字とも返る
    expect(uncoveredKanji("新人の報告", index)).toEqual(["報", "告"]);
  });

  it("ひらがな・カタカナ・英数字は返らない", () => {
    expect(uncoveredKanji("ひらがな カタカナ ABC 123", index)).toEqual([]);
  });

  it("同じ漢字が何度出ても1回だけ、出てきた順に返る", () => {
    expect(uncoveredKanji("告と報告", index)).toEqual(["告", "報"]);
  });

  it("annotateRuby と同じ最長一致で見る（複合語で覆えている字を、単字として数え直さない）", () => {
    // 「報」は 報連相 の中にしか無い。だから 報連相 は覆えていて、報告 は覆えていない
    expect(uncoveredKanji("報連相", index)).toEqual([]);
    expect(uncoveredKanji("報告", index)).toEqual(["報", "告"]);
  });

  it("空文字なら空（教材の任意フィールドが空でも壊れない）", () => {
    expect(uncoveredKanji("", index)).toEqual([]);
  });
});
