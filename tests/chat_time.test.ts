import { describe, expect, it } from "vitest";

import { chatTimeLabel } from "@/components/meeting/chat-panel";

/**
 * チャットの行の時刻（#142。2026-08-20 の見本の「時刻つき」）
 *
 * Zoom のチャットと同じく、時は0を付けず、分は2けたにする。24時間の形で出す。
 */
describe("チャットの時刻", () => {
  const at = (hour: number, minute: number) => new Date(2026, 9, 11, hour, minute).getTime();

  it("朝は「9:02」の形（時に0を付けない・分は2けた）", () => {
    expect(chatTimeLabel(at(9, 2))).toBe("9:02");
  });

  it("夜は24時間の形", () => {
    expect(chatTimeLabel(at(21, 30))).toBe("21:30");
  });

  it("0時台も「0:05」と出す", () => {
    expect(chatTimeLabel(at(0, 5))).toBe("0:05");
  });
});
