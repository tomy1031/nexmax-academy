import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "../src/content/schema";
import { FEEDBACK, INPUT_ISSUE_FEEDBACK, getFeedback, type Feedback } from "../src/lib/feedback";

/** as const satisfies で各要素がリテラル型に絞られるため、共通形として読み直す。 */
const ALL = Object.entries(FEEDBACK) as [string, Feedback][];

describe("フィードバック辞書（P8の語彙規律）", () => {
  it("学習者に見せる文言に禁止語が入っていない", () => {
    for (const [key, message] of ALL) {
      const text = `${message.title} ${message.next ?? ""}`;
      for (const word of FORBIDDEN_LEARNER_WORDS) {
        expect(text.includes(word), `${key} に禁止語「${word}」がある`).toBe(false);
      }
    }
  });

  it("励まし系には必ず「次の行動」がある（励まし＋次の行動）", () => {
    for (const [key, message] of ALL) {
      if (message.tone === "encourage" || message.tone === "hint") {
        expect(message.next, `${key} に次の行動がない`).toBeTruthy();
      }
    }
  });

  it("入力の問題はすべて文言キーに写せる", () => {
    for (const key of Object.values(INPUT_ISSUE_FEEDBACK)) {
      expect(getFeedback(key)).toBeDefined();
    }
  });
});
