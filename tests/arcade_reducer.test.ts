import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vocabSchema, wordStageSchema, type WordStage } from "../src/content/schema";
import { hydrateWordStage } from "../src/lib/vocabulary";
import {
  arcadeReducer,
  createSession,
  currentWord,
  summarize,
  type ArcadeAction,
  type ArcadeState,
} from "../src/components/arcade/arcade-reducer";

function loadStage(): WordStage {
  const raw = readFileSync(
    join(__dirname, "..", "content", "wordstages", "stage01_orientation.json"),
    "utf8",
  );
  const vocab = vocabSchema.parse(
    JSON.parse(readFileSync(join(__dirname, "..", "content", "vocab", "vocabulary.json"), "utf8")),
  );
  // 保存は 参照（wordIds）。アプリが 受け取る かたちに 直してから 使う
  return hydrateWordStage(wordStageSchema.parse(JSON.parse(raw)), vocab.words, vocab.furigana)!;
}

const stage = loadStage();

/** 再現可能な乱数（線形合同法）。テストのたびに同じ出題になる。 */
function seededRng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 0x100000000;
    return value / 0x100000000;
  };
}

function run(state: ArcadeState, actions: ArcadeAction[]): ArcadeState {
  return actions.reduce(arcadeReducer, state);
}

/** 現在の問題に「正しい読み」と「正しい意味」で答え、解説を送る。 */
function answerAllCorrect(state: ArcadeState): ArcadeState {
  let s = state;
  while (s.phase.kind !== "finished") {
    const word = currentWord(s);
    if (!word) break;
    if (s.phase.kind === "reading") {
      s = arcadeReducer(s, { type: "submitReading", input: word.reading });
    } else if (s.phase.kind === "meaning") {
      s = arcadeReducer(s, { type: "chooseMeaning", choice: word.meaningEn });
    } else {
      s = arcadeReducer(s, { type: "advance" });
    }
  }
  return s;
}

describe("ことばアーケードの状態機械", () => {
  it("読み → 意味 → 解説 の順に進む（中心体験を崩さない）", () => {
    const s0 = createSession({ stage, mode: "test", rng: seededRng(7) });
    expect(s0.phase.kind).toBe("reading");
    const word = currentWord(s0)!;

    const s1 = arcadeReducer(s0, { type: "submitReading", input: word.reading });
    expect(s1.phase).toEqual({ kind: "meaning", readingOk: true });

    const s2 = arcadeReducer(s1, { type: "chooseMeaning", choice: word.meaningEn });
    expect(s2.phase.kind).toBe("explain");

    const s3 = arcadeReducer(s2, { type: "advance" });
    expect(s3.index).toBe(1);
    expect(s3.phase.kind).toBe("reading");
  });

  it("カタカナで打っても読みは正解になる", () => {
    const s0 = createSession({ stage, mode: "test", rng: seededRng(3) });
    const word = currentWord(s0)!;
    const katakana = word.reading.replace(/[ぁ-ゖ]/g, (c) =>
      String.fromCodePoint((c.codePointAt(0) ?? 0) + 0x60),
    );
    const s1 = arcadeReducer(s0, { type: "submitReading", input: katakana });
    expect(s1.phase).toEqual({ kind: "meaning", readingOk: true });
  });

  it("漢字や英字の入力は回答として消費せず、注意だけ出す", () => {
    const s0 = createSession({ stage, mode: "test", rng: seededRng(11) });
    const kanji = arcadeReducer(s0, { type: "submitReading", input: "要件定義" });
    expect(kanji.phase.kind).toBe("reading");
    expect(kanji.hint).toBe("reading.hasKanji");

    const latin = arcadeReducer(s0, { type: "submitReading", input: "youken" });
    expect(latin.phase.kind).toBe("reading");
    expect(latin.hint).toBe("reading.hasLatin");
  });

  it("読みを外しても意味フェーズには必ず進む（学びを打ち切らない）", () => {
    const s0 = createSession({ stage, mode: "test", rng: seededRng(5) });
    const s1 = arcadeReducer(s0, { type: "submitReading", input: "ぜんぜんちがうよみ" });
    expect(s1.phase).toEqual({ kind: "meaning", readingOk: false });
    expect(s1.hint).toBe("reading.retry");
  });

  it("テストは途中でゲームオーバーにならない（ライフを減らさない）", () => {
    let s = createSession({ stage, mode: "test", rng: seededRng(2) });
    const initialLife = s.life;
    s = run(s, [
      { type: "submitReading", input: "ちがう" },
      { type: "chooseMeaning", choice: "___ありえない選択肢___" },
      { type: "advance" },
    ]);
    expect(s.life).toBe(initialLife);
    expect(s.phase.kind).toBe("reading");
  });

  it("れんしゅうはライフが尽きたら終わる", () => {
    let s = createSession({ stage, mode: "practice", rng: seededRng(9) });
    while (s.phase.kind !== "finished") {
      if (s.phase.kind === "reading") {
        s = arcadeReducer(s, { type: "readingTimeout" });
      } else if (s.phase.kind === "meaning") {
        s = arcadeReducer(s, { type: "meaningTimeout" });
      } else {
        s = arcadeReducer(s, { type: "advance" });
      }
    }
    expect(s.phase).toEqual({ kind: "finished", reason: "lifeOut" });
  });

  it("問題だけモードは読みを聞かず、意味だけで採点する", () => {
    const s0 = createSession({ stage, mode: "quiz", rng: seededRng(4) });
    expect(s0.phase).toEqual({ kind: "meaning", readingOk: null });
    const done = answerAllCorrect(s0);
    const summary = summarize(done);
    expect(summary.readingCorrect).toBe(0);
    expect(summary.maxScore).toBe(summary.total); // 1問1点
    expect(summary.score).toBe(summary.total);
    expect(summary.passed).toBe(true);
  });

  it("全問正解なら 1問2点の満点で合格になる", () => {
    const done = answerAllCorrect(createSession({ stage, mode: "test", rng: seededRng(1) }));
    const summary = summarize(done);
    expect(summary.total).toBe(stage.questionCount);
    expect(summary.maxScore).toBe(stage.questionCount * 2);
    expect(summary.score).toBe(summary.maxScore);
    expect(summary.passed).toBe(true);
    expect(summary.missedWordIds).toEqual([]);
  });

  it("まちがえた語だけを次の再挑戦に渡せる", () => {
    let s = createSession({ stage, mode: "test", rng: seededRng(6) });
    const firstWord = currentWord(s)!;
    s = run(s, [
      { type: "submitReading", input: "ちがうよみ" },
      { type: "chooseMeaning", choice: firstWord.meaningEn },
      { type: "advance" },
    ]);
    s = answerAllCorrect(s);
    const summary = summarize(s);
    expect(summary.missedWordIds).toContain(firstWord.id);

    const retry = createSession({
      stage,
      mode: "test",
      rng: seededRng(6),
      onlyWordIds: summary.missedWordIds,
    });
    expect(retry.questions).toHaveLength(summary.missedWordIds.length);
    expect(retry.questions.map((q) => q.word.id)).toContain(firstWord.id);
  });

  it("やめるとその場で終了し、以降の操作を受け付けない", () => {
    const s0 = createSession({ stage, mode: "practice", rng: seededRng(8) });
    const quit = arcadeReducer(s0, { type: "quit" });
    expect(quit.phase).toEqual({ kind: "finished", reason: "quit" });
    expect(arcadeReducer(quit, { type: "submitReading", input: "あ" })).toBe(quit);
  });

  it("得点は旧アプリの式のまま（読み 100+（コンボ-1）×50 ／ 意味 200+コンボ×100）", () => {
    let s = createSession({ stage, mode: "practice", rng: seededRng(21) });
    const first = currentWord(s)!;

    s = arcadeReducer(s, { type: "submitReading", input: first.reading });
    expect(s.score).toBe(100); // コンボ1本目
    expect(s.lastGain).toBe(100);

    s = arcadeReducer(s, { type: "chooseMeaning", choice: first.meaningEn });
    expect(s.score).toBe(100 + 400); // コンボ2で 200+2×100
    s = arcadeReducer(s, { type: "advance" });

    const second = currentWord(s)!;
    s = arcadeReducer(s, { type: "submitReading", input: second.reading });
    expect(s.lastGain).toBe(100 + (3 - 1) * 50); // コンボ3本目の読み
  });

  it("テストでは点が入らない（成績とゲームスコアは別物）", () => {
    let s = createSession({ stage, mode: "test", rng: seededRng(22) });
    const word = currentWord(s)!;
    s = arcadeReducer(s, { type: "submitReading", input: word.reading });
    s = arcadeReducer(s, { type: "chooseMeaning", choice: word.meaningEn });
    expect(s.score).toBe(0);
    expect(summarize(s).score).toBe(2); // 成績のほうには 読み1点＋意味1点
  });

  it("外すとコンボと加点表示がリセットされる", () => {
    let s = createSession({ stage, mode: "practice", rng: seededRng(23) });
    const word = currentWord(s)!;
    s = arcadeReducer(s, { type: "submitReading", input: word.reading });
    expect(s.combo).toBe(1);
    s = arcadeReducer(s, { type: "chooseMeaning", choice: "___ありえない選択肢___" });
    expect(s.combo).toBe(0);
    expect(s.lastGain).toBe(0);
  });

  it("ふりがなの表示はテストでは既定OFF、れんしゅうでは既定ON", () => {
    expect(createSession({ stage, mode: "test", rng: seededRng(1) }).furiganaOn).toBe(false);
    expect(createSession({ stage, mode: "practice", rng: seededRng(1) }).furiganaOn).toBe(true);
  });

  it("出題数はステージの questionCount を超えない", () => {
    const s = createSession({ stage, mode: "test", rng: seededRng(12) });
    expect(s.questions).toHaveLength(stage.questionCount);
    const ids = s.questions.map((q) => q.word.id);
    expect(new Set(ids).size).toBe(ids.length); // 同じ語を二度出さない
  });

  it("4択には必ず正解が1つだけ入る", () => {
    const s = createSession({ stage, mode: "test", rng: seededRng(13) });
    for (const q of s.questions) {
      expect(q.choices).toHaveLength(4);
      expect(q.choices.filter((c) => c === q.word.meaningEn)).toHaveLength(1);
    }
  });
});
