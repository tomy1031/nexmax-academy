import { describe, expect, it } from "vitest";
import {
  EMPTY_TALK,
  FLOOR,
  LISTEN_MAX_ASKS,
  LISTEN_MIN_ASKS,
  NO_OBSERVATIONS,
  TALK_TURN_CAP_RATIO,
  alreadyFound,
  applyTurn,
  breakdown,
  gainFor,
  normalizeTopic,
  type TalkObservations,
  type TalkPlan,
  type TalkState,
} from "../src/lib/talkgame/affinity";
import { localObservations, localTopic } from "../src/lib/talkgame/local";

const PLAN: TalkPlan = { goal: 100, openAt: 60, findCount: 5 };

const PERFECT: TalkObservations = {
  japanese: true,
  onTopic: true,
  concrete: true,
  reason: true,
  feeling: true,
  polite: true,
  question: true,
};

/** 話す ばんで n回 話す。話題は 毎回 新しい。 */
function talkFor(count: number, observations: TalkObservations): TalkState {
  let state = EMPTY_TALK;
  for (let i = 0; i < count; i += 1) {
    state = applyTurn(state, PLAN, observations, `はっけん${i}`).state;
  }
  return state;
}

describe("好感度は 下がらない", () => {
  it("どんな 答えでも 前の 値より 小さく ならない", () => {
    let state = EMPTY_TALK;
    for (let i = 0; i < 10; i += 1) {
      const before = state.percent;
      state = applyTurn(state, PLAN, NO_OBSERVATIONS, null).state;
      expect(state.percent).toBeGreaterThanOrEqual(before);
    }
  });

  it("噛み合わなくても 底（FLOOR）は 入る", () => {
    expect(gainFor("talk", NO_OBSERVATIONS)).toBe(FLOOR);
    expect(gainFor("listen", NO_OBSERVATIONS)).toBe(FLOOR);
  });
});

describe("観点で 上がる", () => {
  it("話す ばんは 中身と りゆうが 重い", () => {
    const withConcrete = gainFor("talk", { ...NO_OBSERVATIONS, japanese: true, concrete: true });
    const withPolite = gainFor("talk", { ...NO_OBSERVATIONS, japanese: true, polite: true });
    expect(withConcrete).toBeGreaterThan(withPolite);
  });

  it("聞く ばんは しつもんの 形が いちばん 重い", () => {
    const rows = breakdown("listen", PERFECT);
    expect(rows[0]?.key).toBe("question");
  });

  it("点の つかない 観点は 内訳に 出さない", () => {
    expect(breakdown("talk", PERFECT).map((row) => row.key)).not.toContain("question");
  });
});

describe("ばんの 切りかえ", () => {
  it("見つける 数に とどいたら 聞く ばんへ 変わる", () => {
    const state = talkFor(PLAN.findCount, PERFECT);
    expect(state.round).toBe("listen");
    expect(state.found).toHaveLength(PLAN.findCount);
  });

  it("見つからなくても 深掘りの 上限で 聞く ばんへ 進む", () => {
    let state = EMPTY_TALK;
    for (let i = 0; i < PLAN.findCount * TALK_TURN_CAP_RATIO; i += 1) {
      state = applyTurn(state, PLAN, NO_OBSERVATIONS, null).state;
    }
    expect(state.round).toBe("listen");
  });

  it("話しきったら、上手でなくても 聞く ばんの 入口（openAt）に 立てる", () => {
    const state = talkFor(PLAN.findCount, { ...NO_OBSERVATIONS, japanese: true });
    expect(state.percent).toBe(PLAN.openAt);
  });

  it("同じ 話題は 2回 数えない", () => {
    let state = EMPTY_TALK;
    state = applyTurn(state, PLAN, PERFECT, "カンボジアの プログラム").state;
    state = applyTurn(state, PLAN, PERFECT, "カンボジアのプログラム").state;
    expect(state.found).toHaveLength(1);
  });
});

describe("満タンで おわる", () => {
  it("聞く ばんを 話しきれば 100% に なる", () => {
    let state = talkFor(PLAN.findCount, { ...NO_OBSERVATIONS, japanese: true });
    for (let i = 0; i < LISTEN_MAX_ASKS; i += 1) {
      state = applyTurn(state, PLAN, NO_OBSERVATIONS, null).state;
    }
    expect(state.round).toBe("clear");
    expect(state.percent).toBe(PLAN.goal);
  });

  it("しつもんが 少なすぎる うちは おわらない", () => {
    let state = talkFor(PLAN.findCount, PERFECT);
    state = applyTurn(state, PLAN, PERFECT, null).state;
    expect(state.asked).toBeLessThan(LISTEN_MIN_ASKS);
    expect(state.round).toBe("listen");
  });

  it("満タンを こえない", () => {
    let state = talkFor(PLAN.findCount, PERFECT);
    for (let i = 0; i < LISTEN_MAX_ASKS; i += 1) {
      state = applyTurn(state, PLAN, PERFECT, null).state;
    }
    expect(state.percent).toBe(PLAN.goal);
  });

  it("クリアの あとは 動かない", () => {
    let state = talkFor(PLAN.findCount, PERFECT);
    for (let i = 0; i < LISTEN_MAX_ASKS; i += 1) {
      state = applyTurn(state, PLAN, PERFECT, null).state;
    }
    const after = applyTurn(state, PLAN, PERFECT, "あたらしい");
    expect(after.gained).toBe(0);
    expect(after.state).toBe(state);
  });
});

describe("話題の ならし", () => {
  it("空白と 記号を 落として 比べる", () => {
    expect(normalizeTopic("観光 DX・")).toBe(normalizeTopic("観光DX"));
    expect(alreadyFound(["観光DX"], "観光 DX")).toBe(true);
    expect(alreadyFound(["観光DX"], "NMClaw")).toBe(false);
  });

  it("空の ラベルは 見つけた ことに しない", () => {
    expect(alreadyFound([], "  ")).toBe(true);
  });
});

describe("鍵が 無い ときの 見かた", () => {
  it("会社の 中身は 規則では 見ない（いつも false）", () => {
    expect(localObservations("talk", "カンボジアの プログラムが おもしろいです。").concrete).toBe(
      false,
    );
  });

  it("りゆう・気もち・ていねいさは 規則で 拾える", () => {
    const seen = localObservations("talk", "たのしいから、おもしろいと おもいます。");
    expect(seen.reason).toBe(true);
    expect(seen.feeling).toBe(true);
    expect(seen.polite).toBe(true);
  });

  it("しつもんの 形は 聞く ばんでだけ 数える", () => {
    expect(localObservations("listen", "どうして 会社を つくりましたか。").question).toBe(true);
    expect(localObservations("talk", "どうして 会社を つくりましたか。").question).toBe(false);
  });

  it("日本語で なければ 何も 立たない", () => {
    const seen = localObservations("talk", "very interesting");
    expect(seen.japanese).toBe(false);
    expect(seen.onTopic).toBe(false);
  });

  it("短すぎる ことばは 見つけた ことに しない", () => {
    expect(localTopic("talk", "はい")).toBe("");
    expect(localTopic("listen", "とても おもしろいです")).toBe("");
    expect(localTopic("talk", "とても おもしろいです")).not.toBe("");
  });
});
