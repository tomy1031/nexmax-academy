import { describe, expect, it } from "vitest";

import {
  applyUtterance,
  countFacts,
  countOpen,
  hasNumber,
  initialPanelStates,
  nextProbePanel,
  type ReportPanel,
} from "@/lib/meeting/panels";
import { parseFactJudge, resolveFacts } from "@/components/listening/req-matcher";

/**
 * 朝礼（かんたん）火曜日の 4枚。設計 #366 の 6.2 から 写した。
 * パネル＝1行なので openAt も fullAt も 1。
 */
const EASY_TUE: ReportPanel[] = [
  {
    id: "kinou",
    label: "きのう",
    facts: [{ id: "k1", keywords: ["きのう", "一覧", "テスト", "16こ", "終わ", "しました"] }],
  },
  {
    id: "kyou",
    label: "きょう",
    facts: [{ id: "y1", keywords: ["きょう", "のこり", "4こ", "します"] }],
  },
  {
    id: "komari",
    label: "こまりごと",
    facts: [{ id: "c1", keywords: ["こまりごと", "こまって", "ありません", "ないです", "とくに"] }],
  },
  { id: "suuji", label: "数字を 1つ", facts: [], rule: "number" },
];

/**
 * 夕礼（むずかしい）月曜日。きょう・あしたは 3つの うち 2つで 開く。
 * こまりごとは 3つの 箱で、1つで 開き 3つで ⭕。
 */
const HARD_MON: ReportPanel[] = [
  {
    id: "kyou",
    label: "きょう",
    openAt: 2,
    facts: [
      { id: "K1", keywords: ["日づけ", "名前", "一覧に"] },
      { id: "K2", keywords: ["android", "アンドロイド", "通知が 来", "テストしました"] },
      { id: "K3", keywords: ["しるし", "読んだ", "半分まで"] },
    ],
  },
  {
    id: "ashita",
    label: "あした",
    openAt: 2,
    facts: [
      { id: "A1", keywords: ["のこり", "しるし"] },
      { id: "A2", keywords: ["原因を 調べ", "半日"] },
      { id: "A3", keywords: ["テストの 一覧", "10こ"] },
    ],
  },
  {
    id: "komari",
    label: "こまりごと",
    openAt: 1,
    facts: [
      {
        id: "C1",
        box: "何が",
        minHits: 2,
        keywords: ["iphone", "アイフォン", "通知", "来ない", "来ません", "こない"],
      },
      {
        id: "C2",
        box: "いつまでに",
        minHits: 2,
        keywords: ["半日", "あした", "までに", "見込み", "分かりそう"],
      },
      {
        id: "C3",
        box: "お願い",
        keywords: ["ニャム", "見て", "いただけ", "ください", "ほしい", "お願い", "30分"],
        // だれに＋何を の 両方が 要る（「だれかに 見て ほしい」で 開かせない）
        allOf: [
          ["ニャム", "奥田", "富田", "ヘンディ", "藤木"],
          ["見て", "いただけ", "ください", "ほしい", "お願い", "手伝"],
        ],
      },
    ],
  },
  { id: "suuji", label: "数字を 1つ", facts: [], rule: "number" },
];

describe("hasNumber — 数字は ことばで 数えない", () => {
  it("算用数字を 見つける", () => {
    expect(hasNumber("16こ 終わりました。")).toBe(true);
  });
  it("漢数字＋数え方を 見つける", () => {
    expect(hasNumber("三回 ためしました。")).toBe(true);
  });
  it("半分・半日を 見つける", () => {
    expect(hasNumber("半日 かかりそうです。")).toBe(true);
    expect(hasNumber("はんぶんまで 終わりました。")).toBe(true);
  });
  it("和語の 数を 見つける", () => {
    expect(hasNumber("ふたつ 終わりました。")).toBe(true);
  });
  it("数が 無い 文では 立たない", () => {
    expect(hasNumber("きのうは テストを しました。")).toBe(false);
  });
});

describe("かんたん（朝礼）— 1回の 発話で 複数 開く", () => {
  it("「きのうは テストを しました。16こ 終わりました。」で きのう と 数字が 同時に 開く", () => {
    const step = applyUtterance({
      utterance: "きのうは テストを しました。16こ 終わりました。",
      panels: EASY_TUE,
      states: initialPanelStates(EASY_TUE),
    });
    expect(step.opened).toEqual(["kinou", "suuji"]);
    expect(step.states.find((s) => s.id === "kyou")?.open).toBe(false);
    expect(step.states.find((s) => s.id === "komari")?.open).toBe(false);
  });

  it("「こまりごとは ありません」でも こまりごとが 開く", () => {
    const step = applyUtterance({
      utterance: "こまりごとは ありません。",
      panels: EASY_TUE,
      states: initialPanelStates(EASY_TUE),
    });
    expect(step.opened).toContain("komari");
  });

  it("同じ ことを 2回 言っても 二重に 数えない", () => {
    const first = applyUtterance({
      utterance: "きのうは テストを しました。",
      panels: EASY_TUE,
      states: initialPanelStates(EASY_TUE),
    });
    const second = applyUtterance({
      utterance: "きのうは テストを しました。",
      panels: EASY_TUE,
      states: first.states,
    });
    expect(second.opened).toEqual([]);
    expect(second.newFacts).toEqual([]);
    expect(countOpen(second.states)).toBe(1);
  });

  it("聞き返す 先は 枠組みの 順で、開いて いない ものから 1つ", () => {
    const step = applyUtterance({
      utterance: "きのうは テストを しました。16こ 終わりました。",
      panels: EASY_TUE,
      states: initialPanelStates(EASY_TUE),
    });
    expect(nextProbePanel(EASY_TUE, step.states)?.id).toBe("kyou");
  });

  it("れいを 見せた パネルは もう 聞き返さない（開いた ことにも しない）", () => {
    const states = initialPanelStates(EASY_TUE).map((s) =>
      s.id === "kyou" ? { ...s, gaveUp: true } : s,
    );
    expect(nextProbePanel(EASY_TUE, states)?.id).toBe("kinou");
    const afterKinou = states.map((s) => (s.id === "kinou" ? { ...s, open: true, full: true } : s));
    expect(nextProbePanel(EASY_TUE, afterKinou)?.id).toBe("komari");
    expect(countOpen(afterKinou)).toBe(1);
  });
});

describe("むずかしい（夕礼）— まとめられたかを 数で 見る", () => {
  it("1行だけでは 開かない。2行で 開く", () => {
    const one = applyUtterance({
      utterance: "一覧に 日づけと 先生の 名前が 出るように なりました。",
      panels: HARD_MON,
      states: initialPanelStates(HARD_MON),
    });
    expect(one.opened).not.toContain("kyou");
    expect(one.states.find((s) => s.id === "kyou")?.said).toEqual(["K1"]);

    const two = applyUtterance({
      utterance: "通知を テストしました。Android には 来ました。",
      panels: HARD_MON,
      states: one.states,
    });
    expect(two.opened).toContain("kyou");
  });

  it("3行を 1文に まとめると、こまりごとの 箱1と 数字が 同時に 立つ", () => {
    const step = applyUtterance({
      utterance:
        "通知を テストしました。Android には 来ましたが、iPhone には 3回とも 来ませんでした。",
      panels: HARD_MON,
      states: initialPanelStates(HARD_MON),
    });
    expect(step.opened).toContain("komari");
    expect(step.opened).toContain("suuji");
    // きょう は 1行ぶんしか 立って いないので まだ 開かない
    expect(step.opened).not.toContain("kyou");
    expect(step.states.find((s) => s.id === "kyou")?.said).toEqual(["K2"]);
  });

  it("こまりごとは 3つの 箱が そろって はじめて ⭕", () => {
    let states = initialPanelStates(HARD_MON);
    states = applyUtterance({
      utterance: "iPhone に 通知が 来ません。",
      panels: HARD_MON,
      states,
    }).states;
    expect(states.find((s) => s.id === "komari")?.open).toBe(true);
    expect(states.find((s) => s.id === "komari")?.full).toBe(false);

    states = applyUtterance({
      utterance: "あした 半日 調べれば 分かる 見込みです。",
      panels: HARD_MON,
      states,
    }).states;
    expect(states.find((s) => s.id === "komari")?.full).toBe(false);

    const last = applyUtterance({
      utterance: "ニャムさんに、30分 見て いただけませんか。",
      panels: HARD_MON,
      states,
    });
    expect(last.completed).toContain("komari");
    expect(last.states.find((s) => s.id === "komari")?.said).toHaveLength(3);
    // 3つの 箱が そろった ぶんは 週の 合否で 数える（ほかの パネルの 行も 同じ 器で 数える）
    expect(countFacts(last.states)).toBeGreaterThanOrEqual(3);
  });

  it("「だれかに 見て ほしい」だけでは お願いの 箱は 開かない（だれに が 無い）", () => {
    const step = applyUtterance({
      utterance: "だれかに 見て ほしいです。",
      panels: HARD_MON,
      states: initialPanelStates(HARD_MON),
    });
    expect(step.newFacts).not.toContain("C3");
  });

  it("報告に 要らない 行を 言っても、何も 減らない・何も 開かない", () => {
    const start = initialPanelStates(HARD_MON);
    const step = applyUtterance({
      utterance: "昼ごはんは ニャムさんと カレーを 食べました。",
      panels: HARD_MON,
      states: start,
    });
    expect(step.opened).toEqual([]);
    expect(countOpen(step.states)).toBe(0);
    expect(countFacts(step.states)).toBe(0);
  });

  it("聞き返す 先は 開いた あとの 箱の のこりにも 向く", () => {
    const step = applyUtterance({
      utterance: "iPhone に 通知が 来ません。",
      panels: HARD_MON,
      states: initialPanelStates(HARD_MON),
    });
    // きょう・あした が まだなので そちらが 先。こまりごとは 開いて いるが ⭕ で ない
    expect(nextProbePanel(HARD_MON, step.states)?.id).toBe("kyou");
    const filled = step.states.map((s) =>
      s.id === "kyou" || s.id === "ashita" ? { ...s, open: true, full: true } : s,
    );
    expect(nextProbePanel(HARD_MON, filled)?.id).toBe("komari");
  });
});

describe("AIの 返しと ことばの 照合を 重ねる", () => {
  const facts = HARD_MON[0].facts;

  it("AIが 返した 行も 言えたに 数える（ことばが 当たらなくても）", () => {
    const said = resolveFacts({
      utterance: "画面に 日づけを 出せるように なりました。",
      facts,
      aiSaidIds: ["K1"],
    });
    expect(said).toContain("K1");
  });

  it("AIが 何も 返さなくても ことばだけで 動く（鍵ゼロ）", () => {
    const said = resolveFacts({
      utterance: "しるしを 半分まで 作りました。",
      facts,
      aiSaidIds: [],
    });
    expect(said).toEqual(["K3"]);
  });

  it("知らない id と none は 落とす", () => {
    expect(parseFactJudge({ saidIds: ["K1", "none", "zzz", "K1"] }, facts)).toEqual(["K1"]);
    expect(parseFactJudge({ saidIds: "K1" }, facts)).toEqual([]);
    expect(parseFactJudge(null, facts)).toEqual([]);
  });

  it("すでに 言えた 行は 二重に 返さない", () => {
    const said = resolveFacts({
      utterance: "しるしを 半分まで 作りました。",
      facts,
      saidIds: new Set(["K3"]),
      aiSaidIds: ["K3"],
    });
    expect(said).toEqual([]);
  });
});
