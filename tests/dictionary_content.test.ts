import { describe, expect, it } from "vitest";
import { listVocabBooks, listWordStages } from "../src/lib/content";
import { buildDictionary, findDictionaryTerms } from "../src/lib/dictionary";
import { meetingSchema } from "../src/content/schema";
import { buildFuriganaIndex, rubyInnerPositions } from "../src/lib/text/furigana";
import muzukashii from "../content/meetings/asakai_muzukashii.json";

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

  /**
   * 夕礼（火曜）の 作業記録の ことば（2026-10-13 の 指定「仮データの『仮』『点数』『未登録』
   *『表記』に 辞書を 入れて」）。画面と 同じく ルビの ことばの 途中では 切らない 形で 引く。
   */
  it("夕礼の 作業記録で 仮・点数・未登録・表記 が 引ける", async () => {
    const [books, stages] = await Promise.all([listVocabBooks(), listWordStages()]);
    const entries = buildDictionary(books, stages);
    const index = buildFuriganaIndex(meetingSchema.parse(muzukashii).furigana ?? []);
    const found = (text: string) =>
      findDictionaryTerms(text, entries, rubyInnerPositions(text, index)).map(
        (one) => one.entry.term,
      );
    expect(found("仮データで グラフ表示")).toContain("仮");
    expect(found("奥田さんの 学生詳細画面で 仮グラフの 表示を 確認")).toContain("仮");
    expect(found("スキル名の 表記を そろえる 処理を 作成")).toContain("表記");
    expect(found("点数未登録の スキルを 除外")).toEqual(expect.arrayContaining(["点数", "未登録"]));
  });

  it("画面に わたす 荷物が ふくらんで いない（20人同時アクセスの 制約）", async () => {
    const [books, stages] = await Promise.all([listVocabBooks(), listWordStages()]);
    const bytes = JSON.stringify(buildDictionary(books, stages)).length;
    // 語ごとに 要る 読みだけを 運ぶ。束を まるごと 複製すると 10倍に なる
    expect(bytes).toBeLessThan(400 * 1024);
  });
});
