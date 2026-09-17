import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_TALK_MODELS } from "../src/lib/ai/models";

/**
 * たいわ・ミーティングの 声の つなぎ（2026-09-16 の 検収）
 *
 * 1. 一覧の 先頭しか ためさず、控えに 落ちなかった
 * 2. SDK の connect は 断られても 返らず、待ちつづけた
 * 3. つなぎ直しの たびに マイクを 取り直し、止める 前に 抜けて 取り残した
 *
 * フックは ブラウザ（AudioContext・マイク）と React の 中で 動く。ここでは
 * どちらも 作り物に かえ、**つなぐ 手順だけ**を 時計を 進めて 確かめる。
 * React は 描き直しを しない 最小の 入れ物（hooks）で 足りる——つなぐ 手順は
 * state を 読まず ref だけで 進む ので、描き直しは 状態を 読む ときだけ 呼ぶ。
 */

/* ---- React の かわり（フックの 置き場を 呼ぶ 順で 持つ） ---- */
const react = vi.hoisted(() => {
  interface Slot {
    value: unknown;
    initial?: unknown;
    history?: unknown[];
    deps?: readonly unknown[];
    cleanup?: (() => void) | void;
  }
  const slots: Slot[] = [];
  const effects: (() => void)[] = [];
  let cursor = 0;
  const same = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    slots,
    render<T>(hook: () => T): T {
      cursor = 0;
      const out = hook();
      for (const run of effects.splice(0)) run();
      return out;
    },
    unmount() {
      for (const slot of slots) if (typeof slot.cleanup === "function") slot.cleanup();
    },
    reset() {
      slots.length = 0;
      effects.length = 0;
      cursor = 0;
    },
    useState(init: unknown) {
      const i = cursor++;
      if (!slots[i]) {
        const value = typeof init === "function" ? (init as () => unknown)() : init;
        slots[i] = { value, initial: value, history: [] };
      }
      const slot = slots[i]!;
      const set = (next: unknown) => {
        slot.value =
          typeof next === "function" ? (next as (v: unknown) => unknown)(slot.value) : next;
        slot.history!.push(slot.value);
      };
      return [slot.value, set];
    },
    useRef(init: unknown) {
      const i = cursor++;
      slots[i] ??= { value: { current: init } };
      return slots[i]!.value;
    },
    useCallback(fn: unknown, deps: readonly unknown[]) {
      const i = cursor++;
      const slot = slots[i];
      if (slot && same(slot.deps, deps)) return slot.value;
      slots[i] = { value: fn, deps };
      return fn;
    },
    useEffect(fn: () => (() => void) | void, deps: readonly unknown[]) {
      const i = cursor++;
      const slot = slots[i];
      if (slot && same(slot.deps, deps)) return;
      slots[i] ??= { value: null };
      effects.push(() => {
        const current = slots[i]!;
        if (typeof current.cleanup === "function") current.cleanup();
        slots[i] = { value: null, deps, cleanup: fn() };
      });
    },
  };
});

vi.mock("react", () => ({
  useState: react.useState,
  useRef: react.useRef,
  useCallback: react.useCallback,
  useEffect: react.useEffect,
}));

/* ---- 鍵・トークン・マイクの 取りこみ ---- */
const env = vi.hoisted(() => ({
  tokens: 0,
  /** 鍵の 問題を 起こす ときの 理由（null なら トークンを 作れる）。 */
  tokenFails: null as string | null,
  streams: [] as { stopped: number }[],
  captures: [] as { stopped: number; onPcm?: (pcm: Int16Array) => void }[],
  contexts: [] as { closed: boolean }[],
  /** 鳴らす 予約（たいわの 割り込みの 見張り）。 */
  sources: [] as { stopped: boolean }[],
}));

vi.mock("@/lib/profile", () => ({ getGeminiKey: () => "KEY", getLiveModel: () => "" }));

vi.mock("@/lib/ai/live-token", () => ({
  createLiveToken: async () => {
    if (env.tokenFails) return { ok: false, reason: env.tokenFails };
    env.tokens += 1;
    return { ok: true, token: `auth_tokens/${env.tokens}`, expiresAt: "" };
  },
}));

vi.mock("../src/components/meeting/mic-capture", () => ({
  IN_RATE: 16_000,
  startMicCapture: async (_stream: unknown, onPcm: (pcm: Int16Array) => void) => {
    const capture = { stopped: 0, onPcm, stop: () => (capture.stopped += 1) };
    env.captures.push(capture);
    return capture;
  },
}));

/* ---- SDK の かわり ---- */
/**
 * - reject … 設定・モデルを 断られて 閉じられる（合図は 来ない）
 * - quota …… 使いすぎで 閉じられる
 * - hang …… 何も 返らない
 * - late …… 期限（9秒）を 過ぎた 10秒で つながる
 * - accept … 0.5秒で つながる
 */
type Plan = "reject" | "quota" | "hang" | "late" | "accept";

interface FakeCallbacks {
  onopen?: () => void;
  onmessage?: (message: unknown) => void;
  onerror?: () => void;
  onclose?: (event?: { code: number; reason: string }) => void;
}

const sdk = vi.hoisted(() => ({
  plan: {} as Record<string, Plan>,
  connects: [] as string[],
  /** ためした ときに 渡した 指示文（connects と 同じ 順）。 */
  instructions: [] as string[],
  closed: [] as string[],
  live: [] as {
    model: string;
    instruction: string;
    config: Record<string, unknown>;
    /** この つなぎへ 送った もの（`realtime` / `client`）を 送った 順に。 */
    sent: Record<string, unknown>[];
    callbacks: FakeCallbacks;
  }[],
}));

vi.mock("@google/genai", () => ({
  Modality: { AUDIO: "AUDIO" },
  GoogleGenAI: class {
    live = {
      connect: ({
        model,
        config,
        callbacks,
      }: {
        model: string;
        config: { systemInstruction?: string } & Record<string, unknown>;
        callbacks: FakeCallbacks;
      }) => {
        sdk.connects.push(model);
        sdk.instructions.push(config.systemInstruction ?? "");
        const plan = sdk.plan[model] ?? "reject";
        const sent: Record<string, unknown>[] = [];
        const session = {
          sendRealtimeInput: (input: unknown) => sent.push({ realtime: input }),
          sendClientContent: (input: unknown) => sent.push({ client: input }),
          // ブラウザと 同じく、閉じた 知らせ（onclose）は あとから 届く
          close: () => {
            sdk.closed.push(model);
            setTimeout(() => callbacks.onclose?.({ code: 1000, reason: "" }), 0);
          },
        };
        return new Promise((resolve) => {
          setTimeout(() => callbacks.onopen?.(), 100);
          // 本物と 同じく: 断られたら 閉じられる だけで、この 約束は 返らない
          if (plan === "reject") {
            const reason = "models/x is not found for API version v1beta";
            setTimeout(() => callbacks.onclose?.({ code: 1008, reason }), 300);
          }
          if (plan === "quota") {
            const reason = "You exceeded your current quota, please check your plan.";
            setTimeout(() => callbacks.onclose?.({ code: 1011, reason }), 300);
          }
          if (plan !== "accept" && plan !== "late") return;
          setTimeout(
            () => {
              callbacks.onmessage?.({ setupComplete: {} });
              sdk.live.push({
                model,
                instruction: config.systemInstruction ?? "",
                config,
                sent,
                callbacks,
              });
              resolve(session);
            },
            plan === "late" ? 10_000 : 500,
          );
        });
      },
    };
  },
}));

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  closed = false;
  constructor() {
    env.contexts.push(this);
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    // 本物と 同じく、二度 閉じると 投げる（取りこぼしの 見張り）
    if (this.closed) return Promise.reject(new Error("already closed"));
    this.closed = true;
    return Promise.resolve();
  }
  createAnalyser() {
    return { fftSize: 0, connect() {} };
  }
  createGain() {
    return { connect() {} };
  }
  createBuffer(_channels: number, length: number, rate: number) {
    return { duration: length / rate, getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    const source = {
      stopped: false,
      buffer: null as unknown,
      onended: null as unknown,
      connect() {},
      start() {},
      stop() {
        source.stopped = true;
      },
    };
    env.sources.push(source);
    return source;
  }
}

const [HEAD, SPARE] = LIVE_TALK_MODELS;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  react.reset();
  env.tokens = 0;
  env.tokenFails = null;
  env.streams = [];
  env.captures = [];
  env.contexts = [];
  env.sources = [];
  sdk.plan = {};
  sdk.connects = [];
  sdk.instructions = [];
  sdk.closed = [];
  sdk.live = [];
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => {
        const stream = { stopped: 0 };
        env.streams.push(stream);
        const track = { stop: () => (stream.stopped += 1) };
        return { getTracks: () => [track] };
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * 状態の 移りかわり（`status` は どちらの フックでも 初めが idle の state）。
 * 同じ 値が 続く ぶんは 1つに する（React も 同じ 値では 描き直さない）。
 */
function statusHistory(): unknown[] {
  const slot = react.slots.find((s) => s.initial === "idle");
  return (slot?.history ?? []).filter((value, i, all) => i === 0 || all[i - 1] !== value);
}

/** マイクの 流れで、止めて いない もの の 数。 */
const openStreams = () => env.streams.filter((s) => s.stopped === 0).length;

describe("ミーティングの 声（use-live-voice）", () => {
  async function load() {
    const { useLiveVoice } = await import("../src/components/meeting/use-live-voice");
    return () => react.render(() => useLiveVoice());
  }

  it("先頭に 断られたら 控えで つながる（トークンは ためす たびに 作り直す）", async () => {
    sdk.plan = { [SPARE]: "accept" };
    const render = await load();
    void render().start("指示", "Schedar", "こんにちは");
    await vi.advanceTimersByTimeAsync(3_000);

    expect(sdk.connects).toEqual([HEAD, SPARE]);
    expect(env.tokens).toBe(2);
    expect(render().status).toBe("live");
    // 断られた 先頭で 一瞬 「つながった」 画面に しない
    expect(statusHistory()).toEqual(["connecting", "live"]);
    expect(openStreams()).toBe(1);
  });

  it("どの モデルも 何も 返さなくても 待ちつづけず、マイクを 止めて 理由を 出す", async () => {
    sdk.plan = Object.fromEntries(LIVE_TALK_MODELS.map((m) => [m, "hang" as const]));
    const render = await load();
    void render().start("指示");
    // 1つ 9秒 × モデルの 数 ＋ 遅れて つながる ものを 待つ 9秒
    await vi.advanceTimersByTimeAsync(9_000 * (LIVE_TALK_MODELS.length + 1) + 1_000);

    expect(sdk.connects).toEqual([...LIVE_TALK_MODELS]);
    expect(render().status).toBe("error");
    expect(render().reason).toBe("connect");
    expect(env.streams).toHaveLength(1);
    expect(openStreams()).toBe(0);
    expect(env.contexts.every((c) => c.closed)).toBe(true);
  });

  it("鍵の 問題で つなげない ときは マイクの 許可を 聞かない（理由は 鍵の 理由の まま）", async () => {
    env.tokenFails = "rateLimited";
    const render = await load();
    await render().start("指示");

    expect(render().status).toBe("notReady");
    expect(render().reason).toBe("rateLimited");
    expect(env.streams).toHaveLength(0);
  });

  it("切れて 3回 張り直しても、マイクの 流れを 取り残さない", async () => {
    sdk.plan = { [SPARE]: "accept" };
    const render = await load();
    void render().start("指示");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(render().status).toBe("live");

    /*
     * 回線が 切れる（ブラウザは 壊れた → 閉じた の 2つを 出す）。そこから 先は
     * どの モデルにも 断られる。
     */
    sdk.plan = {};
    sdk.live[0]!.callbacks.onerror?.();
    sdk.live[0]!.callbacks.onclose?.({ code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(60_000);

    // 張り直しは 3回（0.5秒 → 1秒 → 2秒）で あきらめ、画面は スタートに 戻る。
    // 1回の 切断で 2回ぶん 使わない（壊れた・閉じた の 両方で 数えない）
    expect(env.streams).toHaveLength(4);
    expect(openStreams()).toBe(0);
    expect(env.captures.every((c) => c.stopped > 0)).toBe(true);
    expect(render().status).toBe("idle");
  });

  it("こちらが 閉じた つなぎの 切断では 張り直さない（ラウンドの 入れかえ）", async () => {
    sdk.plan = { [HEAD]: "accept" };
    const render = await load();
    void render().start("指示");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(sdk.connects).toEqual([HEAD]);

    void render().swapInstruction("ラウンド2の 指示");
    await vi.advanceTimersByTimeAsync(30_000);

    // 入れかえの 1回だけ。閉じた 前の つなぎの onclose が 張り直しを 呼び続けない
    expect(sdk.connects).toEqual([HEAD, HEAD]);
    expect(openStreams()).toBe(1);
  });

  it("遅い 回線: 先頭が 期限の あとに つながったら 先頭を 使い、控えは 閉じる", async () => {
    sdk.plan = { [HEAD]: "late", [SPARE]: "late" };
    const render = await load();
    void render().start("指示");
    await vi.advanceTimersByTimeAsync(10_500);

    expect(render().status).toBe("live");
    expect(sdk.connects).toEqual([HEAD, SPARE]);
    expect(openStreams()).toBe(1);

    // 控えは 9秒で 始まり、19秒で つながる。使わずに 閉じ、張り直しも 呼ばない
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sdk.closed).toEqual([SPARE]);
    expect(sdk.connects).toEqual([HEAD, SPARE]);
    expect(render().status).toBe("live");
  });

  it("張り直しの 途中で ラウンドが 変わったら、これから ためす つなぎは 新しい 指示文を 使う", async () => {
    sdk.plan = { [HEAD]: "accept" };
    const render = await load();
    void render().start("ラウンド1");
    await vi.advanceTimersByTimeAsync(3_000);

    // 切れる → 0.5秒後に 黙って 張り直し。先頭は こんどは 何も 返さない
    sdk.plan = { [HEAD]: "hang", [SPARE]: "accept" };
    sdk.live[0]!.callbacks.onclose?.({ code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(1_000);
    void render().swapInstruction("ラウンド2");
    await vi.advanceTimersByTimeAsync(12_000);

    expect(sdk.connects).toEqual([HEAD, HEAD, SPARE]);
    expect(sdk.instructions).toEqual(["ラウンド1", "ラウンド1", "ラウンド2"]);
    expect(render().status).toBe("live");
  });

  it("張り直しの 途中で ラウンドが 変わり、古い 文の つなぎが 遅れて 勝ったら、もう 一度 張り直す", async () => {
    sdk.plan = { [HEAD]: "accept" };
    const render = await load();
    void render().start("ラウンド1");
    await vi.advanceTimersByTimeAsync(3_000);

    // 切れる → 0.5秒後に 黙って 張り直し。先頭は 遅い（10秒）、控えは 黙る
    sdk.plan = { [HEAD]: "late", [SPARE]: "hang" };
    sdk.live[0]!.callbacks.onclose?.({ code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(1_000);
    // 先頭は もう ラウンド1の 文で 始まって いる。ここで ラウンドが 変わる
    void render().swapInstruction("ラウンド2");
    await vi.advanceTimersByTimeAsync(60_000);

    // さいごに つながった つなぎは ラウンド2の 文で 始まって いる
    expect(sdk.live.at(-1)?.instruction).toBe("ラウンド2");
    expect(render().status).toBe("live");
    expect(openStreams()).toBe(1);
  });

  it("つなぎの 途中で たいしつ したら、取りかけの マイクも 止める", async () => {
    sdk.plan = Object.fromEntries(LIVE_TALK_MODELS.map((m) => [m, "hang" as const]));
    const render = await load();
    void render().start("指示");
    await vi.advanceTimersByTimeAsync(1_000);
    render().stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sdk.connects).toEqual([HEAD]);
    expect(openStreams()).toBe(0);
    expect(render().status).toBe("idle");
  });
});

describe("たいわ（use-live-session）", () => {
  async function load() {
    const { useLiveSession } = await import("../src/components/listening/use-live-session");
    return () => react.render(() => useLiveSession());
  }

  it("先頭に 断られたら 控えで つながる", async () => {
    sdk.plan = { [SPARE]: "accept" };
    const render = await load();
    void render().connect("指示", "Schedar");
    await vi.advanceTimersByTimeAsync(3_000);

    expect(sdk.connects).toEqual([HEAD, SPARE]);
    expect(env.tokens).toBe(2);
    expect(render().status).toBe("live");
    expect(render().voiceOn).toBe(true);
    expect(statusHistory()).toEqual(["connecting", "live"]);
  });

  it("どの モデルにも 断られたら、マイクと 再生を 閉じて 理由を 出す", async () => {
    const render = await load();
    void render().connect("指示");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sdk.connects).toEqual([...LIVE_TALK_MODELS]);
    expect(render().status).toBe("error");
    expect(render().reason).toBe("connect");
    expect(openStreams()).toBe(0);
    expect(env.contexts.every((c) => c.closed)).toBe(true);
    // 断られた つなぎの 切断で 状態を 動かさない（error の 前に idle / live を 挟まない）
    expect(statusHistory()).toEqual(["connecting", "error"]);
  });

  it("使いすぎで 閉じられたら、理由は rateLimited（控えも ためしてから）", async () => {
    sdk.plan = Object.fromEntries(LIVE_TALK_MODELS.map((m) => [m, "quota" as const]));
    const render = await load();
    void render().connect("指示");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sdk.connects).toEqual([...LIVE_TALK_MODELS]);
    expect(render().status).toBe("error");
    expect(render().reason).toBe("rateLimited");
    expect(openStreams()).toBe(0);
  });

  it("つなぎの 途中で 相手が かわったら、前の つなぎは 残りの モデルを ためさない", async () => {
    sdk.plan = Object.fromEntries(LIVE_TALK_MODELS.map((m) => [m, "hang" as const]));
    const render = await load();
    void render().connect("指示A");
    await vi.advanceTimersByTimeAsync(1_000);
    sdk.plan = { [HEAD]: "accept" };
    void render().connect("指示B");
    await vi.advanceTimersByTimeAsync(40_000);

    // 1本目は 先頭の 期限切れで やめ、2本目は 先頭で つながる
    expect(sdk.connects).toEqual([HEAD, HEAD]);
    expect(render().status).toBe("live");
    expect(openStreams()).toBe(1);
  });
});

/**
 * たいわの 🎤（2026-09-16 の 指定「マイクを 押している 間だけの 利用が 前提」）
 *
 * 前は つないで いる あいだ ずっと マイクの 音を 送って いた。ミーティングと 同じ
 * 「オンの あいだだけ 送る」に そろえた ことを、送った ものの 並びで 確かめる。
 */
describe("たいわの 🎤（オンの あいだだけ 送る）", () => {
  async function connected() {
    sdk.plan = { [HEAD]: "accept" };
    const { useLiveSession } = await import("../src/components/listening/use-live-session");
    const render = () => react.render(() => useLiveSession());
    void render().connect("指示", "Schedar");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(render().status).toBe("live");
    const live = sdk.live[0]!;
    const mic = env.captures[0]!;
    /** マイクから 0.01秒ぶんの 音が 来た ことに する。 */
    const speak = () => mic.onPcm?.(new Int16Array(160));
    const kinds = () =>
      live.sent.map((item) => {
        if (item.client) return "client";
        const input = item.realtime as Record<string, unknown>;
        return Object.keys(input)[0];
      });
    /** 相手から 届く もの。 */
    const receive = (serverContent: Record<string, unknown>) =>
      live.callbacks.onmessage?.({ serverContent });
    const audio = { modelTurn: { parts: [{ inlineData: { data: "AAAAAA==" } }] } };
    return { render, live, speak, kinds, receive, audio };
  }

  it("自動の 区切りを 切って つなぐ", async () => {
    const { live } = await connected();
    expect(live.config.realtimeInputConfig).toEqual({
      automaticActivityDetection: { disabled: true },
    });
  });

  it("🎤 が オフの あいだの マイクの 音は 送らず、オンの あいだだけ 送る", async () => {
    const { render, speak, kinds } = await connected();
    speak();
    expect(kinds()).toEqual([]);
    expect(render().talking).toBe(false);

    render().startTalking();
    speak();
    speak();
    render().stopTalking();
    speak();

    expect(render().talking).toBe(false);
    expect(kinds()).toEqual(["activityStart", "audio", "audio", "activityEnd"]);
  });

  it("オンに したとき、鳴って いる 相手の 声を 止める", async () => {
    const { render, receive, audio } = await connected();
    receive(audio);
    expect(env.sources).toHaveLength(1);
    expect(env.sources[0]!.stopped).toBe(false);

    render().startTalking();
    expect(env.sources[0]!.stopped).toBe(true);
  });

  it("割り込まれたら 鳴らす 予約と 言いかけの 字を 捨てる（つぎの 返事に つながらない）", async () => {
    const { render, receive, audio } = await connected();
    receive({ ...audio, outputTranscription: { text: "こんに" } });
    receive({ interrupted: true });
    expect(env.sources[0]!.stopped).toBe(true);

    receive({ outputTranscription: { text: "はい、どうぞ。" } });
    receive({ turnComplete: true });
    expect(render().transcript.at(-1)).toEqual({
      from: "client",
      text: "はい、どうぞ。",
      mode: "voice",
    });
  });

  it("オンに し直したら、前の 言いかけの 聞き取りは 判定に 回さない（ミーティングと 同じ）", async () => {
    const { render, receive } = await connected();
    render().startTalking();
    receive({ inputTranscription: { text: "よさんは " } });
    render().stopTalking();
    render().startTalking();
    expect(render().lastUtterance).toBeNull();

    receive({ inputTranscription: { text: "納期は いつですか" } });
    render().stopTalking();
    receive({ outputTranscription: { text: "来月です。" } });
    expect(render().lastUtterance?.text).toBe("納期は いつですか");
  });

  it("オンの まま 書いて 送ったら、声の ターンを 先に 閉じる", async () => {
    const { render, kinds } = await connected();
    render().startTalking();
    render().send("こんにちは");
    expect(render().talking).toBe(false);
    expect(kinds()).toEqual(["activityStart", "activityEnd", "client"]);
  });

  it("オンの まま つなぎ直したら（相手の 切りかえ）、新しい つなぎは オフから 始まる", async () => {
    const { render } = await connected();
    render().startTalking();
    void render().connect("べつの 人", "Schedar");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(render().status).toBe("live");
    expect(render().talking).toBe(false);

    env.captures[1]!.onPcm?.(new Int16Array(160));
    expect(sdk.live[1]!.sent).toEqual([]);
  });

  it("つないだ あとに 切れたら オフに 戻り、音を 送らない", async () => {
    const { render, live, speak, kinds } = await connected();
    render().startTalking();
    live.callbacks.onclose?.({ code: 1006, reason: "" });
    speak();
    expect(render().talking).toBe(false);
    expect(kinds()).toEqual(["activityStart"]);
  });

  it("オンの まま 画面から 消えたら、つなぎと マイクを 閉じて 音を 送らない", async () => {
    const { render, speak, kinds } = await connected();
    render().startTalking();
    react.unmount();
    speak();
    expect(kinds()).toEqual(["activityStart"]);
    expect(sdk.closed).toContain(HEAD);
    expect(env.captures[0]!.stopped).toBeGreaterThan(0);
    expect(openStreams()).toBe(0);
  });

  it("切ったら オフに 戻り、そのあとの マイクの 音は 送らない", async () => {
    const { render, speak, kinds } = await connected();
    render().startTalking();
    render().disconnect();
    speak();
    expect(render().talking).toBe(false);
    expect(kinds()).toEqual(["activityStart"]);
  });
});
