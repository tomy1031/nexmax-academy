import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authFromToken,
  connectLiveInOrder,
  createSetupGate,
  LIVE_SETUP_TIMEOUT_MS,
  LiveSetupError,
  startingWith,
  type LiveAuth,
} from "../src/lib/ai/live-connect";
import { LIVE_TALK_MODELS } from "../src/lib/ai/models";

/**
 * Live に つなぐ 順番の 決まり（2026-09-16 の 検収）
 *
 * たいわ・ミーティングの 声は 一覧の 先頭しか ためして いなかった。
 * SDK の connect は 断られても 返らない ので、「断られたら つぎへ」は
 * **こちらが 期限と 切断を 見る**ことで はじめて 成り立つ。
 */

/** SDK の connect の かわり（したくの 合図が 来たら resolve する 約束）。 */
function pendingConnect() {
  let resolve: (session: { close: () => void; closed: boolean }) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<{ close: () => void; closed: boolean }>((ok, bad) => {
    resolve = ok;
    reject = bad;
  });
  const session = {
    closed: false,
    close() {
      this.closed = true;
    },
  };
  return { promise, session, resolve: () => resolve(session), reject };
}

describe("したくの 合図を 待つ 門", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("合図が 来たら つながる（段階は ready）", async () => {
    const gate = createSetupGate<ReturnType<typeof pendingConnect>["session"]>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    expect(gate.phase()).toBe("waiting");
    connect.resolve();
    await expect(waiting).resolves.toBe(connect.session);
    expect(gate.phase()).toBe("ready");
  });

  it("合図の 前に 閉じられたら、期限を 待たずに その場で 投げる", async () => {
    const gate = createSetupGate<ReturnType<typeof pendingConnect>["session"]>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    // SDK は 閉じられても connect を reject しない。onclose から 門を 落とす
    gate.fail("modelNotFound");
    await expect(waiting).rejects.toEqual(new LiveSetupError("modelNotFound"));
    expect(gate.phase()).toBe("abandoned");
  });

  it("何も 起きなければ 期限で 投げる（理由は timeout）", async () => {
    const gate = createSetupGate<ReturnType<typeof pendingConnect>["session"]>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    const caught = waiting.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(LIVE_SETUP_TIMEOUT_MS - 1);
    expect(gate.phase()).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(await caught).toEqual(new LiveSetupError("timeout"));
    expect(gate.phase()).toBe("abandoned");
  });

  it("諦めた あとに 遅れて つながった ものは 閉じる（居座らせない）", async () => {
    const gate = createSetupGate<ReturnType<typeof pendingConnect>["session"]>(100);
    const connect = pendingConnect();
    const caught = gate.wait(connect.promise).catch(() => "gave up");
    await vi.advanceTimersByTimeAsync(100);
    expect(await caught).toBe("gave up");
    connect.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(connect.session.closed).toBe(true);
  });

  it("つながった あとの 切断は 門を 動かさない（呼ぶ 側が ふつうの 切断として 扱う）", async () => {
    const gate = createSetupGate<ReturnType<typeof pendingConnect>["session"]>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    connect.resolve();
    await waiting;
    gate.fail("modelNotFound");
    expect(gate.phase()).toBe("ready");
    expect(connect.session.closed).toBe(false);
  });

  it("wait の 前に 断られても、wait は すぐ 投げる", async () => {
    const gate = createSetupGate<ReturnType<typeof pendingConnect>["session"]>();
    gate.fail("upstream");
    const connect = pendingConnect();
    await expect(gate.wait(connect.promise)).rejects.toEqual(new LiveSetupError("upstream"));
  });

  it("SDK が 投げた ときは その まま 投げる（期限の 時計も 止める）", async () => {
    const gate = createSetupGate<ReturnType<typeof pendingConnect>["session"]>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    const boom = new Error("WebSocket is not connected");
    connect.reject(boom);
    await expect(waiting).rejects.toBe(boom);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("短命トークン → 通行証", () => {
  it("作れたら トークンを 使う", () => {
    expect(authFromToken({ ok: true, token: "auth_tokens/x", expiresAt: "" }, "KEY")).toEqual({
      ok: true,
      auth: "auth_tokens/x",
    });
  });

  it("作れない キー（tokenRejected / invalidRequest）の ときだけ 鍵で 直接", () => {
    for (const reason of ["tokenRejected", "invalidRequest"]) {
      expect(authFromToken({ ok: false, reason }, "KEY")).toEqual({ ok: true, auth: "KEY" });
    }
  });

  it("権限・使いすぎは 直接 つないでも 同じ なので、理由の まま 返す", () => {
    for (const reason of ["noPermission", "rateLimited", "badKey", "network"]) {
      expect(authFromToken({ ok: false, reason }, "KEY")).toEqual({ ok: false, reason });
    }
  });
});

describe("先に 作った 1枚は 最初の 1回だけ", () => {
  it("2回目 からは 作り直す（1回 使い切りの トークンを 使い回さない）", async () => {
    let made = 0;
    const mint = startingWith({ ok: true, auth: "first" }, async () => {
      made += 1;
      return { ok: true, auth: `fresh-${made}` };
    });
    expect(await mint()).toEqual({ ok: true, auth: "first" });
    expect(await mint()).toEqual({ ok: true, auth: "fresh-1" });
    expect(await mint()).toEqual({ ok: true, auth: "fresh-2" });
  });
});

describe("モデルを 上から 順に ためす", () => {
  /** ためした 順と、その ときの 通行証を 記録する。 */
  function recorder() {
    const tried: { model: string; auth: string }[] = [];
    let n = 0;
    const mint = async (): Promise<LiveAuth> => {
      n += 1;
      return { ok: true, auth: `token-${n}` };
    };
    return { tried, mint };
  }

  it("先頭が 断られたら 控えへ 進み、控えで つながる", async () => {
    const { tried, mint } = recorder();
    const result = await connectLiveInOrder({
      models: LIVE_TALK_MODELS,
      mint,
      open: async (auth, model) => {
        tried.push({ model, auth });
        if (model === LIVE_TALK_MODELS[0]) throw new LiveSetupError("modelNotFound");
        return `session:${model}`;
      },
    });
    expect(result).toEqual({
      ok: true,
      session: `session:${LIVE_TALK_MODELS[1]}`,
      model: LIVE_TALK_MODELS[1],
    });
    expect(tried.map((t) => t.model)).toEqual([LIVE_TALK_MODELS[0], LIVE_TALK_MODELS[1]]);
  });

  it("ためす たびに 通行証を 作り直す（同じ トークンを 2回 使わない）", async () => {
    const { tried, mint } = recorder();
    await connectLiveInOrder({
      models: ["a", "b", "c"],
      mint,
      open: async (auth, model) => {
        tried.push({ model, auth });
        throw new LiveSetupError("timeout");
      },
    });
    expect(tried.map((t) => t.auth)).toEqual(["token-1", "token-2", "token-3"]);
  });

  it("先頭で つながれば 控えは ためさない", async () => {
    const { tried, mint } = recorder();
    const result = await connectLiveInOrder({
      models: ["a", "b"],
      mint,
      open: async (auth, model) => {
        tried.push({ model, auth });
        return model;
      },
    });
    expect(result).toMatchObject({ ok: true, model: "a" });
    expect(tried).toHaveLength(1);
  });

  it("通行証が 作れなければ そこで やめる（理由は 鍵の 理由の まま）", async () => {
    const opened: string[] = [];
    const result = await connectLiveInOrder({
      models: ["a", "b"],
      mint: async () => ({ ok: false, reason: "rateLimited" }),
      open: async (_auth, model) => {
        opened.push(model);
        return model;
      },
    });
    expect(result).toEqual({ ok: false, stage: "auth", reason: "rateLimited" });
    expect(opened).toEqual([]);
  });

  it("2つ目の 通行証が 作れなかった ときも 鍵の 理由で やめる", async () => {
    let n = 0;
    const result = await connectLiveInOrder({
      models: ["a", "b", "c"],
      mint: async (): Promise<LiveAuth> =>
        (n += 1) === 1 ? { ok: true, auth: "t" } : { ok: false, reason: "noPermission" },
      open: async () => {
        throw new LiveSetupError("modelNotFound");
      },
    });
    expect(result).toEqual({ ok: false, stage: "auth", reason: "noPermission" });
  });

  it("どれも だめなら、さいごに ためした ものの 理由を 返す", async () => {
    const { mint } = recorder();
    const reasons = ["modelNotFound", "timeout"];
    const result = await connectLiveInOrder({
      models: ["a", "b"],
      mint,
      open: async () => {
        throw new LiveSetupError(reasons.shift()!);
      },
    });
    expect(result).toEqual({ ok: false, stage: "connect", reason: "timeout" });
  });

  it("理由の 名前は 呼ぶ 側が 決められる（見かたの つなぎは 知らない 失敗を modelNotFound に）", async () => {
    const { mint } = recorder();
    const result = await connectLiveInOrder({
      models: ["a"],
      mint,
      open: async () => {
        throw new Error("sdk");
      },
      reasonOf: (error) => (error instanceof LiveSetupError ? error.reason : "modelNotFound"),
    });
    expect(result).toEqual({ ok: false, stage: "connect", reason: "modelNotFound" });
  });

  it("一覧が 空なら つながらない（理由は upstream）", async () => {
    const { mint } = recorder();
    const result = await connectLiveInOrder({ models: [], mint, open: async () => "x" });
    expect(result).toEqual({ ok: false, stage: "connect", reason: "upstream" });
  });

  it("途中で やめる 合図が 立ったら、残りの モデルを ためさない", async () => {
    const { tried, mint } = recorder();
    let stopped = false;
    const result = await connectLiveInOrder({
      models: ["a", "b", "c"],
      mint,
      open: async (auth, model) => {
        tried.push({ model, auth });
        stopped = true; // 1つ目を ためして いる あいだに 画面を 離れた
        throw new LiveSetupError("timeout");
      },
      stop: () => stopped,
    });
    expect(result).toEqual({ ok: false, stage: "connect", reason: "timeout" });
    expect(tried.map((t) => t.model)).toEqual(["a"]);
  });

  it("門と 組み合わせる: 先頭は 閉じられ、控えは 合図が 来る → 控えで つながる", async () => {
    const { mint } = recorder();
    const sessions: ReturnType<typeof pendingConnect>[] = [];
    const result = await connectLiveInOrder({
      models: ["gemini-3.8-live", "gemini-3.1-flash-live-preview"],
      mint,
      open: async (_auth, model) => {
        const gate = createSetupGate<ReturnType<typeof pendingConnect>["session"]>();
        const connect = pendingConnect();
        sessions.push(connect);
        const waiting = gate.wait(connect.promise);
        // SDK の コールバックの かわり: 先頭は 設定を 断って 閉じる、控えは 合図を 返す
        if (model === "gemini-3.8-live") queueMicrotask(() => gate.fail("modelNotFound"));
        else queueMicrotask(() => connect.resolve());
        return await waiting;
      },
    });
    expect(result).toMatchObject({ ok: true, model: "gemini-3.1-flash-live-preview" });
    expect(sessions).toHaveLength(2);
  });
});
