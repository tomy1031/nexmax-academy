import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { questSchema, type Quest, type QuestOption } from "../src/content/schema";
import {
  createQuestState,
  currentPhase,
  furtherAlong,
  heroSpeakerIndex,
  parseQuestState,
  questReducer,
  questStateSchema,
  toSaved,
  RISK_PHASE_ID,
  type QuestMember,
  type QuestState,
} from "../src/lib/quest/state";
import { questMemberKey } from "../src/lib/quest/save";

const quest: Quest = questSchema.parse(
  JSON.parse(
    readFileSync(join(__dirname, "..", "content", "quests", "waterfall_quest.json"), "utf8"),
  ),
);

const MEMBERS: QuestMember[] = [
  { id: "a", name: "アン", type: "ISTJ", gender: "female" },
  { id: "b", name: "ボラ", type: null, gender: "male" },
];

function start(members: QuestMember[] = MEMBERS): QuestState {
  return createQuestState(quest, members);
}

/** その 場面で **まだ 押して いない** その 質の 手が 何番目に あるか。 */
function optionIndex(state: QuestState, type: QuestOption["type"]): number {
  const phase = currentPhase(quest, state)!;
  return phase.options.findIndex(
    (option, index) => option.type === type && !state.chosen.includes(index),
  );
}

function choose(state: QuestState, type: QuestOption["type"]): QuestState {
  return questReducer(quest, state, { type: "choose", optionIndex: optionIndex(state, type) });
}

function advance(state: QuestState): QuestState {
  return questReducer(quest, state, { type: "advance" });
}

/** critical → hit の 2手で 1場面 片づける（残った 解説も 閉じる）。 */
function clearPhase(state: QuestState): QuestState {
  return advance(choose(advance(choose(state, "critical")), "hit"));
}

describe("はじめの 値", () => {
  it("お金は budgetBase ＋ 人数 × budgetPerMember", () => {
    expect(start().budget).toBe(quest.budgetBase + 2 * quest.budgetPerMember);
    expect(start([MEMBERS[0]!]).budget).toBe(quest.budgetBase + quest.budgetPerMember);
    expect(
      start([...MEMBERS, { id: "c", name: "チャン", type: "ENFP", gender: "female" }]).budget,
    ).toBe(quest.budgetBase + 3 * quest.budgetPerMember);
  });

  it("体力は 全員 startHp・リスクは 0・1人目の ばんから", () => {
    const state = start();
    expect(state.players.map((p) => p.hp)).toEqual([quest.startHp, quest.startHp]);
    expect(state.players.map((p) => p.maxHp)).toEqual([quest.startHp, quest.startHp]);
    expect(state.hiddenRisk).toBe(0);
    expect(state.turn).toBe(0);
  });

  it("診断が まだの 人（type: null）でも 落ちずに 始められる", () => {
    expect(start().players[1]!.type).toBeNull();
  });
});

describe("1手の 結果", () => {
  it("EXP は critical 50 / hit 30 / miss 0 で、手番の 人と チーム合計の 両方へ 入る", () => {
    const critical = choose(start(), "critical");
    expect(critical.players[0]!.exp).toBe(50);
    expect(critical.teamExp).toBe(50);

    const hit = choose(start(), "hit");
    expect(hit.players[0]!.exp).toBe(30);
    expect(hit.teamExp).toBe(30);

    const miss = choose(start(), "miss");
    expect(miss.players[0]!.exp).toBe(0);
    expect(miss.teamExp).toBe(0);
  });

  it("1手ごとに 手番が 次の 人へ 回る", () => {
    const state = advance(choose(start(), "miss"));
    expect(state.turn).toBe(1);
    expect(advance(choose(state, "miss")).turn).toBe(0);
  });

  it("体力の 減りは hpCost × 連続ミス回数（正解なら 倍率1・正解で 0 に 戻る）", () => {
    const phase = quest.phases[0]!;
    const misses = phase.options.flatMap((option, index) =>
      option.type === "miss" ? [{ option, index }] : [],
    );
    const first = misses[0]!;
    const second = misses[1]!;

    // 1回目の ミス → 倍率 1
    const state = questReducer(quest, start(), { type: "choose", optionIndex: first.index });
    expect(state.players[0]!.hp).toBe(quest.startHp - first.option.hpCost);
    expect(state.players[0]!.missStreak).toBe(1);

    // 2回目は **同じ 人**に 回すため 1人で 遊ぶ
    let solo = questReducer(quest, start([MEMBERS[0]!]), {
      type: "choose",
      optionIndex: first.index,
    });
    solo = questReducer(quest, advance(solo), { type: "choose", optionIndex: second.index });
    // 連続 2回目 → 倍率 2
    expect(solo.players[0]!.hp).toBe(
      quest.startHp - first.option.hpCost - second.option.hpCost * 2,
    );
    expect(solo.players[0]!.missStreak).toBe(2);

    // 正解を 出すと 0 に 戻る
    const recovered = choose(advance(solo), "hit");
    expect(recovered.players[0]!.missStreak).toBe(0);
  });

  it("リスクは 足されるが 0 より 下には 行かない", () => {
    const missed = choose(start(), "miss");
    expect(missed.hiddenRisk).toBeGreaterThan(0);
    // critical は risk -1。0 の ところから 引いても 0 のまま
    expect(choose(start(), "critical").hiddenRisk).toBe(0);
  });

  it("同じ 札は 2度 押せない／解説を 読む 前に 次を 押せない", () => {
    const state = choose(start(), "miss");
    // 解説が 出ている あいだは 何も 受け付けない
    expect(choose(state, "critical")).toBe(state);
    const after = advance(state);
    const usedIndex = state.chosen[0]!;
    expect(questReducer(quest, after, { type: "choose", optionIndex: usedIndex })).toBe(after);
  });
});

describe("場面クリア", () => {
  it("critical と hit の 両方を 見つけたら クリア（ミスは 何回でも よい）", () => {
    let state = advance(choose(start(), "miss"));
    expect(state.phaseIndex).toBe(0);
    state = advance(choose(state, "critical"));
    expect(state.phaseIndex).toBe(0); // まだ hit が 残っている
    state = choose(state, "hit");
    expect((state.event as { phaseCleared: boolean }).phaseCleared).toBe(true);
    state = advance(state);
    expect(state.phaseIndex).toBe(1);
    expect(state.clearedPhases).toBe(1);
    expect(state.chosen).toEqual([]);
  });

  it("クリアに 至らなかった 手だけ 人件費が 出る", () => {
    const base = start();
    const perTurn = base.players.length * quest.turnCostPerMember;

    // 1手目（critical・moneyCost 0）はクリアに 至らない → 人件費が 引かれる
    const first = choose(base, "critical");
    expect(first.budget).toBe(base.budget - perTurn);

    // 2手目（hit）で クリア → 人件費は 引かれない
    const second = choose(advance(first), "hit");
    const hitCost = quest.phases[0]!.options.find((o) => o.type === "hit")!.moneyCost;
    expect(second.budget).toBe(first.budget + hitCost);
  });
});

describe("レベルアップ", () => {
  it("必要EXPは いまのLv × 100。上がると maxHp が 20 増えて 全回復する", () => {
    // 1人で critical を 2回 出すと 100 EXP → Lv2
    let state = start([MEMBERS[0]!]);
    state = advance(choose(state, "critical"));
    expect(state.players[0]!.level).toBe(1);
    state = choose(state, "hit"); // 50 + 30 = 80 … まだ 足りない
    expect(state.players[0]!.level).toBe(1);

    state = advance(state); // 場面 2 へ
    state = choose(state, "critical"); // 80 + 50 = 130 ≥ 100
    const player = state.players[0]!;
    expect(player.level).toBe(2);
    expect(player.maxHp).toBe(quest.startHp + 20);
    expect(player.hp).toBe(player.maxHp); // 全回復
    expect(player.exp).toBe(30); // 130 - 100
  });
});

describe("終わり", () => {
  it("誰かの 体力が 0 に なったら おしまい", () => {
    const weak = start([{ ...MEMBERS[0]!, id: "z" }]);
    const nearlyDead: QuestState = {
      ...weak,
      players: weak.players.map((p) => ({ ...p, hp: 1 })),
    };
    const state = choose(nearlyDead, "miss");
    expect(state.players[0]!.hp).toBe(0);
    expect(state.status).toEqual({ kind: "over", reason: "hp" });
  });

  it("お金が 尽きたら おしまい", () => {
    const base = start();
    const broke: QuestState = { ...base, budget: 5 };
    const state = choose(broke, "miss");
    expect(state.status).toEqual({ kind: "over", reason: "budget" });
  });

  it("おしまいでも 解説は 1枚 読める（読み終えたら 結果の 画面へ）", () => {
    const base = start();
    const broke: QuestState = { ...base, budget: 5 };
    const state = choose(broke, "miss");
    expect(state.event).not.toBeNull();
    const closed = advance(state);
    expect(closed.event).toBeNull();
    expect(closed.status.kind).toBe("over");
    // 終わった あとは 何を 押しても 動かない
    expect(choose(closed, "critical")).toBe(closed);
  });

  it("最後の 場面を クリアしたら クリア", () => {
    const base = start();
    const last: QuestState = { ...base, phaseIndex: quest.phases.length - 1, clearedPhases: 29 };
    const state = clearPhase(last);
    expect(state.status).toEqual({ kind: "cleared" });
    expect(state.clearedPhases).toBe(quest.phases.length);
  });

  it("倒れた 人は 手番から 飛ばす", () => {
    const base = start([
      MEMBERS[0]!,
      MEMBERS[1]!,
      { id: "c", name: "チャン", type: "ENFP", gender: "female" },
    ]);
    const fallen: QuestState = {
      ...base,
      players: base.players.map((p, i) => (i === 1 ? { ...p, hp: 0 } : p)),
    };
    expect(advance(choose(fallen, "critical")).turn).toBe(2);
  });
});

describe("隠れリスクの 爆発", () => {
  /**
   * 場面 `id` の ひとつ 前に 座らせる（爆発は そこから 入る ときに 鳴る）。
   *
   * `risk` は **爆発する 瞬間**の リスク。前の 場面を critical＋hit で 片づける
   * あいだに リスクが 動く ので、その ぶんを 見こんで 置く。
   */
  function justBefore(id: number, risk: number): QuestState {
    const index = quest.phases.findIndex((phase) => phase.id === id);
    const previous = quest.phases[index - 1]!;
    const drift =
      previous.options.find((option) => option.type === "critical")!.risk +
      previous.options.find((option) => option.type === "hit")!.risk;
    const base = start();
    return {
      ...base,
      phaseIndex: index - 1,
      clearedPhases: index - 1,
      hiddenRisk: risk - drift,
      // 爆発だけを 見たいので、前の 場面で 倒れない ように 上限を 上げておく
      players: base.players.map((p) => ({ ...p, hp: 1000, maxHp: 1000 })),
      budget: 100000,
    };
  }

  /** 前の 場面を 片づけて、爆発の **直前と 直後**を 並べる。 */
  function atExplosion(id: number, risk: number) {
    const before = choose(advance(choose(justBefore(id, risk), "critical")), "hit");
    return { before, after: advance(before) };
  }

  it("第8章テストの 入口（phaseId 22）で 鳴る", () => {
    const { before, after } = atExplosion(RISK_PHASE_ID, 4);
    expect(before.hiddenRisk).toBe(4);
    expect(quest.phases[after.phaseIndex]!.id).toBe(RISK_PHASE_ID);
    expect(after.event).toEqual({ kind: "risk", risk: 4, damage: 40, cost: 120 });
    // 全員が risk × 10 を 受ける
    after.players.forEach((player, index) => {
      expect(player.hp).toBe(before.players[index]!.hp - 40);
    });
    expect(after.budget).toBe(before.budget - 120);
    // 生き残ったので リスクは 0 に 戻る
    expect(after.hiddenRisk).toBe(0);
  });

  it("原典の phaseId 5（第2章の 1問目）では 鳴らない — 旧版の 名残の バグ", () => {
    const { before, after } = atExplosion(5, 9);
    expect(quest.phases[after.phaseIndex]!.id).toBe(5);
    expect(after.event).toBeNull();
    expect(after.hiddenRisk).toBe(9);
    after.players.forEach((player, index) => {
      expect(player.hp).toBe(before.players[index]!.hp);
    });
    expect(after.budget).toBe(before.budget);
  });

  it("リスクが 0 なら 何も 減らない（バグは ひとつも なかった）", () => {
    const { before, after } = atExplosion(RISK_PHASE_ID, 0);
    expect(after.event).toEqual({ kind: "risk", risk: 0, damage: 0, cost: 0 });
    after.players.forEach((player, index) => {
      expect(player.hp).toBe(before.players[index]!.hp);
    });
    expect(after.budget).toBe(before.budget);
  });

  it("受けきれなければ そこで おしまい（リスクは 0 に 戻さない）", () => {
    const before = justBefore(RISK_PHASE_ID, 20);
    const fragile: QuestState = {
      ...before,
      players: before.players.map((p) => ({ ...p, hp: 60, maxHp: 100 })),
    };
    const state = clearPhase(fragile);
    expect(state.players.every((p) => p.hp === 0)).toBe(true);
    expect(state.status).toEqual({ kind: "over", reason: "hp" });
    expect(state.hiddenRisk).toBe(20);
  });

  it("しらせを 読み終えると そのまま テストの 場面が 始まる", () => {
    const state = advance(atExplosion(RISK_PHASE_ID, 3).after);
    expect(state.event).toBeNull();
    expect(quest.phases[state.phaseIndex]!.id).toBe(RISK_PHASE_ID);
    expect(state.status.kind).toBe("playing");
  });
});

describe("主人公の セリフの 割り当て", () => {
  it("場面が 進むと 主役が 順に 回る（全員に 番が 来る）", () => {
    const seen = new Set<number>();
    for (let phase = 0; phase < 4; phase += 1) seen.add(heroSpeakerIndex(phase, 0, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it("同じ 場面の 中でも セリフごとに 交代する", () => {
    expect(heroSpeakerIndex(0, 0, 2)).toBe(0);
    expect(heroSpeakerIndex(0, 1, 2)).toBe(1);
  });

  it("人数が 0 でも 落ちない", () => {
    expect(heroSpeakerIndex(3, 2, 0)).toBe(0);
  });
});

describe("セーブの かたち", () => {
  it("解説の 途中は 保存しない（開き直したら 4択から）", () => {
    const state = choose(start(), "miss");
    expect(state.event).not.toBeNull();
    expect(toSaved(state).event).toBeNull();
  });

  it("行って 帰って 同じ 状態に なる", () => {
    const state = clearPhase(clearPhase(start()));
    const restored = parseQuestState(JSON.parse(JSON.stringify(toSaved(state))), quest);
    expect(restored).toEqual(toSaved(state));
  });

  it("壊れた 保存値・別の クエスト・無い 場面は 読まない", () => {
    expect(parseQuestState({ nope: true }, quest)).toBeNull();
    const state = toSaved(start());
    expect(parseQuestState({ ...state, questId: "other" }, quest)).toBeNull();
    expect(parseQuestState({ ...state, phaseIndex: quest.phases.length }, quest)).toBeNull();
    expect(parseQuestState({ ...state, turn: 9 }, quest)).toBeNull();
  });

  it("スキーマは 5人めを 受け取らない（DB の check と そろえる）", () => {
    const five = { ...toSaved(start()), players: Array(5).fill(toSaved(start()).players[0]) };
    expect(questStateSchema.safeParse(five).success).toBe(false);
  });

  it("組の 鍵は えらぶ 順番で 変わらない（DB の quest_member_key と 同じ）", () => {
    expect(questMemberKey(["b", "a", "c"])).toBe(questMemberKey(["a", "c", "b"]));
    expect(questMemberKey(["a", "b"])).not.toBe(questMemberKey(["a", "c"]));
  });
});

describe("2つの セーブが あるとき", () => {
  it("進んで いる ほうを 取る（端末と DB の どちらも 落とさない）", () => {
    const fresh = start();
    const oneTurn = choose(fresh, "miss");
    const onePhase = clearPhase(fresh);

    // 場面の 数が ちがえば 多い ほう
    expect(furtherAlong(fresh, onePhase)).toBe(onePhase);
    expect(furtherAlong(onePhase, fresh)).toBe(onePhase);
    // 同じ 場面なら 手を 進めて いる ほう
    expect(furtherAlong(fresh, oneTurn)).toBe(oneTurn);
    // 片方しか 無ければ その ほう
    expect(furtherAlong(null, fresh)).toBe(fresh);
    expect(furtherAlong(fresh, null)).toBe(fresh);
    expect(furtherAlong(null, null)).toBeNull();
  });
});

describe("通しで 遊べる", () => {
  it("いちばん 良い 手だけを 選び続けると 30場面を クリアできる", () => {
    let state = start();
    for (let i = 0; i < quest.phases.length; i += 1) {
      state = clearPhase(state);
      // 爆発の しらせが 出ていたら 1回 閉じる
      if (state.event?.kind === "risk") state = advance(state);
    }
    expect(state.status).toEqual({ kind: "cleared" });
    expect(state.clearedPhases).toBe(quest.phases.length);
    expect(state.budget).toBeGreaterThan(0);
    expect(state.players.every((player) => player.hp > 0)).toBe(true);
  });
});
