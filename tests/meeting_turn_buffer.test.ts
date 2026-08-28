import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../src/lib/progress/store";
import {
  bufferMeetingTurn,
  bufferedMeetingTurns,
  flushMeetingTurns,
  type MeetingTurnLog,
} from "../src/lib/meeting/log";

/**
 * 会話の 記録は **ためて、おわりに 1回**（2026-08-28 の 指定）
 *
 * ここで 固定するのは 3つ。
 *  ① ためる ときは 通信しない（端末に 積むだけ）
 *  ② 送れなかった ものは **消さない**——次に 開いた ときに もう一度 流せる
 *  ③ 壊れた 保存値でも 会話は 止まらない
 *
 * ②が いちばん 大事である。1往復ごとに 送るのを やめる ということは、
 * **送る 前に 消えうる 時間が 生まれる** ということなので、
 * 「送れなかったら 残す」が 崩れた 瞬間に 記録は 黙って 消える。
 */

function turn(overrides: Partial<MeetingTurnLog> = {}): MeetingTurnLog {
  return {
    meetingId: "kaisha_houkoku_meeting",
    questionId: "q1_itsu",
    attempt: 1,
    mode: "text",
    utterance: "2018年に できました。",
    judge: null,
    fallback: "none",
    model: "",
    latencyMs: 0,
    ...overrides,
  };
}

describe("会話の記録をためる", () => {
  it("ためた ぶんが 出題順に 並ぶ", () => {
    const backend = createMemoryBackend();
    bufferMeetingTurn(turn({ questionId: "q1_itsu" }), backend);
    bufferMeetingTurn(turn({ questionId: "q2_service", attempt: 1 }), backend);
    bufferMeetingTurn(turn({ questionId: "q2_service", attempt: 2 }), backend);

    const kept = bufferedMeetingTurns("kaisha_houkoku_meeting", backend);
    expect(kept.map((one) => `${one.questionId}#${one.attempt}`)).toEqual([
      "q1_itsu#1",
      "q2_service#1",
      "q2_service#2",
    ]);
  });

  it("ミーティングごとに 分けて 持つ（社長と ヘンディさんが 混ざらない）", () => {
    const backend = createMemoryBackend();
    bufferMeetingTurn(turn(), backend);
    bufferMeetingTurn(turn({ meetingId: "kaisha_matsui", questionId: "talk:talk" }), backend);

    expect(bufferedMeetingTurns("kaisha_houkoku_meeting", backend)).toHaveLength(1);
    expect(bufferedMeetingTurns("kaisha_matsui", backend)).toHaveLength(1);
  });

  it("ためすぎたら 古い ものから 捨てる（端末の 保存を 埋めない）", () => {
    const backend = createMemoryBackend();
    for (let i = 0; i < 250; i += 1) bufferMeetingTurn(turn({ attempt: i }), backend);

    const kept = bufferedMeetingTurns("kaisha_houkoku_meeting", backend);
    expect(kept).toHaveLength(200);
    // 新しい ほうを 残す（直近の 授業の ぶんが 消えるのが いちばん 困る）
    expect(kept[kept.length - 1]?.attempt).toBe(249);
  });

  it("送れなかった ものは 消さない（DBが 無い＝デモモードでも 記録は 残る）", async () => {
    const backend = createMemoryBackend();
    bufferMeetingTurn(turn(), backend);

    await flushMeetingTurns("kaisha_houkoku_meeting", backend);

    expect(bufferedMeetingTurns("kaisha_houkoku_meeting", backend)).toHaveLength(1);
  });

  it("壊れた 保存値は「まだ 無い」として 扱う", () => {
    const backend = createMemoryBackend();
    backend.set("nexmax:v1:meeting-turns:kaisha_houkoku_meeting", "{ こわれて いる");

    expect(bufferedMeetingTurns("kaisha_houkoku_meeting", backend)).toEqual([]);
    // その あとも 積める（会話は 止まらない）
    bufferMeetingTurn(turn(), backend);
    expect(bufferedMeetingTurns("kaisha_houkoku_meeting", backend)).toHaveLength(1);
  });
});
