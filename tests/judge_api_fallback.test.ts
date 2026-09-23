import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_TEXT_MODELS } from "../src/lib/ai/models";
import { NO_JUDGE, type AsakaiJudgeContext } from "../src/lib/meeting/asakai-judge";
import type * as ProfileModule from "../src/lib/profile";
import type { QuizReviewContext } from "../src/lib/quiz/ai-review";

/**
 * 見かたの つなぎ（judge-api.ts）が 控えへ 落ちる 速さと、朝礼の 待ちの 整合（2026-09-16 の 検収）
 *
 * SDK の connect は 断られても 返らない。前は 断られても したくの 上限（9秒）まで
 * 待ってから 控えへ 進んで いたので、朝礼の 待ち（13秒）の 中に 控えの したくと
 * 往復が 入らなかった。ここでは SDK を 作り物に かえて、時計を 進めて 確かめる。
 */

type Plan = "reject" | "hang" | "late" | "accept";

const sdk = vi.hoisted(() => ({
  plan: {} as Record<string, Plan>,
  connects: [] as { model: string; at: number }[],
  asks: [] as { model: string; at: number; text: string }[],
  closed: [] as string[],
  tokens: 0,
  setupAfterMs: 500,
  replyAfterMs: 2_000,
  lateAfterMs: 12_000,
}));

vi.mock("@/lib/profile", async (original) => ({
  ...(await original<typeof ProfileModule>()),
  getGeminiKey: () => "KEY",
}));

vi.mock("@/lib/ai/live-token", () => ({
  createLiveToken: async () => {
    sdk.tokens += 1;
    return { ok: true, token: `auth_tokens/${sdk.tokens}`, expiresAt: "" };
  },
}));

interface FakeCallbacks {
  onopen?: () => void;
  onmessage: (message: unknown) => void;
  onerror?: () => void;
  onclose?: () => void;
}

vi.mock("@google/genai", () => ({
  Modality: { AUDIO: "AUDIO" },
  GoogleGenAI: class {
    live = {
      connect: ({ model, callbacks }: { model: string; callbacks: FakeCallbacks }) => {
        sdk.connects.push({ model, at: Date.now() });
        const plan = sdk.plan[model] ?? "reject";
        const session = {
          sendClientContent: (input: unknown) => {
            /*
             * 頼みの 文を 見て 返す 形を 変える。もんだいの 見かた（`kaitou_no_mikata`）は
             * 朝礼と 引数の 形が ちがう ので、同じ 作り物で 両方を ためせる ように する。
             */
            const text =
              (input as { turns?: { parts?: { text?: string }[] }[] })?.turns?.[0]?.parts?.[0]
                ?.text ?? "";
            sdk.asks.push({ model, at: Date.now(), text });
            const n = sdk.asks.length;
            const review = text.includes("# 見る ところ");
            setTimeout(
              () =>
                callbacks.onmessage({
                  toolCall: {
                    functionCalls: [
                      review
                        ? {
                            id: `c${n}`,
                            name: "kotae_no_check",
                            args: {
                              ok: true,
                              items: [{ id: "ketsuron", ok: true, note: "" }],
                              polished: `へんじ${n}`,
                            },
                          }
                        : { id: `c${n}`, name: "asakai", args: { saidIds: [`k${n}`] } },
                    ],
                  },
                }),
              sdk.replyAfterMs,
            );
          },
          sendToolResponse: () => {},
          close: () => {
            sdk.closed.push(model);
          },
        };
        return new Promise((resolve) => {
          setTimeout(() => callbacks.onopen?.(), 100);
          // 本物と 同じく: 断られたら 閉じられる だけで、この 約束は 返らない
          if (plan === "reject") setTimeout(() => callbacks.onclose?.(), 300);
          if (plan === "hang" || plan === "reject") return;
          const after = plan === "late" ? sdk.lateAfterMs : sdk.setupAfterMs;
          setTimeout(() => {
            // 本物と 同じく: したくの 合図を 渡してから 返る
            callbacks.onmessage({ setupComplete: {} });
            resolve(session);
          }, after);
        });
      },
    };
  },
}));

const [HEAD, SPARE] = LIVE_TEXT_MODELS;

const FACTS = [
  { id: "k1", keywords: ["一覧"] },
  { id: "k2", keywords: ["検索"] },
  { id: "k3", keywords: ["重なる"] },
];

const CONTEXT: AsakaiJudgeContext = {
  judgePrompt: "",
  sceneTitle: "月曜日 17:50 夕礼 ・ 司会 ヘンディさん",
  panels: [],
  hasLog: true,
  utterance: "今日は 学生一覧APIと つなぎました。",
};

async function loadJudgeApi() {
  // つなぎの 置き場（SLOTS）は モジュールの 中に ある。テストごとに まっさらに する
  vi.resetModules();
  return await import("../src/components/meeting/judge-api");
}

beforeEach(() => {
  vi.useFakeTimers();
  sdk.plan = {};
  sdk.connects = [];
  sdk.asks = [];
  sdk.closed = [];
  sdk.tokens = 0;
  sdk.setupAfterMs = 500;
  sdk.replyAfterMs = 2_000;
  sdk.lateAfterMs = 12_000;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("先頭の モデルに 断られる 鍵", () => {
  it("朝礼の 見立ては 待たずに 控えから 届く（13秒の 中）", async () => {
    sdk.plan = { [HEAD]: "reject", [SPARE]: "accept" };
    const { requestAsakaiJudge } = await loadJudgeApi();
    const started = Date.now();
    let doneAt = 0;
    let result: unknown = "pending";
    void requestAsakaiJudge("mon", CONTEXT, FACTS).then((value) => {
      result = value;
      doneAt = Date.now();
    });

    await vi.advanceTimersByTimeAsync(13_000);

    expect(result).toEqual({ ok: true, judge: { ...NO_JUDGE, saidIds: ["k1"] } });
    expect(sdk.connects.map((c) => c.model)).toEqual([HEAD, SPARE]);
    // 閉じられた その場で 控えへ（前は 9秒 待ってから だった）
    expect(sdk.connects[1]!.at - started).toBeLessThan(1_000);
    expect(doneAt - started).toBeLessThan(4_000);
    // 短命トークンは 1回 使い切り。モデルごとに 作り直す
    expect(sdk.tokens).toBe(2);
  });

  it("どの モデルにも 断られたら、上限（25秒）を 待たずに 理由の 名前で 返す", async () => {
    sdk.plan = {};
    const { requestJudge } = await loadJudgeApi();
    const started = Date.now();
    let result: unknown = "pending";
    let doneAt = 0;
    void requestJudge({
      meetingId: "m",
      questionId: "q",
      ask: "しゅっしんは どこですか。",
      hint: "",
      keywords: [],
      judgePrompt: "",
      hostName: "ヘンディ",
      learnerName: "ソック",
      utterance: "プノンペンです。",
      attempt: 1,
    }).then((value) => {
      result = value;
      doneAt = Date.now();
    });

    await vi.advanceTimersByTimeAsync(25_000);

    expect(result).toEqual({ ok: false, reason: "modelNotFound" });
    expect(sdk.connects.map((c) => c.model)).toEqual([...LIVE_TEXT_MODELS]);
    expect(doneAt - started).toBeLessThan(3_000);
  });
});

describe("先頭の モデルが 何も 返さない とき（まれ）", () => {
  it("その 1本は 間に 合わないが、往復が 生きて いる あいだは 2本目を 重ねない", async () => {
    sdk.plan = { [HEAD]: "late", [SPARE]: "accept" };
    sdk.replyAfterMs = 4_000;
    const { requestAsakaiJudge } = await loadJudgeApi();

    let first: unknown = "pending";
    void requestAsakaiJudge("mon", CONTEXT, FACTS).then((value) => {
      first = value;
    });
    // 先頭は 9秒 待って 諦め、控えで つないで 頼む（返事は 13.5秒 ごろ）
    await vi.advanceTimersByTimeAsync(13_000);
    /*
     * **なぜ 出ないかを 名前で 返す**（2026-09-23 の 指定）。前は どの 失敗も `null`
     * だった ので、画面は「AIの 見かたが 届きませんでした」の 1文しか 出せず、
     * **キーを 登録して いる 人が キーを 疑う**ことに なって いた。
     */
    expect(first).toEqual({ ok: false, reason: "timeout" });
    expect(sdk.asks).toHaveLength(1);

    /*
     * 1本目の 往復は まだ 生きて いる。ここで 2本目を 頼むと、1本目の 見立て（k1）が
     * 2本目の 答えに なる——前は 13秒で 札を 下ろして いたので、そう なって いた。
     */
    let second: unknown = "pending";
    void requestAsakaiJudge("mon", CONTEXT, FACTS).then((value) => {
      second = value;
    });
    await vi.advanceTimersByTimeAsync(0);
    /* 重なった ぶんは 札（busy）で 断る。理由も その 名前で 返す。 */
    expect(second).toEqual({ ok: false, reason: "busy" });
    expect(sdk.asks).toHaveLength(1);

    // 1本目の 往復が 終われば、つぎの 報告は 裏で 張った つなぎを 使い、自分の 見立てを もらう
    await vi.advanceTimersByTimeAsync(1_000);
    let third: unknown = "pending";
    void requestAsakaiJudge("mon", CONTEXT, FACTS).then((value) => {
      third = value;
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(third).toEqual({ ok: true, judge: { ...NO_JUDGE, saidIds: ["k2"] } });
    expect(sdk.connects.filter((c) => c.model === SPARE)).toHaveLength(1);

    // 諦めた 先頭が 遅れて つながっても、居座らせずに 閉じる
    expect(sdk.closed).toContain(HEAD);
  });

  it("13秒を 過ぎてから つながった ときは 頼みを 送らず、つなぎは つぎの 報告に 残す", async () => {
    sdk.plan = { [HEAD]: "hang", [SPARE]: "accept" };
    sdk.setupAfterMs = 5_000; // 控えの したくも 遅い（9秒 + 5秒 = 14秒ごろ）
    const { requestAsakaiJudge } = await loadJudgeApi();

    let first: unknown = "pending";
    void requestAsakaiJudge("mon", CONTEXT, FACTS).then((value) => {
      first = value;
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(first).toEqual({ ok: false, reason: "timeout" });
    // 答えは どうせ 捨てる。Live の 往復を 使わない
    expect(sdk.asks).toHaveLength(0);

    // 札は もう 下りて いて、つぎの 報告は 張った つなぎで すぐ 見て もらえる
    let second: unknown = "pending";
    void requestAsakaiJudge("mon", CONTEXT, FACTS).then((value) => {
      second = value;
    });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(second).toEqual({ ok: true, judge: { ...NO_JUDGE, saidIds: ["k1"] } });
    expect(sdk.connects.filter((c) => c.model === SPARE)).toHaveLength(1);
  });
});

/**
 * もんだいの 見かた（`requestQuizReview`）— **押し直しで 前の 返事が 出ない こと**
 *
 * 全問 1ページの 教材では、学習者は 文を 直して すぐ もう一度 押す。札（busy）を
 * 待ちを 諦めた 時点で 下ろすと、**1回目の 見立てが 2回目の 答えに なる**——
 * 直した 文に「⭕ つたわります」と 断言する（規律1 の 逆）。朝礼が 2026-09-16 に
 * 直した 形を、こちらでも 固定して おく。
 */
describe("もんだいの AIの 見かた", () => {
  const CONTEXT: QuizReviewContext = {
    question: "Slackの メッセージを 書いて ください。",
    scene: "テスト用の URLが 変わった。",
    model: "お疲れさまです。",
    note: "",
    itemKind: "point",
    items: [{ id: "ketsuron", label: "1行目で 何の 連絡かが 分かる" }],
    written: "1回目の 文",
  };

  it("諦めた あとに 押し直しても、前の 頼みの 返事は 返らない", async () => {
    sdk.plan = { [HEAD]: "hang", [SPARE]: "accept" };
    sdk.setupAfterMs = 5_000; // 控えの したくも 遅い（9秒 + 5秒 で 14秒ごろ）
    sdk.replyAfterMs = 11_500; // 往復は 25秒の 上限を またぐ
    const { requestQuizReview } = await loadJudgeApi();

    let first: unknown = "pending";
    void requestQuizReview("set:q1:1", CONTEXT, () => false).then((value) => {
      first = value;
    });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(first).toEqual({ ok: false, reason: "timeout" });

    // 直して すぐ 押す。**1回目の 往復が 生きて いる あいだは 断る**
    let second: unknown = "pending";
    void requestQuizReview("set:q1:2", { ...CONTEXT, written: "なおした 文" }, () => false).then(
      (value) => {
        second = value;
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(second).toEqual({ ok: false, reason: "busy" });

    // 往復が 終われば、つぎの 頼みは 自分の 返事を もらう（ここからは 混みが 解けた ことに する）
    await vi.advanceTimersByTimeAsync(1_000);
    sdk.replyAfterMs = 2_000;
    let third: unknown = "pending";
    void requestQuizReview("set:q1:3", { ...CONTEXT, written: "なおした 文" }, () => false).then(
      (value) => {
        third = value;
      },
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(third).toMatchObject({ ok: true });
    // 送った 文は それぞれの 回の もの（1回目の 文が 2回目の 答えに ならない）
    const sent = sdk.asks.map((ask) => ask.text);
    expect(sent.some((text) => text.includes("1回目の 文"))).toBe(true);
    expect(sent.filter((text) => text.includes("なおした 文"))).toHaveLength(1);
  });

  it("鍵が 無い ときは つながず、理由の 名前で 返す", async () => {
    vi.resetModules();
    vi.doMock("@/lib/profile", () => ({ getGeminiKey: () => "" }));
    const { requestQuizReview } = await import("../src/components/meeting/judge-api");
    await expect(requestQuizReview("set:q1:1", CONTEXT, () => false)).resolves.toEqual({
      ok: false,
      reason: "noKey",
    });
    expect(sdk.connects).toHaveLength(0);
    vi.doUnmock("@/lib/profile");
  });
});
