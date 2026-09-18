import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * つなぎの 記録（`src/lib/ai/live-debug.ts`・2026-09-18）
 *
 * 記録は 先生・開発者が コピーして 渡す もの。**鍵・トークンが 1字も 入らない** ことを
 * いちばん 先に 見る（Google の 閉じた 理由の 文や ブラウザの エラー文に 混ざりうる）。
 */

vi.mock("@/lib/profile", () => ({ getGeminiKey: () => "" }));

async function load() {
  vi.resetModules();
  return await import("../src/lib/ai/live-debug");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("鍵と トークンを 伏せる", () => {
  it("AIza・AQ.・auth_tokens・key= と 長い 英数字を 伏せ、日本語と モデル名は 残す", async () => {
    const { redactSecrets } = await load();
    const raw =
      "bad AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv AQ.Ab8RN6LxYz0123456789 " +
      "auth_tokens/abc123.def ws?key=SECRET&x=1 tok=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN " +
      "models/gemini-2.5-flash-native-audio-preview-12-2025 聞き取り「わたしは プノンペンから」";
    const out = redactSecrets(raw);
    expect(out).not.toMatch(/AIzaSy|Ab8RN6|abc123|SECRET|abcdefghijklmnop/);
    expect(out).toContain("gemini-2.5-flash-native-audio-preview-12-2025");
    expect(out).toContain("わたしは プノンペンから");
  });

  it("記録に 入る ときにも 伏せる（エラー文・閉じた 理由）", async () => {
    const { describeClose, describeError, liveDebug, readLiveDebug } = await load();
    liveDebug("x", describeError(new Error("bad key AIzaSyA1b2C3d4E5f6G7h8I9j0")));
    liveDebug("y", describeClose({ code: 1008, reason: "token auth_tokens/zzz9 expired" }));
    const text = readLiveDebug()
      .map((entry) => entry.detail)
      .join("\n");
    expect(text).not.toMatch(/A1b2C3|zzz9/);
    expect(text).toContain("code 1008");
  });
});

describe("記録の 入れ物", () => {
  it("さいごの 300件だけ 残す", async () => {
    const { liveDebug, readLiveDebug } = await load();
    for (let i = 0; i < 320; i += 1) liveDebug("n", String(i));
    const list = readLiveDebug();
    expect(list).toHaveLength(300);
    expect(list[0]!.detail).toBe("20");
  });

  it("理由の 横に 出す 失敗は、さいごの つなぎはじめ より あとの もの だけ", async () => {
    const { lastLiveProblem, liveDebug } = await load();
    liveDebug("voice.start");
    liveDebug("voice.mic", "NotAllowedError", true);
    expect(lastLiveProblem("voice")?.detail).toBe("NotAllowedError");
    liveDebug("voice.start");
    liveDebug("voice.connect", "ok gemini-3.8-live");
    expect(lastLiveProblem("voice")).toBeNull();
  });

  it("ほかの 出どころ（見かた・たいわ）の 失敗は 🎤 の 理由の 横に 出さない。マイクの 取りこみは 出す", async () => {
    const { lastLiveProblem, liveDebug } = await load();
    liveDebug("voice.start");
    liveDebug("judge.judge", "timeout", true);
    liveDebug("taiwa.mic", "NotAllowedError", true);
    expect(lastLiveProblem("voice")).toBeNull();
    liveDebug("mic.capture", "worklet suspended 48000Hz", true);
    expect(lastLiveProblem("voice")?.what).toBe("mic.capture");
  });

  it("押した あいだの 音の 大きさ（0〜1）", async () => {
    const { pcmPeak } = await load();
    expect(pcmPeak(new Int16Array([0, -16384, 100]))).toBe(0.5);
    expect(pcmPeak(new Int16Array(4))).toBe(0);
  });
});

describe("?debug=1 で 出す", () => {
  const session = new Map<string, string>();
  beforeEach(() => session.clear());

  function stubPage(search: string) {
    vi.stubGlobal("window", {
      location: { search, pathname: "/asakai" },
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => session.delete(key),
      },
    });
  }

  it("付けると この タブの あいだ 覚え、?debug=0 で 消える。ふだんは 出さない", async () => {
    const { isLiveDebugOn } = await load();
    stubPage("");
    expect(isLiveDebugOn()).toBe(false);
    stubPage("?debug=1");
    expect(isLiveDebugOn()).toBe(true);
    stubPage("");
    expect(isLiveDebugOn()).toBe(true);
    stubPage("?debug=0");
    expect(isLiveDebugOn()).toBe(false);
  });

  it("サーバでは 出さない", async () => {
    const { isLiveDebugOn } = await load();
    expect(isLiveDebugOn()).toBe(false);
  });
});
