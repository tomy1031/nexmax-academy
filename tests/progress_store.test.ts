import { describe, expect, it } from "vitest";
import {
  createMemoryBackend,
  createProgressStore,
  type TestResult,
} from "../src/lib/progress/store";

function makeResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    stageId: "stage01",
    score: 34,
    maxScore: 40,
    readingCorrect: 18,
    meaningCorrect: 16,
    total: 20,
    passed: true,
    at: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("進捗の保存層", () => {
  it("テストの正式な点数は初回だけを残す（再挑戦で上書きしない）", () => {
    const store = createProgressStore(createMemoryBackend());
    store.recordFirstTestResult(makeResult({ score: 34 }));
    const second = store.recordFirstTestResult(makeResult({ score: 40 }));
    expect(second.score).toBe(34);
    expect(store.readTestResult("stage01")?.score).toBe(34);
  });

  /**
   * もんだい（quizset）の点も ここに残す。読み／意味の内わけは
   * ことばのテストにしか無い数え方なので、無いまま記録できることを固定する。
   */
  it("読み／意味の内わけが無い成績（もんだい）も、初回だけ残す", () => {
    const store = createProgressStore(createMemoryBackend());
    store.recordFirstTestResult({
      stageId: "kaisha_shirabekata_check",
      score: 6,
      maxScore: 7,
      total: 6,
      passed: true,
      at: "2026-08-15T00:00:00.000Z",
    });
    const retried = store.recordFirstTestResult({
      stageId: "kaisha_shirabekata_check",
      score: 7,
      maxScore: 7,
      total: 6,
      passed: true,
      at: "2026-08-15T01:00:00.000Z",
    });
    expect(retried.score).toBe(6);
    expect(store.readTestResult("kaisha_shirabekata_check")?.readingCorrect).toBeUndefined();
  });

  it("ゲームスコアはテスト成績とは別に、最高記録だけ伸ばす", () => {
    const store = createProgressStore(createMemoryBackend());
    store.recordGameScore("stage01", 100, 3);
    const next = store.recordGameScore("stage01", 80, 7);
    expect(next.bestScore).toBe(100);
    expect(next.bestCombo).toBe(7);
    expect(next.plays).toBe(2);
    // ゲームを何度遊んでも正式な成績には現れない
    expect(store.readTestResult("stage01")).toBeNull();
  });

  it("語ごとの履歴を積み上げる（スケジューラの材料）", () => {
    const store = createProgressStore(createMemoryBackend());
    const now = new Date("2026-07-28T10:00:00.000Z");
    store.recordAttempts(
      "stage01",
      [
        { wordId: "a", correct: true },
        { wordId: "b", correct: false },
      ],
      now,
    );
    store.recordAttempts("stage01", [{ wordId: "b", correct: false }], now);
    const mastery = store.readMastery("stage01");
    expect(mastery.a).toEqual({ seen: 1, missed: 0, lastMissedAt: undefined });
    expect(mastery.b?.seen).toBe(2);
    expect(mastery.b?.missed).toBe(2);
    expect(mastery.b?.lastMissedAt).toBe(now.toISOString());
  });

  it("解錠は追記され、重複しない", () => {
    const store = createProgressStore(createMemoryBackend());
    expect(store.isUnlocked("stage02")).toBe(false);
    store.unlock("stage02");
    store.unlock("stage02");
    expect(store.isUnlocked("stage02")).toBe(true);
  });

  it("壊れた保存値を読んでも落ちない", () => {
    const backend = createMemoryBackend();
    backend.set("nexmax:v1:unlocked", "{壊れたJSON");
    const store = createProgressStore(backend);
    expect(store.isUnlocked("stage01")).toBe(false);
  });
});
