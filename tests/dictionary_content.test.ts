import { describe, expect, it } from "vitest";
import { listVocabBooks, listWordStages } from "../src/lib/content";
import { buildDictionary, findDictionaryTerms } from "../src/lib/dictionary";

/**
 * **ポップアップ辞書と 単語テストは 別**（2026-08-25 の指定）。
 *
 * ここが 1つに 戻ると、「テストから 外す」と「意味が 引けなく なる」が また
 * 同時に 起きて、覚えなくて よい 語まで テストに 入れる ことに なる。
 * 実際の データで 見張る。
 */
describe("辞書は テストと 別（実データ）", () => {
  it("テストに 出て いない 語も、意味が 引ける", async () => {
    const [books, stages] = await Promise.all([listVocabBooks(), listWordStages()]);
    const entries = buildDictionary(books, stages);
    const inTest = new Set(stages.flatMap((stage) => stage.words.map((word) => word.term)));
    const dictionaryOnly = entries.filter((entry) => !inTest.has(entry.term));

    // 辞書は 正 ぜんぶ。テストは その中の 一部なので、辞書だけの 語が 必ず ある
    expect(entries.length).toBeGreaterThan(inTest.size);
    expect(dictionaryOnly.length).toBeGreaterThan(0);

    // どの語も 説明を 持って いる（引けても 中身が 空では 助けに ならない）
    for (const entry of dictionaryOnly) expect(entry.explanationJa.length).toBeGreaterThan(0);

    // 「テストには 出さないが 読むのに 要る」語の 実例。本文の 中から 引き当てられる
    const sample = entries.find((entry) => entry.term === "観光地");
    expect(sample).toBeDefined();
    expect(findDictionaryTerms("観光地の 写真を とります。", entries)[0]?.entry.term).toBe(
      "観光地",
    );
  });

  it("テストに 出て いる 語には 遊ぶ 先が ある（出て いない 語には 無い）", async () => {
    const [books, stages] = await Promise.all([listVocabBooks(), listWordStages()]);
    const entries = buildDictionary(books, stages);
    const inTest = new Set(stages.flatMap((stage) => stage.words.map((word) => word.term)));
    for (const entry of entries) {
      expect(entry.stageId.length > 0).toBe(inTest.has(entry.term));
    }
  });

  it("画面に わたす 荷物が ふくらんで いない（20人同時アクセスの 制約）", async () => {
    const [books, stages] = await Promise.all([listVocabBooks(), listWordStages()]);
    const bytes = JSON.stringify(buildDictionary(books, stages)).length;
    // 語ごとに 要る 読みだけを 運ぶ。束を まるごと 複製すると 10倍に なる
    expect(bytes).toBeLessThan(400 * 1024);
  });
});
