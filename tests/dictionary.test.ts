import { describe, expect, it } from "vitest";
import type { VocabBook, VocabWord, WordStage } from "../src/content/schema";
import { buildDictionary, findDictionaryTerm, termOwners } from "../src/lib/dictionary";

/**
 * 辞書は **ことばの 正**から 引く。単語テストの セットは
 * 「○○で あそぶ」の リンクを 出すためだけに 見る（2026-08-25 の指定
 * 「ポップアップ＝単語テストではない。ポップアップの中から単語テストに出る問題がある」）。
 */

function vocab(term: string, reading: string, extra: Partial<VocabWord> = {}): VocabWord {
  return {
    id: term,
    term,
    reading,
    meaningJa: `${term} の せつめい`,
    englishTerm: `meaning of ${term}`,
    example: `${term} を つかう 文`,
    wrongMeanings: ["a", "b", "c"],
    ...extra,
  };
}

function book(words: VocabWord[], furigana?: VocabBook["furigana"]): VocabBook {
  return { kind: "vocab", id: "v", title: "ことば", words, furigana };
}

function word(term: string, reading: string) {
  return {
    id: term,
    term,
    reading,
    meaningEn: `meaning of ${term}`,
    wrongMeanings: ["a", "b", "c"],
    explanationJa: `${term} の せつめい`,
    example: `${term} を つかう 文`,
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

const BOOK = book([vocab("報告", "ほうこく"), vocab("会議", "かいぎ"), vocab("納期", "のうき")]);
const FIRST = stage("s1", "1課の ことば", [word("報告", "ほうこく")]);
const SECOND = stage("s2", "2課の ことば", [word("報告", "ほうこく"), word("納期", "のうき")]);

describe("buildDictionary", () => {
  it("見出しは ことばの 正 ぜんぶ（テストに 出て いなくても 引ける）", () => {
    const dictionary = buildDictionary([BOOK], [FIRST]);
    expect(dictionary.map((entry) => entry.term).sort()).toEqual(["会議", "報告", "納期"].sort());
    // 「会議」は どの セットにも 入って いないが、意味は 引ける
    const kaigi = dictionary.find((entry) => entry.term === "会議")!;
    expect(kaigi.explanationJa).toBe("会議 の せつめい");
    expect(kaigi.stageId).toBe("");
  });

  it("セットは リンクの ためだけ（先に 出た セットが 勝つ）", () => {
    const entry = buildDictionary([BOOK], [FIRST, SECOND]).find((item) => item.term === "報告")!;
    expect(entry.stageId).toBe("s1");
    expect(entry.stageTitle).toBe("1課の ことば");
    expect(buildDictionary([BOOK], [SECOND, FIRST]).find((i) => i.term === "報告")!.stageId).toBe(
      "s2",
    );
  });

  it("セットが 1つも 無くても 辞書は できる", () => {
    expect(buildDictionary([BOOK]).map((entry) => entry.term)).toHaveLength(3);
  });

  it("よみの五十音順に並ぶ", () => {
    expect(buildDictionary([BOOK], [FIRST]).map((entry) => entry.reading)).toEqual([
      "かいぎ",
      "のうき",
      "ほうこく",
    ]);
  });

  it("読み辞書は **その語に 要る ぶんだけ** 運ぶ（束を まるごと 複製しない）", () => {
    const withFurigana = book(
      [vocab("納期", "のうき", { meaningJa: "できた ものを わたす 日です。" })],
      [
        ["日", "ひ"],
        ["会社", "かいしゃ"],
      ],
    );
    const entry = buildDictionary([withFurigana])[0]!;
    const surfaces = entry.furigana.map(([surface]) => surface);
    expect(surfaces).toContain("日"); // 説明文に 出る
    expect(surfaces).toContain("納期"); // 見出し語 そのもの
    expect(surfaces).not.toContain("会社"); // どこにも 出ない ので 運ばない
  });
});

describe("findDictionaryTerm", () => {
  const dictionary = buildDictionary([
    book([vocab("報告", "ほうこく"), vocab("報告書", "ほうこくしょ"), vocab("会議", "かいぎ")]),
  ]);

  it("1文につき1語だけ返す", () => {
    expect(findDictionaryTerm("会議で 報告を します。", dictionary)).not.toBeNull();
  });

  it("長い語を優先する（「報告書」があるのに「報告」を取らない）", () => {
    expect(findDictionaryTerm("報告書を 出します。", dictionary)?.entry.term).toBe("報告書");
  });

  it("同じ長さなら 文の先頭に近いほう", () => {
    expect(findDictionaryTerm("会議の あとで 報告を します。", dictionary)?.entry.term).toBe(
      "会議",
    );
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
