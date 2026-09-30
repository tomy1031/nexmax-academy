/**
 * Live に 渡す ときだけの 読みかえ（scripts/lib/speak_as.ts）の 見張り
 *
 * 2026-09-30 の 指摘「issue の 発音が 異臭の ように なって いた。アクセントが イシューの イに」。
 */
import { describe, expect, it } from "vitest";
import { speechInputOf } from "../scripts/lib/speak_as";

describe("Live に 渡す 文", () => {
  it("Issue は カタカナに して、頭に アクセントを 置く 指示を 足す", () => {
    const out = speechInputOf("GitHubの Issueを 作ったので、確認して ください。", "BASE");
    expect(out.text).toBe("GitHubの イシューを 作ったので、確認して ください。");
    expect(out.instruction.startsWith("BASE")).toBe(true);
    expect(out.instruction).toContain("イ↘シュー");
  });

  it("読みかえる 語が 無い 文は そのまま（指示も 足さない）", () => {
    const out = speechInputOf("原因は 分かって いますか。", "BASE");
    expect(out).toEqual({ text: "原因は 分かって いますか。", instruction: "BASE" });
  });
});
