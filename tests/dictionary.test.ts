import { describe, expect, it } from "vitest";
import type { WordStage } from "../src/content/schema";
import { buildDictionary, findDictionaryTerm, termOwners } from "../src/lib/dictionary";

function word(term: string, reading: string, extra: Partial<WordStage["words"][number]> = {}) {
  return {
    id: term,
    term,
    reading,
    meaningEn: `meaning of ${term}`,
    wrongMeanings: ["a", "b", "c"],
    explanationJa: `${term} の せつめい`,
    example: `${term} を つかう 文`,
    ...extra,
  };
}

function stage(id: string, title: string, words: WordStage["words"]): WordStage {
  return {
    kind: "wordstage",
    id,
    title,
    description: "",
    fieldSequence: ["a"],
    questionCount: 1,
    passRate: 70,
    words,
  };
}

const FIRST = stage("s1", "1課の ことば", [word("報告", "ほうこく"), word("会議", "かいぎ")]);
const SECOND = stage("s2", "2課の ことば", [
  // 同じことばが2課にも出てくる。説明はわざと変えてある
  word("報告", "ほうこく", { explanationJa: "あとから 書きかえた せつめい" }),
  word("納期", "のうき"),
]);

describe("buildDictionary", () => {
  it("同じことばは1つに畳む", () => {
    const dictionary = buildDictionary([FIRST, SECOND]);
    expect(dictionary.filter((entry) => entry.term === "報告")).toHaveLength(1);
    expect(dictionary.map((entry) => entry.term).sort()).toEqual(["会議", "報告", "納期"].sort());
  });

  it("先に出てきた単語ステージの説明が残る（習ったときの説明が正）", () => {
    const dictionary = buildDictionary([FIRST, SECOND]);
    const entry = dictionary.find((item) => item.term === "報告")!;
    expect(entry.explanationJa).toBe("報告 の せつめい");
    expect(entry.stageId).toBe("s1");
    expect(entry.stageTitle).toBe("1課の ことば");
  });

  it("並びを入れ替えると勝つほうも入れ替わる", () => {
    const entry = buildDictionary([SECOND, FIRST]).find((item) => item.term === "報告")!;
    expect(entry.stageId).toBe("s2");
  });

  it("よみの五十音順に並ぶ", () => {
    expect(buildDictionary([FIRST, SECOND]).map((entry) => entry.reading)).toEqual([
      "かいぎ",
      "のうき",
      "ほうこく",
    ]);
  });
});

describe("findDictionaryTerm", () => {
  const dictionary = buildDictionary([
    stage("s", "t", [
      word("報告", "ほうこく"),
      word("報告書", "ほうこくしょ"),
      word("会議", "かいぎ"),
    ]),
  ]);

  it("1文につき1語だけ返す", () => {
    const found = findDictionaryTerm("会議で 報告を します。", dictionary);
    expect(found).not.toBeNull();
  });

  it("長い語を優先する（「報告書」があるのに「報告」を取らない）", () => {
    expect(findDictionaryTerm("報告書を 出します。", dictionary)?.entry.term).toBe("報告書");
  });

  it("同じ長さなら 文の先頭に近いほう", () => {
    const found = findDictionaryTerm("会議の あとで 報告を します。", dictionary);
    expect(found?.entry.term).toBe("会議");
  });

  it("載っていない文は null", () => {
    expect(findDictionaryTerm("きょうは いい てんきです。", dictionary)).toBeNull();
  });
});

describe("termOwners", () => {
  it("ことば → 最初に出した単語ステージの見出し", () => {
    const owners = termOwners([FIRST, SECOND]);
    expect(owners.get("報告")).toBe("1課の ことば");
    expect(owners.get("納期")).toBe("2課の ことば");
    expect(owners.has("見積")).toBe(false);
  });
});
