import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { wordStageSchema, type WordStage } from "../src/content/schema";
import { MERGED_TITLE, mergeWordStages } from "../src/lib/wordstage-merge";
import {
  createSession,
  currentWord,
  arcadeReducer,
  summarize,
} from "../src/components/arcade/arcade-reducer";

function load(id: string): WordStage {
  return wordStageSchema.parse(
    JSON.parse(readFileSync(join(__dirname, "..", "content", "wordstages", `${id}.json`), "utf8")),
  );
}

const intro = load("intro_kotoba");
const orientation = load("stage01_orientation");

describe("ステージの ことばを 1つに まとめる", () => {
  it("1つだけなら そのまま（1課しか 無い ステージの 見た目を 変えない）", () => {
    expect(mergeWordStages("intro", [intro])).toBe(intro);
  });

  it("0こなら null（カードを 出さない）", () => {
    expect(mergeWordStages("intro", [])).toBeNull();
  });

  it("2つ以上は 1つに なり、ことばが ぜんぶ 入る", () => {
    const merged = mergeWordStages("intro", [intro, orientation])!;
    expect(merged.id).toBe("intro");
    expect(merged.title).toBe(MERGED_TITLE);
    expect(merged.words.length).toBe(intro.words.length + orientation.words.length);
    // 出どころの 両方から 引ける
    expect(merged.words.map((w) => w.term)).toContain("ほうれんそう");
    expect(merged.words.map((w) => w.term)).toContain("要件定義");
  });

  it("同じ ことばは 先に 出たほうが 勝つ（説明が 2つ 育たない）", () => {
    const a: WordStage = { ...intro, id: "a" };
    const b: WordStage = {
      ...intro,
      id: "b",
      words: intro.words.map((w) => ({ ...w, explanationJa: "あとから 来た 説明です。" })),
    };
    const merged = mergeWordStages("s", [a, b])!;
    expect(merged.words.length).toBe(intro.words.length);
    expect(merged.words[0]!.explanationJa).toBe(intro.words[0]!.explanationJa);
  });

  it("ことばの id が ぶつかっても 出題が こわれない", () => {
    const b: WordStage = {
      ...orientation,
      id: "b",
      // 表記は ちがうが id が intro 側と ぶつかる ことばを 作る
      words: orientation.words.map((w, i) => ({ ...w, id: intro.words[i]?.id ?? w.id })),
    };
    const merged = mergeWordStages("s", [intro, b])!;
    const ids = merged.words.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("まとめた ぶんも 最後まで 遊べる", () => {
    const merged = mergeWordStages("intro", [intro, orientation])!;
    let s = createSession({ stage: merged, mode: "test" });
    let guard = 0;
    while (s.phase.kind !== "finished" && guard++ < 500) {
      const word = currentWord(s);
      if (!word) break;
      if (s.phase.kind === "reading")
        s = arcadeReducer(s, { type: "submitReading", input: word.reading });
      else if (s.phase.kind === "meaning")
        s = arcadeReducer(s, { type: "chooseMeaning", choice: word.meaningEn });
      else s = arcadeReducer(s, { type: "advance" });
    }
    const result = summarize(s);
    expect(s.phase.kind).toBe("finished");
    expect(result.total).toBe(merged.questionCount);
    expect(result.score).toBe(result.maxScore);
  });
});
