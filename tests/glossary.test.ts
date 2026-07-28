import { describe, expect, it } from "vitest";
import { GLOSSARY, findGlossaryTerm, getGlossaryEntry } from "../src/content/glossary";
import {
  PERSONALITY_FAMILIES,
  PERSONALITY_QUESTIONS,
  PERSONALITY_TYPES,
} from "../src/content/personality";

describe("語彙メモ台帳（07 §2.5）", () => {
  it("23語あり、表記が重複しない", () => {
    expect(GLOSSARY).toHaveLength(23);
    expect(new Set(GLOSSARY.map((entry) => entry.term)).size).toBe(GLOSSARY.length);
  });

  it("すべての語に読みと意味がある", () => {
    for (const entry of GLOSSARY) {
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.reading.length).toBeGreaterThan(0);
      expect(entry.meaning.length).toBeGreaterThan(0);
    }
  });

  it("意味メモ自体に禁止語・難語を持ち込まない", () => {
    const banned = /不正解|間違い|ダメ|かつやく|はっき|きちんと|はっきり/;
    for (const entry of GLOSSARY) {
      expect(entry.meaning).not.toMatch(banned);
    }
  });

  it("意味メモは、その語自身を使って説明しない（同語反復を避ける）", () => {
    for (const entry of GLOSSARY) {
      if (entry.term === "スマホ") continue; // 「スマートフォン」への言い換えは例外
      expect(entry.meaning.includes(entry.term)).toBe(false);
    }
  });

  it("getGlossaryEntry は台帳と一致し、未登録語は null", () => {
    for (const entry of GLOSSARY) {
      expect(getGlossaryEntry(entry.term)).toEqual(entry);
    }
    expect(getGlossaryEntry("そんざいしない語")).toBeNull();
  });
});

describe("findGlossaryTerm", () => {
  it("文中で最初に出た語を1件だけ返す", () => {
    expect(findGlossaryTerm("トラブルが 出た とき、たいおう します。")?.term).toBe("トラブル");
    expect(findGlossaryTerm("さいごの しあげを します。")?.term).toBe("しあげ");
  });

  it("対象語が無ければ null", () => {
    expect(findGlossaryTerm("きょうは あついですね。")).toBeNull();
  });

  it("1文につき1語しか返さない（下線を2本引かせない）", () => {
    const sentence = "うんようと たいおうの しごと。";
    const found = findGlossaryTerm(sentence);
    expect(found?.term).toBe("うんよう");
    expect([found].filter(Boolean)).toHaveLength(1);
  });
});

describe("学習者向け文言との対応", () => {
  it("台帳の語は、実際に学習者向け文言のどこかで使われている", () => {
    // 実データだけを見る。ここにリテラルを足すとテストが自分で自分を通してしまう。
    const corpus = [
      ...PERSONALITY_FAMILIES.map((family) => family.name),
      ...PERSONALITY_TYPES.flatMap((type) => [
        type.name,
        type.tagline,
        type.teamRole,
        type.teamRoleDetail,
        ...type.analysis,
      ]),
      ...PERSONALITY_QUESTIONS.flatMap((question) => [
        question.easy,
        question.a.easy,
        question.b.easy,
      ]),
    ].join("\n");

    const unused = GLOSSARY.filter((entry) => !corpus.includes(entry.term)).map(
      (entry) => entry.term,
    );
    expect(unused).toEqual([]);
  });
});
