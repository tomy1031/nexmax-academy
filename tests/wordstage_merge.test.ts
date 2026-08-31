import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vocabSchema, wordStageSchema, type WordStage } from "../src/content/schema";
import { hydrateWordStage } from "../src/lib/vocabulary";
import {
  findLearnerWordSets,
  findLearnerWordStage,
  learnerWordGroups,
  stageWordSets,
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

describe("一段目は 1行、二段目で セットを えらぶ（願い #280）", () => {
  /** 初級・中級の 2セットを ぶら下げた ステージ（kaisha と 同じ かたち）。 */
  const shokyu: WordStage = { ...hajimari, id: "set_shokyu", label: "初級" };
  const chukyu: WordStage = { ...orientation, id: "set_chukyu", label: "中級" };
  const LEVELED: StageWithWords = {
    id: "leveled",
    title: "会社を 知る",
    reading: "かいしゃを しる",
    wordStageIds: ["set_shokyu", "set_chukyu"],
  };

  /*
   * 2026-08-31 の 直し。「まとめる」は **一覧を 1行に する**ことで、
   * セットを 消す ことでは なかった——「会社を知るを選ぶと、
   * 初級・中級・上級が選択できるようにしてください」。
   */
  it("一段目（一覧）は セット名が あっても 1ステージ 1行", () => {
    const { heads } = learnerWordGroups([LEVELED], [shokyu, chukyu]);
    expect(heads.map((head) => head.id)).toEqual(["leveled"]);
    expect(heads[0]!.title).toBe("会社を 知る");
    expect(heads[0]!.wordCount).toBe(hajimari.words.length + orientation.words.length);
    // 行には セット名を 出さない（どれを やるかは 押した 先で えらぶ）
    expect(heads[0]!.label).toBeUndefined();
    // 中の セットは 行から 引ける（押した 先で ならべる ため）
    expect(heads[0]!.setIds).toEqual(["set_shokyu", "set_chukyu"]);
  });

  it("一覧の 行は ことばを 積まない（見出しの ルビだけ 運ぶ）", () => {
    const { heads, sets } = learnerWordGroups([LEVELED], [shokyu, chukyu]);
    expect(heads[0]!.furigana).toContainEqual(["会社を 知る", "かいしゃを しる"]);
    // ことば 152語ぶんの 読み辞書が 行に 付いて こない（授業で 20人が 同時に 開く）
    expect(heads[0]!.furigana!.length).toBeLessThan(5);
    // ことばそのものは セット側に 1回だけ
    expect(sets.map((set) => set.id)).toEqual(["set_shokyu", "set_chukyu"]);
  });

  it("二段目（えらぶ 画面）は セット名の ぶんだけ ならぶ。順は wordStageIds の 順", () => {
    const sets = stageWordSets(LEVELED, [shokyu, chukyu]);
    expect(sets.map((s) => s.id)).toEqual(["set_shokyu", "set_chukyu"]);
    expect(sets.map((s) => s.label)).toEqual(["初級", "中級"]);
    /*
     * 名前の 付いた セットは **自分の 見出しを 保つ**。ステージの 名前に そろえると
     * 同じ 名前が 何行も ならんで えらべなく なる（名前なしの 統合とは 逆）。
     */
    expect(sets.map((s) => s.title)).toEqual([hajimari.title, orientation.title]);
    // ステージの 名前の よみは 読み辞書に 入る（見出しに 漢字が あっても 裸に しない）
    expect(sets[0]!.furigana).toContainEqual(["会社を 知る", "かいしゃを しる"]);
  });

  it("名前が 無ければ 二段目も 1つ＝えらぶ 画面を はさまない", () => {
    const sets = stageWordSets(INTRO, [intro, orientation]);
    expect(sets.map((s) => s.id)).toEqual(["intro"]);
  });

  it("名前の 有る 無しが まざったら、無い ものだけ 1つに まとまる", () => {
    const sets = stageWordSets(LEVELED, [intro, shokyu, orientation]);
    expect(sets.map((s) => s.id)).toEqual(["leveled", "set_shokyu"]);
    expect(sets[0]!.words.length).toBe(intro.words.length + orientation.words.length);
  });

  it("ステージIDで 引くと セットが ぜんぶ、単語ステージIDなら その 1つ", () => {
    const stages = [LEVELED];
    const words = [shokyu, chukyu];
    expect(findLearnerWordSets("leveled", stages, words).map((s) => s.id)).toEqual([
      "set_shokyu",
      "set_chukyu",
    ]);
    expect(findLearnerWordSets("set_chukyu", stages, words).map((s) => s.id)).toEqual([
      "set_chukyu",
    ]);
    expect(findLearnerWordSets("nai", stages, words)).toEqual([]);
  });

  it("セットは それぞれ 最後まで 遊べる", () => {
    const [first] = stageWordSets(LEVELED, [shokyu, chukyu]);
    const end = playAllCorrect(first!);
    expect(end.phase.kind).toBe("finished");
    expect(summarize(end).score).toBe(summarize(end).maxScore);
  });
});

describe("学習者に 見せる ことばの 一覧", () => {
  const stages = [INTRO, HAJIMARI];
  const words = [intro, orientation, hajimari];

  it("名前の 無い ステージは 1ステージ＝1つ のまま", () => {
    const { heads } = learnerWordGroups(stages, words);
    expect(heads.map((head) => head.id)).toEqual(["intro", "hajimari_kotoba"]);
    expect(heads.map((head) => head.title)).toEqual(["はじめに", "はじまり"]);
    // どちらも セットは 1つ＝えらぶ 画面を はさまない
    expect(heads.map((head) => head.setIds.length)).toEqual([1, 1]);
  });

  it("どの ステージにも 付いて いない ものは そのまま 残る", () => {
    const orphan: WordStage = { ...hajimari, id: "orphan", title: "のこりもの" };
    const { heads, sets } = learnerWordGroups(stages, [...words, orphan]);
    expect(heads.map((head) => head.id)).toContain("orphan");
    expect(sets.map((set) => set.id)).toContain("orphan");
  });

  it("単語ステージIDで 引いても ステージの まとまりが 返る（古いリンクを 切らない）", () => {
    expect(findLearnerWordStage("intro_kotoba", stages, words)!.id).toBe("intro");
    expect(findLearnerWordStage("stage01_orientation", stages, words)!.id).toBe("intro");
    expect(findLearnerWordStage("hajimari_kotoba", stages, words)!.id).toBe("hajimari_kotoba");
    expect(findLearnerWordStage("nai", stages, words)).toBeNull();
  });
});

/**
 * まとめた セットも **ぜんぶ 出す**（2026-08-26 の 指定6）
 *
 * 前は「いちばん 多い セットの 数」だったので、24語＋20語を まとめても
 * 出るのは 24問 まで。あとの セットの ことばは ほとんど 出番が なかった。
 */
describe("まとめた セットの 出題数", () => {
  it("それぞれが 全問なら、まとめた ものも 全問 出す", () => {
    const merged = stageWordStage(INTRO, [intro, orientation])!;
    expect(merged.questionCount).toBe(merged.words.length);
    expect(merged.questionCount).toBeGreaterThan(intro.questionCount);
  });

  it("先生が 減らして いれば、その ぶんだけ 減る", () => {
    const merged = stageWordStage(INTRO, [
      { ...intro, questionCount: 2 },
      { ...orientation, questionCount: 1 },
    ])!;
    expect(merged.questionCount).toBe(3);
  });
});
