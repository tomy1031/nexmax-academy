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
  pointsTable,
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

  /*
   * 2026-08-24 の 指定「ていねいに 言えたのに 好感度が 動かない」。
   * その ばんで **学習者が する ことに なって いる 観点**が 0点だと、内訳に
   * 「できた ✓」と 出て いるのに メーターが 動かない ターンが 生まれる。
   */
  it("答える ばんで する ことは、ぜんぶ 点に なる", () => {
    const table = pointsTable("talk");
    for (const key of ["japanese", "onTopic", "concrete", "reason", "feeling", "polite"] as const) {
      expect(table[key]).toBeGreaterThan(0);
    }
  });

  it("聞く ばんで する ことは、ぜんぶ 点に なる", () => {
    const table = pointsTable("listen");
    for (const key of ["japanese", "onTopic", "concrete", "polite", "question"] as const) {
      expect(table[key]).toBeGreaterThan(0);
    }
  });

  /*
   * 逆向きの 歯止め。やって いない ことに 点を 置くと、内訳に
   * 「しつもんの 形に なって いない ✗」が 並ぶ（`judgedAs` の 覚書と 同じ 事故・規律1）。
   */
  it("その ばんで やって いない ことは 内訳に 出さない", () => {
    expect(breakdown("talk", PERFECT).map((row) => row.key)).not.toContain("question");
    const listenKeys = breakdown("listen", PERFECT).map((row) => row.key);
    expect(listenKeys).not.toContain("reason");
    expect(listenKeys).not.toContain("feeling");
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

describe("内訳と メーターが 食い違わない", () => {
  it("観点の ぶんと 底上げの ぶんを 分けて 返す", () => {
    let state = EMPTY_TALK;
    const weak = { ...NO_OBSERVATIONS, japanese: true };
    for (let i = 0; i < PLAN.findCount - 1; i += 1) {
      const step = applyTurn(state, PLAN, weak, `はっけん${i}`);
      expect(step.lifted).toBe(0);
      expect(step.state.percent - state.percent).toBe(step.gained);
      state = step.state;
    }
    // 5つめ（ばんが 変わる ターン）だけ 底上げが 乗る
    const last = applyTurn(state, PLAN, weak, "はっけん5");
    expect(last.turned).toBe("listen");
    expect(last.lifted).toBeGreaterThan(0);
    expect(last.state.percent - state.percent).toBe(last.gained + last.lifted);
  });

  it("内訳は「見た ときの ばん」で 描く（切りかえ後では ない）", () => {
    const state = talkFor(PLAN.findCount - 1, PERFECT);
    const step = applyTurn(state, PLAN, PERFECT, "さいごの はっけん");
    expect(step.turned).toBe("listen");
    expect(step.judgedAs).toBe("talk");
  });

  it("満タンに なった ターンで かならず クリアする（100% のまま 続かない）", () => {
    for (const shape of [PERFECT, { ...NO_OBSERVATIONS, japanese: true }]) {
      let state = EMPTY_TALK;
      for (let i = 0; i < 40 && state.round !== "clear"; i += 1) {
        state = applyTurn(state, PLAN, shape, `はっけん${i}`).state;
        if (state.percent >= PLAN.goal) expect(state.round).toBe("clear");
      }
      expect(state.round).toBe("clear");
    }
  });

  it("好感度が 入口に とどいたら、見つける 数の 前でも 聞く ばんへ 移る", () => {
    let state = EMPTY_TALK;
    // 同じ 話題を くり返すと 札は 開かないが、好感度は たまる
    for (let i = 0; i < 6 && state.round === "talk"; i += 1) {
      state = applyTurn(state, PLAN, PERFECT, "おなじ はなし").state;
    }
    expect(state.round).toBe("listen");
    expect(state.percent).toBeGreaterThanOrEqual(PLAN.openAt);
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

  it("日本語で 言えて いない ものは 札を 開かない", () => {
    const english = "I think this company is interesting";
    expect(localTopic("talk", english, localObservations("talk", english))).toBe("");
    const nonsense = "asdfghjkl qwertyu";
    expect(localTopic("talk", nonsense, localObservations("talk", nonsense))).toBe("");
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
    const seen = (round: "talk" | "listen", text: string) =>
      localTopic(round, text, localObservations(round, text));
    expect(seen("talk", "はい")).toBe("");
    expect(seen("listen", "とても おもしろいです")).toBe("");
    expect(seen("talk", "とても おもしろいです")).not.toBe("");
  });

  /*
   * 札は **好感度の 記録に 残り、あとから 一覧にも 出る**。実機の 通し検証で
   *「Japanese IT …」「私は チームで 話す こ…」が 出た（2026-08-27）——
   * 語の 途中で 切れた ものは、あとで 見ても 何を 見つけたのか 分からない。
   * 教材の 文は 分かち書きなので、空白まで 戻せば 語の 切れめに なる。
   */
  it("長い ことばは ことばの 切れめで 切る", () => {
    const seen = (text: string) => localTopic("talk", text, localObservations("talk", text));
    expect(seen("私は チームで 話す ことが 得意です。")).toBe("私は チームで 話す…");
    expect(seen("Japanese IT Pathway は おもしろいです。")).toBe("Japanese IT…");
  });

  it("短い ものは 切らない（…を むだに 付けない）", () => {
    expect(
      localTopic("talk", "かんこうDX が すき", localObservations("talk", "かんこうDX が すき")),
    ).toBe("かんこうDX が すき");
  });
});
