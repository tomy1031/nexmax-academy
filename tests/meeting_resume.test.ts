import { describe, expect, it } from "vitest";
import {
  clearMeetingResume,
  FRESH_START,
  frontierFrom,
  readMeetingResume,
  restoreMeeting,
  saveMeetingResume,
  startFrom,
  type MeetingResume,
} from "../src/lib/meeting/resume";
import { heartsOf } from "../src/lib/meeting/affection";
import { createMemoryBackend, recordContentProgress } from "../src/lib/progress/store";

/**
 * つづきから はじめる。
 *
 * 進捗には `position: { panel: at }` を **書いて いたのに 読んで いなかった**ので、
 * 6問目まで 進めて 閉じた 学習者は 1問目から やり直しに なっていた。
 * どこから 始めるかの 判断を 純関数に 出して、ここで 固定する。
 */

const IDS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];

function savedAt(index: number, extra: Partial<MeetingResume> = {}): MeetingResume {
  return {
    meetingId: "kaisha_houkoku_meeting",
    index,
    openIds: ["q1", "q2"],
    answers: { q1: "ホームページです。", q2: "アプリです。" },
    affection: { perQuestion: { q1: 2, q2: 1 }, finished: false },
    round: "ask",
    found: [],
    missedIds: [],
    ...extra,
  };
}

/** 保存値を そのまま スキーマに 通す（古い 形が 読めるかの 検査に つかう）。 */
function readable(raw: Record<string, unknown>): MeetingResume {
  const backend = createMemoryBackend();
  backend.set("nexmax:v1:meeting-resume:kaisha_houkoku_meeting", JSON.stringify(raw));
  const got = readMeetingResume("kaisha_houkoku_meeting", backend);
  if (!got) throw new Error("読めなかった");
  return got;
}

describe("どこから 始めるか", () => {
  it("しおりが 6問目を 指して いたら、6問目から（1問目に 戻さない）", () => {
    expect(startFrom(null, 5, IDS).index).toBe(5);
    expect(startFrom(null, 5, IDS).resumed).toBe(true);
  });

  it("開いた札・答え・ハートも いっしょに 戻る", () => {
    const start = startFrom(savedAt(5), 5, IDS);
    expect(start.index).toBe(5);
    // 6問目に いる＝1〜5問目は 通りすぎて いる。1回で 言えなかった しつもんの 札も
    // 開いた ことに する（2026-08-21 の 指摘。P8: できなかった ことを 数えない）
    expect(start.openIds).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(start.answers).toEqual({ q1: "ホームページです。", q2: "アプリです。" });
    expect(heartsOf(start.affection)).toBe(3);
  });

  /*
   * 位置が 質問の 数に とどいた ＝「聞く ばん（ラウンド2）に 進んだ」。
   * ラウンド2が できる 前は これを「完走ずみ」と 読んで はじめに 戻して いたが、
   * いま 戻すと **聞く ばんに 入った 人が 毎回 1問目へ 落ちる**（2026-08-21）。
   */
  it("聞く ばんに 進んだ ところは、そのまま 聞く ばんへ 戻す", () => {
    const start = startFrom(savedAt(IDS.length), IDS.length, IDS);
    expect(start.index).toBe(IDS.length);
    expect(start.round).toBe("listen");
    expect(start.resumed).toBe(true);
  });

  it("聞く ばんに いた ことは 保存から も 読む（位置が 途中でも）", () => {
    const start = startFrom(savedAt(3, { round: "listen", found: ["e1"] }), 3, IDS);
    expect(start.round).toBe("listen");
    expect(start.found).toEqual(["e1"]);
  });

  it("教材の 質問が 減って いたら はじめから（はみ出す 位置に 座らせない）", () => {
    expect(startFrom(savedAt(5), 5, ["q1", "q2", "q3"])).toEqual(FRESH_START);
  });

  /* この 欄が 無い ころの 保存値も 読める（消えた ぶんだけ 1問目に 戻さない） */
  it("round と found が 無い 古い 保存でも 読める", () => {
    const backend = createMemoryBackend();
    const old = { ...savedAt(2) } as Record<string, unknown>;
    delete old.round;
    delete old.found;
    backend.set("nexmax:v1:meeting-resume:kaisha_houkoku_meeting", JSON.stringify(old));
    const saved = readMeetingResume("kaisha_houkoku_meeting", backend);
    expect(saved?.round).toBe("ask");
    expect(saved?.found).toEqual([]);
  });

  it("消えた 質問の 答え・ハートは 戻さない（先生が 入れかえた あと）", () => {
    const start = startFrom(savedAt(2), 2, ["q1", "q3", "q4"]);
    // 札は「位置より 前は 開く」で 決まるので、入れかえの あとは いまの 並びに 従う
    //（答え・ハートは 消えた 質問の ぶんを 落とす。こちらが 先生の 成績に つながる）
    expect(start.openIds).toEqual(["q1", "q3"]);
    expect(start.answers).toEqual({ q1: "ホームページです。" });
    expect(heartsOf(start.affection)).toBe(2);
  });

  it("完走ボーナスは 引き継がない（話しきる 前に ごほうびを 開けない）", () => {
    const start = startFrom(
      savedAt(3, { affection: { perQuestion: { q1: 2 }, finished: true } }),
      3,
      IDS,
    );
    expect(start.affection.finished).toBe(false);
  });

  it("しおりが 無い・こわれて いる ときは はじめから", () => {
    expect(startFrom(null, undefined, IDS)).toEqual(FRESH_START);
    expect(startFrom(null, -2, IDS)).toEqual(FRESH_START);
    expect(startFrom(null, 2.5, IDS)).toEqual(FRESH_START);
  });

  it("1問目で まだ 何も していない ときは「つづき」と 言わない", () => {
    expect(startFrom(savedAt(0, { openIds: [], answers: {} }), 0, IDS)).toEqual(FRESH_START);
  });

  it("1問目でも 札や ハートが あれば 戻す（答えた ぶんを 捨てない）", () => {
    const start = startFrom(savedAt(0, { openIds: ["q1"], answers: { q1: "ソカです。" } }), 0, IDS);
    expect(start.index).toBe(0);
    expect(start.openIds).toEqual(["q1"]);
    expect(start.resumed).toBe(true);
  });

  it("しおりと 内訳が 食い違ったら 内訳を 採る（位置と 札を ずらさない）", () => {
    const start = startFrom(savedAt(2), 5, IDS);
    expect(start.index).toBe(2);
    expect(start.openIds).toEqual(["q1", "q2"]);
  });
});

describe("端末への 読み書き", () => {
  it("書いた ものが そのまま 読める", () => {
    const backend = createMemoryBackend();
    const resume = savedAt(3);
    saveMeetingResume(resume, backend);
    expect(readMeetingResume("kaisha_houkoku_meeting", backend)).toEqual(resume);
  });

  it("進捗ストアと 同じ 名前空間の 鍵に 書く", () => {
    const backend = createMemoryBackend();
    saveMeetingResume(savedAt(3), backend);
    expect(backend.get("nexmax:v1:meeting-resume:kaisha_houkoku_meeting")).not.toBeNull();
  });

  it("まだ 無いとき・壊れているときは null（学習は 止めない）", () => {
    const backend = createMemoryBackend();
    expect(readMeetingResume("nothing", backend)).toBeNull();
    backend.set("nexmax:v1:meeting-resume:broken", "{{{");
    expect(readMeetingResume("broken", backend)).toBeNull();
    backend.set("nexmax:v1:meeting-resume:odd", JSON.stringify({ meetingId: 1 }));
    expect(readMeetingResume("odd", backend)).toBeNull();
  });

  it("消したら はじめからに 戻る", () => {
    const backend = createMemoryBackend();
    saveMeetingResume(savedAt(3), backend);
    clearMeetingResume("kaisha_houkoku_meeting", backend);
    expect(readMeetingResume("kaisha_houkoku_meeting", backend)).toBeNull();
  });
});

describe("しおりと 内訳を 突き合わせる（restoreMeeting）", () => {
  it("しおりだけ 残って いても 位置は 戻る", () => {
    const backend = createMemoryBackend();
    recordContentProgress(
      "kaisha_houkoku_meeting",
      { status: "started", position: { panel: 5 } },
      backend,
    );
    const start = restoreMeeting("kaisha_houkoku_meeting", IDS, backend);
    expect(start.index).toBe(5);
    expect(start.resumed).toBe(true);
    // 内訳が 無くても 位置は 分かる。通りすぎた 5問は 開く
    expect(start.openIds).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });

  it("両方 あれば 札も ハートも 戻る", () => {
    const backend = createMemoryBackend();
    recordContentProgress(
      "kaisha_houkoku_meeting",
      { status: "started", position: { panel: 5 } },
      backend,
    );
    saveMeetingResume(savedAt(5), backend);
    const start = restoreMeeting("kaisha_houkoku_meeting", IDS, backend);
    expect(start.index).toBe(5);
    expect(start.openIds).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(heartsOf(start.affection)).toBe(3);
  });

  it("何も 無ければ はじめから", () => {
    expect(restoreMeeting("kaisha_houkoku_meeting", IDS, createMemoryBackend())).toEqual(
      FRESH_START,
    );
  });
});

/**
 * できなかった しつもん（2026-08-23 の 指定）
 *
 * ひとことでも 言えば 開く、では **できなかった ことが できた ことに 化ける**。
 * 開いた札の 裏に「できなかった」を 持ち、開き直しても 化けない ことを 固定する。
 */
describe("できなかった しつもん", () => {
  it("赤い 印は 開き直しても 残る", () => {
    const start = startFrom(savedAt(4, { missedIds: ["q3"] }), 4, IDS);
    expect(start.missedIds).toEqual(["q3"]);
  });

  /*
   * 通りすぎた ぶんは 開いた ことに する（2026-08-21 の 規則）。その 規則と
   * ぶつかる ので、**できなかった ものは 開いた札から 引く**——両方に 入って
   * いると 板が 2色に なる。
   */
  it("通りすぎた 札の 規則より、できなかった 印が 強い", () => {
    const start = startFrom(savedAt(4, { missedIds: ["q3"] }), 4, IDS);
    expect(start.openIds).not.toContain("q3");
    expect(start.openIds).toContain("q1");
  });

  it("教材から 消えた しつもんの 印は 引き継がない", () => {
    const start = startFrom(savedAt(4, { missedIds: ["q3", "kesita"] }), 4, IDS);
    expect(start.missedIds).toEqual(["q3"]);
  });

  it("欄が 無い 古い 保存値でも 読める", () => {
    const old = { ...savedAt(4) } as Record<string, unknown>;
    delete old.missedIds;
    expect(readable(old).missedIds).toEqual([]);
  });
});

/**
 * **どこまで 札を 押せるか**（2026-08-28 の 指摘
 *「7まで終わったのに一度他の問題をクリックしたら8がクリックできなくなっている」）
 *
 * 押せる 範囲を「いま いる ところ」で 決めて いた。ところが 札を 押して 前へ 戻ると
 * いま いる ところは **下がる**——7問 終えた 人が 2問目を 押した 瞬間に、
 * 8問目の 札が 押せなく なって いた。戻る ことが、進んだ ぶんを 取り上げる 罰に なる。
 *
 * 進んだ ところは 下がらない。しおりに 欄を 足さず、**答えた いちばん うしろ**から 起こす。
 */
describe("いちばん 先まで 聞かれた ところ", () => {
  const start = (index: number, openIds: string[], missedIds: string[] = []) => ({
    ...FRESH_START,
    index,
    openIds,
    missedIds,
  });

  it("ふつうは いま いる ところ", () => {
    expect(frontierFrom(start(3, ["q1", "q2", "q3"]), IDS)).toBe(3);
  });

  it("前の しつもんへ 戻った あとでも、進んだ ところは 下がらない", () => {
    // 7問 答えて 8問目に いた 人が、2問目を 押し直して 閉じた
    const saved = start(1, ["q1", "q2", "q3", "q4", "q5", "q6", "q7"]);
    expect(frontierFrom(saved, IDS)).toBe(7);
  });

  it("できなかった 印も「聞かれた」に 数える", () => {
    expect(frontierFrom(start(0, ["q1"], ["q5"]), IDS)).toBe(5);
  });

  it("はじめての 人は 0（1問目だけ 押せる）", () => {
    expect(frontierFrom(FRESH_START, IDS)).toBe(0);
  });

  it("しつもんの 数を こえない", () => {
    expect(frontierFrom(start(IDS.length, IDS, []), IDS)).toBe(IDS.length);
  });

  it("教材から 消えた しつもんの 印には 引っぱられない", () => {
    expect(frontierFrom(start(2, ["q1", "q2"], ["kesita"]), IDS)).toBe(2);
  });
});
