import { describe, expect, it } from "vitest";
import {
  AFFECTION_POINTS,
  awardAnswer,
  awardCompletion,
  COMPLETION_BONUS,
  EMPTY_AFFECTION,
  filledHearts,
  heartsOf,
  minimumHearts,
  pointsForGrade,
  rewardOpen,
  type AffectionState,
} from "../src/lib/meeting/affection";
import {
  formatRecordDate,
  readMeetingRecord,
  saveMeetingRecord,
  shortAsk,
} from "../src/lib/meeting/record";
import { createMemoryBackend } from "../src/lib/progress/store";

/**
 * 好感度と きろく。
 *
 * 加点の配り方と閾値の判定を**画面から出して純関数にした**のは、ここで固定するため。
 * 画面の中に置くと、レイアウトを直すたびに黙って基準が動く（判定3段の gradeOf と同じ考え方）。
 */

/** 質問6問を、ぜんぶ同じ判定で通したときの状態。 */
function runAll(ids: readonly string[], grade: Parameters<typeof pointsForGrade>[0]) {
  return ids.reduce<AffectionState>((state, id) => awardAnswer(state, id, grade), EMPTY_AFFECTION);
}

describe("ハートは 下がらない", () => {
  it("言い直して 悪くなっても 減らない", () => {
    const good = awardAnswer(EMPTY_AFFECTION, "q1", "veryGood");
    const after = awardAnswer(good, "q1", "miss");
    expect(heartsOf(after)).toBe(heartsOf(good));
  });

  it("同じ質問で 何度 答えても、その質問の いちばん よい 1回ぶんだけ", () => {
    let state = awardAnswer(EMPTY_AFFECTION, "q1", "miss");
    expect(heartsOf(state)).toBe(AFFECTION_POINTS.miss);
    // 言い直して よくなったぶんは 足りない ぶんだけ 足す（言い直しが 損にならない）
    state = awardAnswer(state, "q1", "good");
    expect(heartsOf(state)).toBe(AFFECTION_POINTS.good);
    // 3回目も 同じ判定なら もう 増えない（言い直した人ほど 貯まる、を防ぐ）
    state = awardAnswer(state, "q1", "good");
    expect(heartsOf(state)).toBe(AFFECTION_POINTS.good);
  });

  it("変わらないときは 同じ状態を そのまま返す（祝いの演出を 空打ちしない）", () => {
    const state = awardAnswer(EMPTY_AFFECTION, "q1", "veryGood");
    expect(awardAnswer(state, "q1", "miss")).toBe(state);
    expect(awardCompletion(awardCompletion(state))).toEqual(awardCompletion(state));
  });
});

describe("点の配り方", () => {
  it("miss でも 0点には しない（会話を 前に 進めた ことは 変わらない）", () => {
    expect(pointsForGrade("miss")).toBeGreaterThan(0);
    expect(pointsForGrade("veryGood")).toBe(2);
    expect(pointsForGrade("good")).toBe(2);
    expect(pointsForGrade("miss")).toBe(1);
  });

  it("判定を通せなかった ときは、こちらの都合なので 学習者から 引かない", () => {
    expect(pointsForGrade(null)).toBeGreaterThanOrEqual(pointsForGrade("miss"));
  });

  it("完走ボーナスは さいごに 1度だけ", () => {
    const answered = runAll(["q1", "q2"], "good");
    expect(heartsOf(awardCompletion(answered))).toBe(heartsOf(answered) + COMPLETION_BONUS);
    expect(heartsOf(awardCompletion(awardCompletion(answered)))).toBe(
      heartsOf(answered) + COMPLETION_BONUS,
    );
  });
});

describe("とっておきの話が 開く 条件", () => {
  const ids = ["q1", "q2", "q3", "q4", "q5", "q6"];

  it("さいごまで 話しきるまでは 開かない（貯まっていても）", () => {
    const answered = runAll(ids, "veryGood");
    expect(heartsOf(answered)).toBeGreaterThanOrEqual(8);
    expect(rewardOpen(answered, 8)).toBe(false);
    expect(rewardOpen(awardCompletion(answered), 8)).toBe(true);
  });

  it("ぜんぶ miss でも、完走すれば 最低ラインに とどく", () => {
    const finished = awardCompletion(runAll(ids, "miss"));
    expect(heartsOf(finished)).toBe(minimumHearts(ids.length));
    // 教材が threshold を この線以下に していれば、答えきった人は かならず 開ける
    expect(rewardOpen(finished, minimumHearts(ids.length))).toBe(true);
  });

  it("最低ラインは「miss×全問＋完走ボーナス」", () => {
    expect(minimumHearts(6)).toBe(6 * AFFECTION_POINTS.miss + COMPLETION_BONUS);
  });
});

describe("メーターの 塗り", () => {
  it("満タンを 超えても はみ出さない・マイナスにも ならない", () => {
    expect(filledHearts(14, 10)).toBe(10);
    expect(filledHearts(0, 10)).toBe(0);
    expect(filledHearts(-3, 10)).toBe(0);
    expect(filledHearts(7, 10)).toBe(7);
  });
});

describe("札と きろくの ラベル", () => {
  it("あいさつではなく 聞かれた ことを 取り出す", () => {
    expect(shortAsk("はじめまして。わたしは ヘンディです。お名前を おしえて ください。")).toBe(
      "お名前を おしえて ください。",
    );
  });

  it("「〜か」で 終わる 文が あれば、その 最初の 1つ", () => {
    expect(shortAsk("日本語の 勉強は、どうですか。むずかしいですか。")).toBe(
      "日本語の 勉強は、どうですか。",
    );
    expect(shortAsk("ソカさんは、どこから 来ましたか。")).toBe("ソカさんは、どこから 来ましたか。");
  });

  it("長すぎる ときだけ 切る（要約は しない）", () => {
    expect(shortAsk("あいうえおかきくけこ", 20)).toBe("あいうえおかきくけこ");
    expect(shortAsk("あいうえおかきくけこさしすせそ", 10)).toBe("あいうえおかきくけこ…");
  });

  it("日付は 数字だけで 出す（読み辞書の 無い 漢字を 画面に 出さない）", () => {
    expect(formatRecordDate("2026-08-15T04:05:06.000Z")).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(formatRecordDate("こわれた")).toBe("");
  });
});

describe("きろくの 保存", () => {
  it("書いたものが そのまま 読める", () => {
    const backend = createMemoryBackend();
    const record = {
      meetingId: "hajimari_meeting",
      at: "2026-08-15T04:05:06.000Z",
      lines: [{ questionId: "q1", ask: "お名前を おしえて ください。", answer: "ソカです。" }],
      hearts: 8,
      maxHearts: 10,
    };
    saveMeetingRecord(record, backend);
    expect(readMeetingRecord("hajimari_meeting", backend)).toEqual(record);
  });

  it("まだ 無いとき・壊れているときは null（学習は 止めない）", () => {
    const backend = createMemoryBackend();
    expect(readMeetingRecord("nothing", backend)).toBeNull();
    backend.set("nexmax:v1:meeting-record:broken", "{{{");
    expect(readMeetingRecord("broken", backend)).toBeNull();
    backend.set("nexmax:v1:meeting-record:odd", JSON.stringify({ meetingId: 1 }));
    expect(readMeetingRecord("odd", backend)).toBeNull();
  });
});
