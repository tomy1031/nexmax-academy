import { describe, expect, it } from "vitest";
import {
  createKeywordHunt,
  createReveal,
  POINTS_PER_KEYWORD,
  revealRate,
  revealWith,
  submitKeyword,
} from "../src/components/meeting/listening-checks";

describe("キーワード発見", () => {
  const keywords = ["テスト", "サーバー", "原因"];

  it("聞こえた言葉を見つけると点が入る", () => {
    const result = submitKeyword(createKeywordHunt(keywords), "テスト");
    expect(result.hit).toBe("テスト");
    expect(result.state.found).toEqual(["テスト"]);
    expect(result.state.score).toBe(POINTS_PER_KEYWORD);
    expect(result.state.remaining).toHaveLength(2);
  });

  it("表記がちがっても当たる（旧実装は漢字用とかな用を別々に持っていた）", () => {
    expect(submitKeyword(createKeywordHunt(keywords), "てすと").hit).toBe("テスト");
    expect(submitKeyword(createKeywordHunt(keywords), "ｻｰﾊﾞｰ").hit).toBe("サーバー");
    expect(submitKeyword(createKeywordHunt(["原因"]), "げんいん").hit).toBeNull(); // 読みは別物なので当てない
  });

  it("同じ言葉を二度入れても点は増えず、入れ直しだと分かる", () => {
    const first = submitKeyword(createKeywordHunt(keywords), "テスト");
    const second = submitKeyword(first.state, "テスト");
    expect(second.hit).toBeNull();
    expect(second.duplicate).toBe(true);
    expect(second.state.score).toBe(POINTS_PER_KEYWORD);
  });

  it("台本にない言葉では何も起きない", () => {
    const result = submitKeyword(createKeywordHunt(keywords), "りんご");
    expect(result.hit).toBeNull();
    expect(result.duplicate).toBe(false);
  });

  it("空の入力は無視する", () => {
    const state = createKeywordHunt(keywords);
    expect(submitKeyword(state, "  ").state).toBe(state);
  });
});

describe("隠し原稿リベール", () => {
  const transcript = "サーバーが止まっています。原因はまだ分かりません。";

  it("最初は記号だけが見えていて、文字は隠れている", () => {
    const state = createReveal(transcript);
    expect(revealRate(state)).toBeLessThan(20);
    expect(state.revealed.has(transcript.indexOf("。"))).toBe(true);
  });

  it("入れた言葉の場所が見えるようになる", () => {
    const { state, newlyRevealed } = revealWith(createReveal(transcript), "サーバー");
    expect(newlyRevealed).toBe(4);
    for (let i = 0; i < 4; i += 1) expect(state.revealed.has(i)).toBe(true);
  });

  it("同じ言葉が2回出てきたら両方見える", () => {
    const text = "原因は原因です";
    const { newlyRevealed } = revealWith(createReveal(text), "原因");
    expect(newlyRevealed).toBe(4);
  });

  it("ひらがなで入れても漢字の場所が見える、とはしない（読みは別入力）", () => {
    const { newlyRevealed } = revealWith(createReveal(transcript), "げんいん");
    expect(newlyRevealed).toBe(0);
  });

  it("カタカナ・半角の違いは吸収する", () => {
    const { newlyRevealed } = revealWith(createReveal(transcript), "ｻｰﾊﾞｰ");
    expect(newlyRevealed).toBe(4);
  });

  it("二度入れても表示率は増えない", () => {
    const once = revealWith(createReveal(transcript), "原因");
    const twice = revealWith(once.state, "原因");
    expect(twice.newlyRevealed).toBe(0);
    expect(revealRate(twice.state)).toBe(revealRate(once.state));
  });

  it("台本にない言葉では何も出ない", () => {
    const { newlyRevealed } = revealWith(createReveal(transcript), "りんご");
    expect(newlyRevealed).toBe(0);
  });
});
