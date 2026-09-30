/**
 * Live に 渡す ときだけの 読みかえ（scripts/lib/speak_as.ts）の 見張り
 *
 * 2026-09-30 の 指摘「issue の 発音が 異臭の ように なって いた。アクセントが イシューの イに」。
 */
import { describe, expect, it } from "vitest";
import { ISSUE_TRIALS, speechInputOf, trialInputOf } from "../scripts/lib/speak_as";

describe("Live に 渡す 文", () => {
  it("Issue は 小文字の issue に して 渡す（指示は 足さない。2026-09-30 の 聞きくらべで OK）", () => {
    const out = speechInputOf("GitHubの Issueを 作ったので、確認して ください。", "BASE");
    expect(out.text).toBe("GitHubの issueを 作ったので、確認して ください。");
    expect(out.instruction).toBe("BASE");
  });

  it("読みかえる 語が 無い 文は そのまま（指示も 足さない）", () => {
    const out = speechInputOf("原因は 分かって いますか。", "BASE");
    expect(out).toEqual({ text: "原因は 分かって いますか。", instruction: "BASE" });
  });
});

describe("Issue の 聞きくらべ（渡しかたを 変える）", () => {
  it("渡しかた ごとに Issue を 置きかえ、指示は その ぶんだけ 足す", () => {
    const text = "GitHubの Issueを 作ったので、確認して ください。";
    const outs = ISSUE_TRIALS.map((trial) => trialInputOf(text, "BASE", trial));
    expect(outs.map((out) => out.text)).toEqual([
      "GitHubの issueを 作ったので、確認して ください。",
      "GitHubの issueを 作ったので、確認して ください。",
      "GitHubの イシューを 作ったので、確認して ください。",
      "GitHubの イッシューを 作ったので、確認して ください。",
    ]);
    expect(outs[0]!.instruction).toBe("BASE");
    expect(outs[1]!.instruction).toContain("英語");
  });
});
