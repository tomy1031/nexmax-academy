import { describe, expect, it } from "vitest";
import { EMPTY_TALK, type TalkState } from "../src/lib/talkgame/affinity";
import {
  clearTalkResume,
  parseTalkResume,
  readTalkResume,
  readTalkResumeRaw,
  restoreTalk,
  saveTalkResume,
} from "../src/lib/talkgame/resume";
import { createMemoryBackend } from "../src/lib/progress/store";

const MID: TalkState = {
  round: "listen",
  percent: 60,
  found: ["カンボジアの プログラム", "観光DX"],
  turns: 5,
  asked: 1,
};

describe("つづきから 話す", () => {
  it("書いた ところから 読み戻せる", () => {
    const backend = createMemoryBackend();
    saveTalkResume("kaisha_matsui", MID, backend);
    expect(readTalkResume("kaisha_matsui", backend)).toEqual(MID);
    expect(restoreTalk("kaisha_matsui", backend)).toEqual(MID);
  });

  it("べつの 教材の しおりは 混ざらない", () => {
    const backend = createMemoryBackend();
    saveTalkResume("kaisha_matsui", MID, backend);
    expect(readTalkResume("hoka_no_kyouzai", backend)).toBeNull();
  });

  it("まだ 何も 無ければ まっさらから", () => {
    expect(restoreTalk("kaisha_matsui", createMemoryBackend())).toEqual(EMPTY_TALK);
  });

  it("満タンまで 行った 保存値は「無い」と 同じ（もう一度 はじめから 話せる）", () => {
    const backend = createMemoryBackend();
    saveTalkResume("kaisha_matsui", { ...MID, round: "clear", percent: 100 }, backend);
    expect(readTalkResume("kaisha_matsui", backend)).toBeNull();
  });

  it("壊れた 保存値でも 学習は 止まらない", () => {
    const backend = createMemoryBackend();
    backend.set("nexmax:v1:talkgame-resume:kaisha_matsui", "{ こわれた");
    expect(readTalkResume("kaisha_matsui", backend)).toBeNull();
    expect(parseTalkResume("[]")).toBeNull();
  });

  it("消したら 残らない", () => {
    const backend = createMemoryBackend();
    saveTalkResume("kaisha_matsui", MID, backend);
    clearTalkResume("kaisha_matsui", backend);
    expect(readTalkResumeRaw("kaisha_matsui", backend)).toBe("");
  });
});
