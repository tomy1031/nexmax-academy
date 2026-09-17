import { describe, expect, it } from "vitest";

import {
  applyUtterance,
  countFacts,
  countLogHeads,
  countLogLines,
  countOpen,
  hasNumber,
  initialPanelStates,
  nextProbePanel,
  readsLog,
  saysProgress,
  type PanelState,
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
  { id: "suuji", label: "進捗", facts: [], rule: "number" },
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
  { id: "suuji", label: "進捗", facts: [], rule: "number" },
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

  /**
   * **時刻は 数では ない**（2026-09-14）。
   *
   * 夕礼の 作業記録は 行頭が 時刻なので、記録を そのまま 読み上げると
   * 1行目の `09:00` で 進捗率の カードが 開いて いた——5日 とも、
   * ひとことも パーセントを 言わない まま。
   */
  it("時刻では 立たない", () => {
    expect(hasNumber("09:00 学生一覧APIの 仕様を 確認")).toBe(false);
    expect(hasNumber("17:30に 再テストが 終わりました。")).toBe(false);
    expect(hasNumber("9時30分に はじめました。")).toBe(false);
    expect(hasNumber("9時半に はじめました。")).toBe(false);
  });

  it("時間の 長さは 数の まま", () => {
    expect(hasNumber("3時間 かかりました。")).toBe(true);
  });

  it("時刻を 言っても、数を 言えば 立つ", () => {
    expect(hasNumber("17:30の 時点で 進捗は 75%です。")).toBe(true);
  });
});

/**
 * 作業記録を そのまま 読み上げて いないか（夕礼・2026-09-14）
 *
 * ここが 無かった ころ、**記録を 1文字も 変えずに 全行 読み上げるだけで
 * 5日 とも 合格**して いた（21こ中 16こ・合格ラインは 11）。
 * ことばの 照合では 塞げない——記録は 正しい ことばで 書かれて いるから。
 */
describe("readsLog — 記録の 読み上げ", () => {
  const LOG = [
    { head: "09:00", text: "学生一覧APIの 仕様を 確認" },
    { head: "09:30", text: "学生一覧APIとの 接続開始" },
    { head: "10:30", text: "AUPP・CADTの 学生データ 表示完了" },
    { head: "11:00", text: "キーワード検索UIを 作成" },
    { head: "11:40", text: "キーワード検索APIと 接続" },
    { head: "12:00", text: "昼休み" },
    { head: "13:00", text: "大学フィルター 作成" },
  ];

  it("行頭の 時刻を 3つ、本文も そのまま 並べたら 読み上げ", () => {
    const said = LOG.slice(0, 3)
      .map((row) => `${row.head} ${row.text}`)
      .join("。");
    expect(readsLog(said, LOG)).toBe(true);
    expect(countLogHeads(said, LOG)).toBe(3);
  });

  it("時刻を 1つ 添えただけでは 読み上げに しない", () => {
    expect(readsLog("17:30に 検索の 確認が 終わりました。", LOG)).toBe(false);
  });

  /**
   * **時刻だけでは 決めない**（2026-09-14 の 検収）。
   *
   * 行頭は 09:00〜17:30 の 丸い 時刻なので、**いちばん よく まとめた 報告**にも
   * ふつうに 入る。時刻の 数だけで 止めると、そういう 報告が 差し戻される——
   * 取りこぼしは 誤って 開く ことより 重い（設計01 P8）。
   */
  it("時刻を いくつ 言っても、本文が 写しで なければ 読み上げに しない", () => {
    const said = "09:00から 12:00まで 実装、13:00から 17:00まで テストを しました。";
    expect(countLogHeads(said, LOG)).toBeGreaterThanOrEqual(3);
    expect(countLogLines(said, LOG)).toBe(0);
    expect(readsLog(said, LOG)).toBe(false);
  });

  /**
   * **声が 本線**なので、書き起こしの 形でも 見つける。
   * `09:00` は「9時」、`09:30` は「9時30分」「9時半」と 書き起こされる。
   */
  it("こえの 書き起こし（9時・9時半）でも 時刻を 数える", () => {
    const said = "9時 学生一覧APIの 仕様を 確認。9時半 学生一覧APIとの 接続開始。";
    expect(countLogHeads(said, LOG)).toBe(2);
  });

  it("時刻を 省いても、行を 4つ 並べたら 読み上げ", () => {
    const said = LOG.slice(0, 4)
      .map((row) => row.text)
      .join("。");
    expect(countLogHeads(said, LOG)).toBe(0);
    expect(countLogLines(said, LOG)).toBe(4);
    expect(readsLog(said, LOG)).toBe(true);
  });

  it("まとめた 報告は 読み上げに しない", () => {
    const said = "今日は 学生一覧APIと つないで、キーワード検索と 大学フィルターを 作りました。";
    expect(readsLog(said, LOG)).toBe(false);
  });

  it("記録を 持たない 教材（朝礼）では いつも false", () => {
    expect(readsLog("09:00 10:30 11:00 12:00 13:00", [])).toBe(false);
  });

  /** **数えない**——罰では なく 言い直し。板は 1つも 動かない。 */
  it("読み上げた ぶんは 1つも 数えない", () => {
    const said = LOG.slice(0, 4)
      .map((row) => `${row.head} ${row.text}`)
      .join("。");
    const panels: ReportPanel[] = [
      {
        id: "kyou",
        label: "今日 行ったこと",
        openAt: 2,
        facts: [
          { id: "k1", keywords: ["学生一覧API", "接続"] },
          { id: "k2", keywords: ["キーワード検索"] },
        ],
      },
      { id: "shinchoku", label: "進捗率", facts: [], rule: "number" },
    ];
    const step = applyUtterance({
      utterance: said,
      panels,
      states: initialPanelStates(panels),
      logLines: LOG,
    });
    expect(step.readLog).toBe(true);
    expect(step.newFacts).toEqual([]);
    expect(step.opened).toEqual([]);
    expect(countOpen(step.states)).toBe(0);
  });

  /**
   * **AIの 見立ては 確かめ役**（2026-09-14 の 検収）。
   *
   * この 印は 発話 1本を 丸ごと 0に する **引き算**なので、単独では 効かせない。
   * 効かせて いた ころ、記録を 持たない 朝礼でも AIの 一言だけで 発話が 消せた——
   * 学習者は「作業記録を そのまま 読み上げて います」と 言われるが、その 教材に
   * 作業記録は 1行も 無い。
   */
  const ONE: ReportPanel[] = [
    { id: "kyou", label: "今日 行ったこと", facts: [{ id: "k1", keywords: ["学生一覧API"] }] },
  ];

  it("AIの 見立てだけでは 止まらない（写しの あとが 無い）", () => {
    const step = applyUtterance({
      utterance: "学生一覧APIと つなぎました。",
      panels: ONE,
      states: initialPanelStates(ONE),
      logLines: LOG,
      aiReadsLog: true,
    });
    expect(step.readLog).toBe(false);
    expect(countOpen(step.states)).toBe(1);
  });

  it("記録を 持たない 教材では、AIが 何と 言っても 止まらない", () => {
    const step = applyUtterance({
      utterance: "学生一覧APIと つなぎました。",
      panels: ONE,
      states: initialPanelStates(ONE),
      aiReadsLog: true,
    });
    expect(step.readLog).toBe(false);
  });

  it("写しが 2行 あり、AIも そう 見たら 止まる", () => {
    const said = `${LOG[0]!.text}。${LOG[1]!.text}。`;
    expect(readsLog(said, LOG)).toBe(false); // ことばだけでは 止めない
    const step = applyUtterance({
      utterance: said,
      panels: ONE,
      states: initialPanelStates(ONE),
      logLines: LOG,
      aiReadsLog: true,
    });
    expect(step.readLog).toBe(true);
    expect(countOpen(step.states)).toBe(0);
  });
});

/**
 * 進みぐあいは **割合で 言えて はじめて** 開く（2026-09-14 の 通し検収）
 *
 * 「数字が 1つ でも あるか」で 見て いた ころ、教材の ふつうの 報告が
 * そのまま 当たって いた——火曜・水曜は **パーセントを ひとことも 言わずに ⭕**。
 */
describe("saysProgress — 進みぐあい", () => {
  it("割合で 言えたら 開く", () => {
    expect(saysProgress("今、進捗は 35%です。")).toBe(true);
    expect(saysProgress("現在、進捗は35％です。")).toBe(true);
    expect(saysProgress("35パーセントです。")).toBe(true);
  });

  it("「進捗」と 数でも 開く", () => {
    expect(saysProgress("今の 進捗は 45 です。")).toBe(true);
  });

  it("ただの 数では 開かない", () => {
    expect(saysProgress("上位6スキルまで 表示できるように しました。")).toBe(false);
    expect(saysProgress("検索結果0件の 場合の 表示を 追加しました。")).toBe(false);
    expect(saysProgress("AUPP学生10名の スキルグラフを 確認しました。")).toBe(false);
    expect(saysProgress("3時間 かかりました。")).toBe(false);
    expect(saysProgress("09:00 学生一覧APIの 仕様を 確認")).toBe(false);
  });
});

describe("かんたん（朝礼）— 1回の 発話で 複数 開く", () => {
  it("「きのうは テストを しました。進捗は 80%です。」で きのう と 進捗が 同時に 開く", () => {
    const step = applyUtterance({
      utterance: "きのうは テストを しました。進捗は 80%です。",
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

  it("3行を 1文に まとめると、こまりごとの 箱1と 進捗が 同時に 立つ", () => {
    const step = applyUtterance({
      utterance:
        "通知を テストしました。Android には 来ましたが、iPhone には 来ませんでした。進捗は 40%です。",
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
    let states: readonly PanelState[] = initialPanelStates(HARD_MON);
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
  const facts = HARD_MON[0]!.facts;

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

/**
 * **画面の 数と 会話が 同じ ことを 言って いるか**（2026-09-11 の 再発防止）
 *
 * 板は「4 / 4」と 出して いるのに 司会は 聞き返しつづける、という 食いちがいが
 * 実発生した。原因は **数える 述語が 2つ あった** こと——板は `open`（1つでも 言えた）、
 * 会話は `full`（ぜんぶ 言えた）を 見て いた。
 * 同じ ことを 2か所で 決めない、を ここで 見張る。
 */
describe("数と 会話が 食いちがわない", () => {
  const ALL_PANELS = [EASY_TUE, HARD_MON];

  it("聞き返す 先が 無い ＝ どの カードも ⭕ か 打ち切り", () => {
    for (const panels of ALL_PANELS) {
      /* 総当たりで 状態を 作り、不変条件を 見る（8〜16通り）。 */
      const bits = 1 << panels.length;
      for (let mask = 0; mask < bits; mask += 1) {
        const states: PanelState[] = panels.map((panel, i) => {
          const on = (mask >> i) & 1;
          const said = on ? panel.facts.map((f) => f.id) : [];
          return {
            id: panel.id,
            said,
            open: on === 1,
            full: on === 1,
            gaveUp: false,
          };
        });
        const left = nextProbePanel(panels, states);
        const everyDone = states.every((s) => s.full || s.gaveUp);
        expect(left === null).toBe(everyDone);
      }
    }
  });

  it("箱が 1つ 開いただけの カードは、まだ 聞き返す 先に なる", () => {
    /* こまりごと（3箱）で 1箱だけ 言えた 状態。`open` は true だが `full` は false。 */
    const step = applyUtterance({
      utterance: "iPhone に 通知が 来ません。",
      panels: HARD_MON,
      states: initialPanelStates(HARD_MON),
    });
    const komari = step.states.find((s) => s.id === "komari");
    expect(komari?.open).toBe(true);
    expect(komari?.full).toBe(false);

    /* きょう・あした を 埋めても、こまりごとが ⭕ でない かぎり 終わらない。 */
    const filled = step.states.map((s) =>
      s.id === "kyou" || s.id === "ashita" || s.id === "suuji"
        ? { ...s, open: true, full: true }
        : s,
    );
    expect(nextProbePanel(HARD_MON, filled)?.id).toBe("komari");
  });
});

/**
 * **れいを 見せて 打ち切った カードは、そこで 止まる**（2026-09-11 の 再発防止）
 *
 * 前は `gaveUp` の パネルも 照合を つづけて いたので、司会の れいを そのまま
 * 書き写すと **板は ❌ のまま 合否だけ ⭕** に なった。
 * 言えなかった ことが 言えた ことに 化ける、いちばん たちの 悪い 形。
 */
describe("打ち切った カードは 動かない", () => {
  it("れいを 書き写しても 開かない", () => {
    const start = initialPanelStates(EASY_TUE).map((s) =>
      s.id === "kinou" ? { ...s, gaveUp: true } : s,
    );
    const step = applyUtterance({
      utterance: "きのうは テストを しました。進捗は 80%です。",
      panels: EASY_TUE,
      states: start,
    });
    const kinou = step.states.find((s) => s.id === "kinou");
    expect(kinou?.open).toBe(false);
    expect(kinou?.said).toEqual([]);
    expect(step.opened).not.toContain("kinou");
    /* ほかの カード（数字）は ふつうに 開く。止まるのは 打ち切った 1枚だけ。 */
    expect(step.opened).toContain("suuji");
  });

  it("打ち切った カードは 合否の 数にも 入らない", () => {
    const states = initialPanelStates(EASY_TUE).map((s) =>
      s.id === "kinou" ? { ...s, gaveUp: true } : s,
    );
    const after = applyUtterance({
      utterance: "きのうは テストを しました。",
      panels: EASY_TUE,
      states,
    });
    expect(countOpen(after.states)).toBe(0);
  });
});

/**
 * **AIの 見立てを 正に する**（2026-09-17 の 指定「開閉の 判断は AIを メインと して ほしい」）
 *
 * 鍵が ある 端末だけ。ことばの 照合は 書いて ある 語しか 見られない ので、
 * 言い方が ちがう だけで 開いたり 開かなかったり する。
 */
describe("aiOnly — AIの 見立てを 正に する", () => {
  const panels: ReportPanel[] = [
    {
      id: "kinou",
      label: "きのう したこと",
      facts: [{ id: "k1", keywords: ["画面", "作りました"] }],
    },
    {
      id: "komari",
      label: "問題・確認",
      facts: [{ id: "m1", keywords: ["ありません"] }],
    },
  ];
  const fresh = () => initialPanelStates(panels);

  it("AIが 言えたと 言えば、ことばが 当たらなくても 開く", () => {
    const step = applyUtterance({
      utterance: "きのうは ずっと UIを いじって いました。",
      panels,
      states: fresh(),
      aiSaidIds: ["k1"],
      aiOnly: true,
    });
    expect(step.states.find((one) => one.id === "kinou")?.full).toBe(true);
  });

  it("AIが 言って いないと 見た 札は、ことばが 当たっても 開かない", () => {
    const step = applyUtterance({
      utterance: "画面を 作りました。問題は ありません。",
      panels,
      states: fresh(),
      aiSaidIds: ["k1"],
      aiOnly: true,
    });
    expect(step.states.find((one) => one.id === "kinou")?.full).toBe(true);
    expect(
      step.states.find((one) => one.id === "komari")?.full,
      "AIが 見て いない 札が 開いた",
    ).toBe(false);
  });

  it("AIが 何も 返さなかった ときは 照合に 戻す（全部 落とさない）", () => {
    const step = applyUtterance({
      utterance: "画面を 作りました。",
      panels,
      states: fresh(),
      aiSaidIds: [],
      aiOnly: true,
    });
    expect(step.states.find((one) => one.id === "kinou")?.full).toBe(true);
  });

  it("鍵が 無い ときは これまでどおり 足し算", () => {
    const step = applyUtterance({
      utterance: "画面を 作りました。問題は ありません。",
      panels,
      states: fresh(),
      aiSaidIds: ["k1"],
    });
    expect(step.states.filter((one) => one.full)).toHaveLength(2);
  });
});
