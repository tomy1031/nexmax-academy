import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vocabSchema, wordStageSchema, type WordStage } from "../src/content/schema";
import { hydrateWordStage } from "../src/lib/vocabulary";
import {
  findLearnerWordStage,
  learnerWordStages,
  stageWordStage,
  type StageWithWords,
} from "../src/lib/wordstage-merge";
import {
  arcadeReducer,
  createSession,
  currentWord,
  summarize,
  type ArcadeState,
} from "../src/components/arcade/arcade-reducer";

const VOCAB = vocabSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "..", "content", "vocab", "vocabulary.json"), "utf8")),
);

/** 保存の かたち（参照）を、アプリが 受け取る かたちに 直してから 使う。 */
function load(id: string): WordStage {
  const stored = wordStageSchema.parse(
    JSON.parse(readFileSync(join(__dirname, "..", "content", "wordstages", `${id}.json`), "utf8")),
  );
  return hydrateWordStage(stored, VOCAB.words, VOCAB.furigana)!;
}

const intro = load("intro_kotoba");
const orientation = load("stage01_orientation");
const hajimari = load("hajimari_kotoba");

const INTRO: StageWithWords = {
  id: "intro",
  title: "はじめに",
  reading: "はじめに",
  wordStageIds: ["intro_kotoba", "stage01_orientation"],
};
const HAJIMARI: StageWithWords = {
  id: "hajimari",
  title: "はじまり",
  reading: "はじまり",
  wordStageIds: ["hajimari_kotoba"],
};

function playAllCorrect(stage: WordStage): ArcadeState {
  let s = createSession({ stage, mode: "test" });
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
  return s;
}

describe("ステージの ことば", () => {
  it("見出しは ステージの 名前に そろう（「〜の ことば」に しない）", () => {
    expect(stageWordStage(INTRO, [intro, orientation])!.title).toBe("はじめに");
    expect(stageWordStage(HAJIMARI, [hajimari])!.title).toBe("はじまり");
  });

  it("1つだけでも id は 変えない（進み具合の 保存キーを 守る）", () => {
    expect(stageWordStage(HAJIMARI, [hajimari])!.id).toBe("hajimari_kotoba");
    expect(stageWordStage(HAJIMARI, [hajimari])!.words).toEqual(hajimari.words);
  });

  it("0こなら null（カードを 出さない）", () => {
    expect(stageWordStage(INTRO, [])).toBeNull();
  });

  it("2つ以上は 1つに なり、ことばが ぜんぶ 入る", () => {
    const merged = stageWordStage(INTRO, [intro, orientation])!;
    expect(merged.id).toBe("intro");
    expect(merged.words.length).toBe(intro.words.length + orientation.words.length);
    expect(merged.words.map((w) => w.term)).toContain("ほうれんそう");
    expect(merged.words.map((w) => w.term)).toContain("要件定義");
  });

  it("見出しの よみが 読み辞書に 入る（漢字の 名前でも 裸に しない）", () => {
    const kaisha: StageWithWords = {
      id: "kaisha",
      title: "会社を 知る",
      reading: "かいしゃを しる",
      wordStageIds: ["a"],
    };
    const merged = stageWordStage(kaisha, [{ ...hajimari, id: "a" }])!;
    expect(merged.furigana).toContainEqual(["会社を 知る", "かいしゃを しる"]);
  });

  it("同じ ことばは 先に 出たほうが 勝つ（説明が 2つ 育たない）", () => {
    const b: WordStage = {
      ...intro,
      id: "b",
      words: intro.words.map((w) => ({ ...w, explanationJa: "あとから 来た 説明です。" })),
    };
    const merged = stageWordStage(INTRO, [{ ...intro, id: "a" }, b])!;
    expect(merged.words.length).toBe(intro.words.length);
    expect(merged.words[0]!.explanationJa).toBe(intro.words[0]!.explanationJa);
  });

  it("ことばの id が ぶつかっても 出題が こわれない", () => {
    const b: WordStage = {
      ...orientation,
      id: "b",
      words: orientation.words.map((w, i) => ({ ...w, id: intro.words[i]?.id ?? w.id })),
    };
    const merged = stageWordStage(INTRO, [intro, b])!;
    const ids = merged.words.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("まとめた ぶんも 最後まで 遊べる", () => {
    const merged = stageWordStage(INTRO, [intro, orientation])!;
    const end = playAllCorrect(merged);
    const result = summarize(end);
    expect(end.phase.kind).toBe("finished");
    expect(result.total).toBe(merged.questionCount);
    expect(result.score).toBe(result.maxScore);
  });
});

describe("学習者に 見せる ことばの 一覧", () => {
  const stages = [INTRO, HAJIMARI];
  const words = [intro, orientation, hajimari];

  it("1ステージ＝1つ になる", () => {
    const list = learnerWordStages(stages, words);
    expect(list.map((s) => s.id)).toEqual(["intro", "hajimari_kotoba"]);
    expect(list.map((s) => s.title)).toEqual(["はじめに", "はじまり"]);
  });

  it("どの ステージにも 付いて いない ものは そのまま 残る", () => {
    const orphan: WordStage = { ...hajimari, id: "orphan", title: "のこりもの" };
    const list = learnerWordStages(stages, [...words, orphan]);
    expect(list.map((s) => s.id)).toContain("orphan");
  });

  it("単語ステージIDで 引いても ステージの まとまりが 返る（古いリンクを 切らない）", () => {
    expect(findLearnerWordStage("intro_kotoba", stages, words)!.id).toBe("intro");
    expect(findLearnerWordStage("stage01_orientation", stages, words)!.id).toBe("intro");
    expect(findLearnerWordStage("hajimari_kotoba", stages, words)!.id).toBe("hajimari_kotoba");
    expect(findLearnerWordStage("nai", stages, words)).toBeNull();
  });
});
