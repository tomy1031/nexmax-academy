import { describe, expect, it } from "vitest";
import {
  clearQuizResume,
  FRESH_QUIZ_START,
  readQuizResume,
  restoreQuiz,
  saveQuizResume,
  startFrom,
  type QuizResume,
} from "../src/lib/quiz/resume";
import { createMemoryBackend, recordContentProgress } from "../src/lib/progress/store";

/**
 * つづきから はじめる（もんだい／quizset 版）。
 *
 * 「ほうこくの じゅんび」は 9問・約17分。`quiz-runner.tsx` は 毎回
 * `createQuizSession(set)`（`quiz-reducer.ts` は 常に index 0）で 始まり、進捗には
 * `status`（started/completed）しか 書いて いなかった。授業の チャイムで 中断した
 * 班は、次に 開くと また 1問目からに なっていた。どこから 始めるかの 判断を
 * 純関数に 出して、ここで 固定する（`tests/meeting_resume.test.ts` と 同じ 形）。
 */

const IDS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"];

function resultAt(id: string, correct = true, earned = 1) {
  return { questionId: id, correct, earned, answer: `こたえ-${id}` };
}

function savedThrough(count: number, ids: readonly string[] = IDS): QuizResume {
  return {
    quizSetId: "kaisha_houkoku",
    results: ids.slice(0, count).map((id, i) => resultAt(id, i % 2 === 0, 1)),
  };
}

describe("どこから 始めるか", () => {
  it("5問 答えた ところで 閉じたら、6問目から（1問目に 戻さない）", () => {
    const start = startFrom(savedThrough(5), undefined, IDS);
    expect(start.index).toBe(5);
    expect(start.resumed).toBe(true);
  });

  it("それまでの 結果（正解した 問題の ID・得点）も いっしょに 戻る", () => {
    const start = startFrom(savedThrough(5), undefined, IDS);
    expect(start.results).toHaveLength(5);
    expect(start.results[0]).toEqual({
      questionId: "q1",
      correct: true,
      earned: 1,
      answer: "こたえ-q1",
    });
    expect(start.results.map((r) => r.questionId)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });

  it("完走した あとに 開き直したら はじめから（何度でも 挑戦できる）", () => {
    expect(startFrom(savedThrough(IDS.length), undefined, IDS)).toEqual(FRESH_QUIZ_START);
  });

  it("教材が 直されて 問題が 減って いたら はじめから（はみ出す 位置に 座らせない）", () => {
    const shorter = IDS.slice(0, 3);
    expect(startFrom(savedThrough(5), undefined, shorter)).toEqual(FRESH_QUIZ_START);
  });

  it("問題の 並びが 入れかわって いたら はじめから（出題順が 前提の 内訳を 信じない）", () => {
    const reordered = [...IDS];
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(startFrom(savedThrough(5), undefined, reordered)).toEqual(FRESH_QUIZ_START);
  });

  it("壊れた・存在しない 保存値は 無視して はじめから", () => {
    expect(startFrom(null, undefined, IDS)).toEqual(FRESH_QUIZ_START);
    expect(startFrom(null, -2, IDS)).toEqual(FRESH_QUIZ_START);
    expect(startFrom(null, 2.5, IDS)).toEqual(FRESH_QUIZ_START);
  });

  it("1問も 答えて いない ときは「つづき」と 言わない", () => {
    expect(startFrom(savedThrough(0), undefined, IDS)).toEqual(FRESH_QUIZ_START);
    expect(startFrom(null, 0, IDS)).toEqual(FRESH_QUIZ_START);
  });

  it("しおり（進捗ストアの 位置）だけ 残って いても 位置は 戻る", () => {
    const start = startFrom(null, 5, IDS);
    expect(start.index).toBe(5);
    expect(start.resumed).toBe(true);
    expect(start.results).toEqual([]);
  });
});

describe("端末への 読み書き", () => {
  it("書いた ものが そのまま 読める", () => {
    const backend = createMemoryBackend();
    const resume = savedThrough(4);
    saveQuizResume(resume, backend);
    expect(readQuizResume("kaisha_houkoku", backend)).toEqual(resume);
  });

  it("進捗ストアと 同じ 名前空間の 鍵に 書く", () => {
    const backend = createMemoryBackend();
    saveQuizResume(savedThrough(4), backend);
    expect(backend.get("nexmax:v1:quiz-resume:kaisha_houkoku")).not.toBeNull();
  });

  it("まだ 無いとき・壊れて いる ときは null（学習は 止めない）", () => {
    const backend = createMemoryBackend();
    expect(readQuizResume("nothing", backend)).toBeNull();
    backend.set("nexmax:v1:quiz-resume:broken", "{{{");
    expect(readQuizResume("broken", backend)).toBeNull();
    backend.set("nexmax:v1:quiz-resume:odd", JSON.stringify({ quizSetId: 1 }));
    expect(readQuizResume("odd", backend)).toBeNull();
  });

  it("消したら はじめからに 戻る", () => {
    const backend = createMemoryBackend();
    saveQuizResume(savedThrough(4), backend);
    clearQuizResume("kaisha_houkoku", backend);
    expect(readQuizResume("kaisha_houkoku", backend)).toBeNull();
  });
});

describe("しおりと 内訳を 突き合わせる（restoreQuiz）", () => {
  it("しおりだけ 残って いても 位置は 戻る", () => {
    const backend = createMemoryBackend();
    recordContentProgress(
      "kaisha_houkoku",
      { status: "started", position: { question: 5 } },
      backend,
    );
    const start = restoreQuiz("kaisha_houkoku", IDS, backend);
    expect(start.index).toBe(5);
    expect(start.resumed).toBe(true);
    expect(start.results).toEqual([]);
  });

  it("両方 あれば 内訳も 戻る", () => {
    const backend = createMemoryBackend();
    recordContentProgress(
      "kaisha_houkoku",
      { status: "started", position: { question: 5 } },
      backend,
    );
    saveQuizResume(savedThrough(5), backend);
    const start = restoreQuiz("kaisha_houkoku", IDS, backend);
    expect(start.index).toBe(5);
    expect(start.results).toHaveLength(5);
  });

  it("何も 無ければ はじめから", () => {
    expect(restoreQuiz("kaisha_houkoku", IDS, createMemoryBackend())).toEqual(FRESH_QUIZ_START);
  });

  it("完走の しおり（問題数と 同じ 位置）だけが 残って いても はじめから", () => {
    const backend = createMemoryBackend();
    recordContentProgress(
      "kaisha_houkoku",
      { status: "completed", position: { question: IDS.length } },
      backend,
    );
    expect(restoreQuiz("kaisha_houkoku", IDS, backend)).toEqual(FRESH_QUIZ_START);
  });
});
