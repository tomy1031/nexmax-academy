import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_TEXT_MODELS } from "../src/lib/ai/models";
import type { AsakaiJudgeContext } from "../src/lib/meeting/asakai-judge";
import type * as ProfileModule from "../src/lib/profile";

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
  asks: [] as { model: string; at: number }[],
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
          sendClientContent: () => {
            sdk.asks.push({ model, at: Date.now() });
            const n = sdk.asks.length;
            setTimeout(
              () =>
                callbacks.onmessage({
                  toolCall: {
                    functionCalls: [{ id: `c${n}`, name: "asakai", args: { saidIds: [`k${n}`] } }],
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

    expect(result).toEqual({ saidIds: ["k1"], readsLog: false });
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
    expect(first).toBeNull();
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
    expect(second).toBeNull();
    expect(sdk.asks).toHaveLength(1);

    // 1本目の 往復が 終われば、つぎの 報告は 裏で 張った つなぎを 使い、自分の 見立てを もらう
    await vi.advanceTimersByTimeAsync(1_000);
    let third: unknown = "pending";
    void requestAsakaiJudge("mon", CONTEXT, FACTS).then((value) => {
      third = value;
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(third).toEqual({ saidIds: ["k2"], readsLog: false });
    expect(sdk.connects.filter((c) => c.model === SPARE)).toHaveLength(1);

    // 諦めた 先頭が 遅れて つながっても、居座らせずに 閉じる
    expect(sdk.closed).toContain(HEAD);
  });
});
