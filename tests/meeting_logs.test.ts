import { describe, expect, it } from "vitest";
import { statsByQuestion, type MeetingLogRow } from "../src/lib/meeting/logs-db";

/**
 * きろくの畳み方。
 *
 * 先生が最初に見るのは「どの質問で止まるか」なので、並びが崩れると
 * 直す順が読み取れなくなる。並びと数え方をここで固定する。
 */

const row = (over: Partial<MeetingLogRow>): MeetingLogRow => ({
  id: Math.random().toString(36).slice(2),
  profile_id: "p1",
  meeting_id: "m1",
  question_id: "q1",
  attempt: 1,
  mode: "text",
  utterance: "わたしは ソカです。",
  judge: null,
  grade: "good",
  fallback: "none",
  model: "gemini",
  latency_ms: 100,
  created_at: "2026-08-13T00:00:00Z",
  ...over,
});

describe("しつもんごとの つまずき", () => {
  it("もう いちど の**割合**が 高い しつもんを 上に置く（回数ではなく割合）", () => {
    const rows = [
      // q1: 4回中1回（25%）
      ...Array.from({ length: 3 }, () => row({ question_id: "q1", grade: "good" })),
      row({ question_id: "q1", grade: "miss" }),
      // q2: 2回中1回（50%）— 回数は少ないが つまずきは 深い
      row({ question_id: "q2", grade: "veryGood" }),
      row({ question_id: "q2", grade: "miss" }),
    ];
    expect(statsByQuestion(rows).map((s) => s.questionId)).toEqual(["q2", "q1"]);
  });

  it("段ごとの数・言い直し・AIなしを 分けて数える", () => {
    const rows = [
      row({ grade: "veryGood" }),
      row({ grade: "good" }),
      row({ grade: "miss", attempt: 2 }),
      row({ grade: null, fallback: "noKey" }),
    ];
    const [stat] = statsByQuestion(rows);
    expect(stat).toMatchObject({
      questionId: "q1",
      turns: 4,
      veryGood: 1,
      good: 1,
      miss: 1,
      retried: 1,
      fallback: 1,
    });
  });

  it("きろくが 無ければ 空（表を出さない側の判断に使える）", () => {
    expect(statsByQuestion([])).toEqual([]);
  });
});
