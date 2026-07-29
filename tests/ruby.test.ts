import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripRuby, synthesizeRuby, type FuriganaEntry } from "../src/lib/ruby";

const DICT: FuriganaEntry[] = [
  ["挨拶回り", "あいさつまわり"],
  ["挨拶", "あいさつ"],
  ["配属", "はいぞく"],
];

describe("synthesizeRuby", () => {
  it("辞書にない文はそのまま素通しする", () => {
    expect(synthesizeRuby("おはようございます", DICT)).toEqual([
      { kind: "plain", text: "おはようございます" },
    ]);
  });

  it("空文字は空配列", () => {
    expect(synthesizeRuby("", DICT)).toEqual([]);
  });

  it("辞書が空ならルビを振らない", () => {
    expect(synthesizeRuby("配属されます", [])).toEqual([{ kind: "plain", text: "配属されます" }]);
    expect(synthesizeRuby("配属されます")).toEqual([{ kind: "plain", text: "配属されます" }]);
  });

  it("辞書の語にルビを振り、前後のテキストを保つ", () => {
    expect(synthesizeRuby("きょう配属されます", DICT)).toEqual([
      { kind: "plain", text: "きょう" },
      { kind: "ruby", base: "配属", reading: "はいぞく" },
      { kind: "plain", text: "されます" },
    ]);
  });

  it("複合語を優先する（最長一致）", () => {
    expect(synthesizeRuby("挨拶回りをします", DICT)).toEqual([
      { kind: "ruby", base: "挨拶回り", reading: "あいさつまわり" },
      { kind: "plain", text: "をします" },
    ]);
  });

  it("辞書の並び順が短い語から始まっても最長一致する", () => {
    const reversed: FuriganaEntry[] = [
      ["挨拶", "あいさつ"],
      ["挨拶回り", "あいさつまわり"],
    ];
    expect(synthesizeRuby("挨拶回り", reversed)).toEqual([
      { kind: "ruby", base: "挨拶回り", reading: "あいさつまわり" },
    ]);
  });

  it("同じ語が複数回出たらすべてにルビを振る", () => {
    expect(synthesizeRuby("配属と配属", DICT)).toEqual([
      { kind: "ruby", base: "配属", reading: "はいぞく" },
      { kind: "plain", text: "と" },
      { kind: "ruby", base: "配属", reading: "はいぞく" },
    ]);
  });

  it("連続する語をつぶさずに切り出す", () => {
    expect(synthesizeRuby("挨拶配属", DICT)).toEqual([
      { kind: "ruby", base: "挨拶", reading: "あいさつ" },
      { kind: "ruby", base: "配属", reading: "はいぞく" },
    ]);
  });
});

describe("stripRuby", () => {
  it("元のテキストを復元する", () => {
    const text = "きょう挨拶回りと配属があります";
    expect(stripRuby(synthesizeRuby(text, DICT))).toBe(text);
  });
});

describe("実コンテンツとの結合", () => {
  it("stage11 の読み辞書でルビが1つ以上合成される", () => {
    const stage = JSON.parse(
      readFileSync(join(__dirname, "..", "content", "wordstages", "stage11_haizoku.json"), "utf8"),
    ) as { furigana?: FuriganaEntry[]; words: { term: string }[] };

    const dict = stage.furigana ?? [];
    expect(dict.length).toBeGreaterThan(0);

    const annotated = stage.words
      .map((w) => synthesizeRuby(w.term, dict))
      .filter((segs) => segs.some((s) => s.kind === "ruby"));
    expect(annotated.length).toBeGreaterThan(0);
  });

  it("実データでも元テキストを壊さない", () => {
    const stage = JSON.parse(
      readFileSync(join(__dirname, "..", "content", "wordstages", "stage11_haizoku.json"), "utf8"),
    ) as { furigana?: FuriganaEntry[]; words: { term: string; explanationJa: string }[] };
    const dict = stage.furigana ?? [];
    for (const w of stage.words) {
      expect(stripRuby(synthesizeRuby(w.explanationJa, dict))).toBe(w.explanationJa);
    }
  });
});
