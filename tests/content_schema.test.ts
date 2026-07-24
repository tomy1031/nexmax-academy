import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentSchema, wordStageSchema } from "../src/content/schema";

/** サンプルステージを雛形に、部分的に壊したデータを作るヘルパ。 */
function loadSampleStage(): Record<string, unknown> {
  const raw = readFileSync(
    join(__dirname, "..", "content", "wordstages", "stage11_haizoku.json"),
    "utf8",
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("コンテンツスキーマ（検収の契約）", () => {
  it("リポジトリ内のサンプルステージはスキーマに適合する", () => {
    const result = contentSchema.safeParse(loadSampleStage());
    expect(result.success).toBe(true);
  });

  it("questionCount が語数を超えると弾く（出題は語彙の部分集合）", () => {
    const stage = loadSampleStage();
    stage.questionCount = 999;
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });

  it("誤答選択肢が正解と同じだと弾く", () => {
    const stage = loadSampleStage();
    const words = stage.words as { meaningEn: string; wrongMeanings: string[] }[];
    const word = words[0]!;
    word.wrongMeanings = [word.meaningEn, "Foo", "Bar"];
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });

  it("語の id が重複すると弾く", () => {
    const stage = loadSampleStage();
    const words = stage.words as { id: string }[];
    words[1]!.id = words[0]!.id;
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });

  it("表示テキストにルビHTMLを手書きすると弾く（ルビはエンジン合成）", () => {
    const stage = loadSampleStage();
    const words = stage.words as { explanationJa: string }[];
    words[0]!.explanationJa = "<ruby>配属<rt>はいぞく</rt></ruby>のことです。";
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });

  it("読みにカタカナ・漢字が混ざると弾く（読みはひらがな）", () => {
    const stage = loadSampleStage();
    const words = stage.words as { reading: string }[];
    words[0]!.reading = "ハイゾク";
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });

  it("誤答選択肢に日本語が混ざると弾く（誤答は英語のみ）", () => {
    const stage = loadSampleStage();
    const words = stage.words as { wrongMeanings: string[] }[];
    words[0]!.wrongMeanings = ["給料", "Vacation", "Delivery"];
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });
});
