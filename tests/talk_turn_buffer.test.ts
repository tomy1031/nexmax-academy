import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../src/lib/progress/store";
import { bufferTalkTurn, bufferedTalkTurns, newTalkSessionId } from "../src/lib/records/talk-log";

function turn(over: Partial<Parameters<typeof bufferTalkTurn>[0]> = {}) {
  return {
    talkId: "kaisha-talk",
    sessionId: "s1",
    turnIndex: 0,
    speaker: "learner" as const,
    mode: "text" as const,
    body: "よろしく おねがいします",
    openedReqId: "",
    openedCount: 0,
    reqTotal: 5,
    ...over,
  };
}

describe("たいわの 会話を ためる（通信しない）", () => {
  it("ためた ものは 端末に 残る（流す 前に 画面を 出ても 消えない）", () => {
    const backend = createMemoryBackend();
    bufferTalkTurn(turn(), backend);
    bufferTalkTurn(turn({ turnIndex: 1, speaker: "partner", body: "はい" }), backend);
    expect(bufferedTalkTurns("kaisha-talk", backend).map((one) => one.body)).toEqual([
      "よろしく おねがいします",
      "はい",
    ]);
  });

  it("同じ 番を もう一度 ためても 1つ（字幕は 増えるたび 全部 通る）", () => {
    const backend = createMemoryBackend();
    bufferTalkTurn(turn(), backend);
    bufferTalkTurn(turn({ body: "言い直しました", openedReqId: "budget" }), backend);
    const buffered = bufferedTalkTurns("kaisha-talk", backend);
    expect(buffered).toHaveLength(1);
    expect(buffered[0]).toMatchObject({ body: "言い直しました", openedReqId: "budget" });
  });

  it("別の 回（session）なら 別の 行", () => {
    const backend = createMemoryBackend();
    bufferTalkTurn(turn(), backend);
    bufferTalkTurn(turn({ sessionId: "s2" }), backend);
    expect(bufferedTalkTurns("kaisha-talk", backend)).toHaveLength(2);
  });

  it("教材が ちがえば 別の 置き場", () => {
    const backend = createMemoryBackend();
    bufferTalkTurn(turn(), backend);
    expect(bufferedTalkTurns("hoka-talk", backend)).toEqual([]);
  });

  it("壊れた 保存値は「まだ 無い」として 扱う（会話は 続けられる）", () => {
    const backend = createMemoryBackend();
    backend.set("nexmax:v1:talk-turns:kaisha-talk", "{壊れている");
    expect(bufferedTalkTurns("kaisha-talk", backend)).toEqual([]);
    bufferTalkTurn(turn(), backend);
    expect(bufferedTalkTurns("kaisha-talk", backend)).toHaveLength(1);
  });

  it("1回の たいわ の 鍵は uuid の 形", () => {
    expect(newTalkSessionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
