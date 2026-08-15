import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "../src/content/schema";
import {
  FEEDBACK,
  FEEDBACK_FURIGANA,
  INPUT_ISSUE_FEEDBACK,
  getFeedback,
  type Feedback,
} from "../src/lib/feedback";
import { buildFuriganaIndex, uncoveredKanji } from "../src/lib/text/furigana";

/** as const satisfies で各要素がリテラル型に絞られるため、共通形として読み直す。 */
const ALL = Object.entries(FEEDBACK) as [string, Feedback][];

const KANJI = /[㐀-鿿々]/;
const KANJI_ALL = /[㐀-鿿々]/g;

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

/**
 * 規律2の機械検査。判定は画面と同じ合成器（annotateRuby）を通す uncoveredKanji で行う
 *（ここで走査規則を書き直すと「検査は通るのに画面ではルビが付かない」ズレが生まれる）。
 */
describe("フィードバック辞書のふりがな（規律2）", () => {
  const index = buildFuriganaIndex(FEEDBACK_FURIGANA);
  const lines = ALL.flatMap(([key, message]) =>
    [message.title, message.next ?? ""].filter(Boolean).map((text) => [key, text] as const),
  );

  it("検査対象に漢字がある（テストが空回りしていない）", () => {
    const kanji = new Set(lines.flatMap(([, text]) => text.match(KANJI_ALL) ?? []));
    expect(kanji.size).toBeGreaterThan(10);
  });

  it("すべての文言の漢字が読み辞書で覆われている", () => {
    for (const [key, text] of lines) {
      const uncovered = uncoveredKanji(text, index);
      expect(uncovered, `${key} の「${text}」に ふりがなの無い漢字 ${uncovered.join("")}`).toEqual(
        [],
      );
    }
  });

  it("読み辞書の読みはかなだけ（ルビに漢字を出さない）", () => {
    for (const [surface, reading] of FEEDBACK_FURIGANA) {
      expect(KANJI.test(reading), `${surface} の読み「${reading}」に漢字がある`).toBe(false);
    }
  });
});
