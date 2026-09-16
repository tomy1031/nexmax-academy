import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authFromToken,
  connectLiveInOrder,
  createSetupGate,
  LIVE_SETUP_TIMEOUT_MS,
  LiveSetupError,
  reasonFromClose,
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

interface FakeSession {
  readonly name: string;
  closed: boolean;
  close: () => void;
}

function session(name: string): FakeSession {
  const made: FakeSession = {
    name,
    closed: false,
    close: () => {
      made.closed = true;
    },
  };
  return made;
}

/** SDK の connect の かわり（したくの 合図が 来たら resolve する 約束）。 */
function pendingConnect(name = "s") {
  let resolve: (value: FakeSession) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<FakeSession>((ok, bad) => {
    resolve = ok;
    reject = bad;
  });
  const made = session(name);
  return { promise, session: made, resolve: () => resolve(made), reject };
}

describe("したくの 合図を 待つ 門", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("合図が 来たら つながる（段階は ready）", async () => {
    const gate = createSetupGate<FakeSession>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    expect(gate.phase()).toBe("waiting");
    connect.resolve();
    await expect(waiting).resolves.toBe(connect.session);
    expect(gate.phase()).toBe("ready");
  });

  it("合図の 前に 閉じられたら、期限を 待たずに その場で 投げる", async () => {
    const gate = createSetupGate<FakeSession>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    // SDK は 閉じられても connect を reject しない。onclose から 門を 落とす
    gate.fail("modelNotFound");
    await expect(waiting).rejects.toEqual(new LiveSetupError("modelNotFound"));
    expect(gate.phase()).toBe("abandoned");
  });

  it("何も 起きなければ 期限で 投げる（理由は timeout・段階は late）", async () => {
    const gate = createSetupGate<FakeSession>();
    const connect = pendingConnect();
    const caught = gate.wait(connect.promise).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(LIVE_SETUP_TIMEOUT_MS - 1);
    expect(gate.phase()).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(await caught).toEqual(new LiveSetupError("timeout"));
    expect(gate.phase()).toBe("late");
  });

  it("期限の あとに 届いた ものは、使う 口（claim）が 無ければ 閉じる", async () => {
    const gate = createSetupGate<FakeSession>(100);
    const connect = pendingConnect();
    const caught = gate.wait(connect.promise).catch(() => "gave up");
    await vi.advanceTimersByTimeAsync(100);
    expect(await caught).toBe("gave up");
    connect.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(connect.session.closed).toBe(true);
    expect(gate.phase()).toBe("abandoned");
  });

  it("期限の あとに 届いた ものも、claim が 受け取れば 使う（遅い 回線で 捨てない）", async () => {
    const claimed: FakeSession[] = [];
    const gate = createSetupGate<FakeSession>(100, (s) => {
      claimed.push(s);
      return true;
    });
    const connect = pendingConnect();
    void gate.wait(connect.promise).catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    connect.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(claimed).toEqual([connect.session]);
    expect(connect.session.closed).toBe(false);
    expect(gate.phase()).toBe("ready");
  });

  it("claim が 断ったら（先に 別の ものが 決まった）、捨てる 印を 付けてから 閉じる", async () => {
    const gate = createSetupGate<FakeSession>(9_000, () => false);
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    let phaseWhenClosed = "";
    connect.session.close = () => {
      phaseWhenClosed = gate.phase();
      connect.session.closed = true;
    };
    connect.resolve();
    await expect(waiting).rejects.toEqual(new LiveSetupError("superseded"));
    expect(connect.session.closed).toBe(true);
    // 閉じた 知らせ（onclose）を「つないだ あとの 切断」と 取りちがえない
    expect(phaseWhenClosed).toBe("abandoned");
  });

  it("期限の あとに 閉じられたら、もう 使わない", async () => {
    const gate = createSetupGate<FakeSession>(100, () => true);
    const connect = pendingConnect();
    void gate.wait(connect.promise).catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    gate.fail("modelNotFound");
    expect(gate.phase()).toBe("abandoned");
  });

  it("つながった あとの 切断は 門を 動かさない（呼ぶ 側が ふつうの 切断として 扱う）", async () => {
    const gate = createSetupGate<FakeSession>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    connect.resolve();
    await waiting;
    gate.fail("modelNotFound");
    expect(gate.phase()).toBe("ready");
    expect(connect.session.closed).toBe(false);
  });

  it("wait の 前に 断られても、wait は すぐ 投げる", async () => {
    const gate = createSetupGate<FakeSession>();
    gate.fail("upstream");
    const connect = pendingConnect();
    await expect(gate.wait(connect.promise)).rejects.toEqual(new LiveSetupError("upstream"));
  });

  it("SDK が 投げた ときは その まま 投げる（期限の 時計も 止める）", async () => {
    const gate = createSetupGate<FakeSession>();
    const connect = pendingConnect();
    const waiting = gate.wait(connect.promise);
    const boom = new Error("WebSocket is not connected");
    connect.reject(boom);
    await expect(waiting).rejects.toBe(boom);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("閉じられた 理由の 名前", () => {
  it("使いすぎは rateLimited（学習者に「つかいすぎ」と 出せる）", () => {
    for (const reason of [
      "You exceeded your current quota, please check your plan and billing details.",
      "Resource has been exhausted (e.g. check quota).",
      "Too many requests",
    ]) {
      expect(reasonFromClose({ code: 1011, reason })).toBe("rateLimited");
    }
  });

  it("それ以外（モデルが 無い・設定を 断られた・理由なし）は modelNotFound", () => {
    expect(
      reasonFromClose({
        code: 1008,
        reason: "models/gemini-0 is not found for API version v1beta",
      }),
    ).toBe("modelNotFound");
    expect(reasonFromClose({ code: 1007, reason: "Request contains an invalid argument." })).toBe(
      "modelNotFound",
    );
    expect(reasonFromClose(undefined)).toBe("modelNotFound");
    expect(reasonFromClose({ code: 1006 })).toBe("modelNotFound");
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
  function counter() {
    let made = 0;
    return async (): Promise<LiveAuth> => {
      made += 1;
      return { ok: true, auth: `fresh-${made}` };
    };
  }

  it("2回目 からは 作り直す（1回 使い切りの トークンを 使い回さない）", async () => {
    const mint = startingWith({ ok: true, auth: "first" }, counter());
    expect(await mint()).toEqual({ ok: true, auth: "first" });
    expect(await mint()).toEqual({ ok: true, auth: "fresh-1" });
    expect(await mint()).toEqual({ ok: true, auth: "fresh-2" });
  });

  it("マイクの 許可で 時間が たって いたら、1枚目も 作り直す（2分で 使えなく なる）", async () => {
    let clock = 0;
    const mint = startingWith({ ok: true, auth: "first" }, counter(), 60_000, () => clock);
    clock = 60_001;
    expect(await mint()).toEqual({ ok: true, auth: "fresh-1" });
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
    const result = await connectLiveInOrder<FakeSession>({
      models: LIVE_TALK_MODELS,
      mint,
      open: async (auth, model) => {
        tried.push({ model, auth });
        if (model === LIVE_TALK_MODELS[0]) throw new LiveSetupError("modelNotFound");
        return session(model);
      },
    });
    expect(result).toMatchObject({ ok: true, model: LIVE_TALK_MODELS[1] });
    expect(tried.map((t) => t.model)).toEqual([LIVE_TALK_MODELS[0], LIVE_TALK_MODELS[1]]);
  });

  it("ためす たびに 通行証を 作り直す（同じ トークンを 2回 使わない）", async () => {
    const { tried, mint } = recorder();
    await connectLiveInOrder<FakeSession>({
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
    const result = await connectLiveInOrder<FakeSession>({
      models: ["a", "b"],
      mint,
      open: async (auth, model) => {
        tried.push({ model, auth });
        return session(model);
      },
    });
    expect(result).toMatchObject({ ok: true, model: "a" });
    expect(tried).toHaveLength(1);
  });

  it("通行証が 作れなければ そこで やめる（理由は 鍵の 理由の まま）", async () => {
    const opened: string[] = [];
    const result = await connectLiveInOrder<FakeSession>({
      models: ["a", "b"],
      mint: async () => ({ ok: false, reason: "rateLimited" }),
      open: async (_auth, model) => {
        opened.push(model);
        return session(model);
      },
    });
    expect(result).toEqual({ ok: false, stage: "auth", reason: "rateLimited" });
    expect(opened).toEqual([]);
  });

  it("2つ目の 通行証が 作れなかった ときも 鍵の 理由で やめる", async () => {
    let n = 0;
    const result = await connectLiveInOrder<FakeSession>({
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
    const result = await connectLiveInOrder<FakeSession>({
      models: ["a", "b"],
      mint,
      open: async () => {
        throw new LiveSetupError(reasons.shift()!);
      },
    });
    expect(result).toEqual({ ok: false, stage: "connect", reason: "timeout" });
  });

  it("使いすぎで 閉じられた ものが 1つでも あれば、理由は rateLimited", async () => {
    const { mint } = recorder();
    const reasons = ["rateLimited", "modelNotFound", "modelNotFound"];
    const result = await connectLiveInOrder<FakeSession>({
      models: ["a", "b", "c"],
      mint,
      open: async () => {
        throw new LiveSetupError(reasons.shift()!);
      },
    });
    expect(result).toEqual({ ok: false, stage: "connect", reason: "rateLimited" });
  });

  it("理由の 名前は 呼ぶ 側が 決められる（見かたの つなぎは 知らない 失敗を modelNotFound に）", async () => {
    const { mint } = recorder();
    const result = await connectLiveInOrder<FakeSession>({
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
    const result = await connectLiveInOrder<FakeSession>({
      models: [],
      mint,
      open: async () => session("x"),
    });
    expect(result).toEqual({ ok: false, stage: "connect", reason: "upstream" });
  });

  it("途中で やめる 合図が 立ったら、残りの モデルを ためさない", async () => {
    const { tried, mint } = recorder();
    let stopped = false;
    const result = await connectLiveInOrder<FakeSession>({
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

  describe("門と 組み合わせる", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("先頭は 閉じられ、控えは 合図が 来る → 控えで つながる", async () => {
      const { mint } = recorder();
      const connects: ReturnType<typeof pendingConnect>[] = [];
      const running = connectLiveInOrder<FakeSession>({
        models: ["gemini-3.8-live", "gemini-3.1-flash-live-preview"],
        mint,
        open: async (_auth, model, claim) => {
          const gate = createSetupGate<FakeSession>(LIVE_SETUP_TIMEOUT_MS, claim);
          const connect = pendingConnect(model);
          connects.push(connect);
          const waiting = gate.wait(connect.promise);
          // SDK の コールバックの かわり: 先頭は 設定を 断って 閉じる、控えは 合図を 返す
          if (model === "gemini-3.8-live") setTimeout(() => gate.fail("modelNotFound"), 300);
          else setTimeout(() => connect.resolve(), 500);
          return await waiting;
        },
      });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await running).toMatchObject({ ok: true, model: "gemini-3.1-flash-live-preview" });
      expect(connects).toHaveLength(2);
    });

    it("遅い 回線: 先頭が 期限の あとに つながったら 先頭を 使い、控えは 閉じる", async () => {
      const { mint } = recorder();
      const connects = new Map<string, ReturnType<typeof pendingConnect>>();
      let result: unknown = "pending";
      void connectLiveInOrder<FakeSession>({
        models: ["head", "spare"],
        mint,
        open: async (_auth, model, claim) => {
          const gate = createSetupGate<FakeSession>(LIVE_SETUP_TIMEOUT_MS, claim);
          const connect = pendingConnect(model);
          connects.set(model, connect);
          // どちらも したくに 10秒 かかる（期限の 9秒を 少し 越える）
          setTimeout(() => connect.resolve(), 10_000);
          return await gate.wait(connect.promise);
        },
      }).then((value) => {
        result = value;
      });

      await vi.advanceTimersByTimeAsync(10_000);
      expect(result).toMatchObject({ ok: true, model: "head" });
      expect(connects.get("head")!.session.closed).toBe(false);

      // 控えは 9秒で 始まって いた。つながっても 使わずに 閉じる
      await vi.advanceTimersByTimeAsync(10_000);
      expect(connects.get("spare")!.session.closed).toBe(true);
    });

    it("つぎの 通行証が 回線の 瞬断で 作れなくても、期限切れの 先頭が 猶予の うちに つながれば 使う", async () => {
      const connect = pendingConnect("head");
      let n = 0;
      let result: unknown = "pending";
      void connectLiveInOrder<FakeSession>({
        models: ["head", "spare"],
        mint: async (): Promise<LiveAuth> =>
          (n += 1) === 1 ? { ok: true, auth: "t1" } : { ok: false, reason: "network" },
        open: async (_auth, _model, claim) => {
          const gate = createSetupGate<FakeSession>(LIVE_SETUP_TIMEOUT_MS, claim);
          setTimeout(() => connect.resolve(), 10_000);
          return await gate.wait(connect.promise);
        },
        lateGraceMs: LIVE_SETUP_TIMEOUT_MS,
      }).then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(9_500);
      expect(result).toBe("pending");
      await vi.advanceTimersByTimeAsync(1_000);
      expect(result).toMatchObject({ ok: true, model: "head" });
      expect(connect.session.closed).toBe(false);
    });

    it("猶予を 過ぎても つながらなければ、鍵の 理由で 返す", async () => {
      let n = 0;
      let result: unknown = "pending";
      void connectLiveInOrder<FakeSession>({
        models: ["head", "spare"],
        mint: async (): Promise<LiveAuth> =>
          (n += 1) === 1 ? { ok: true, auth: "t1" } : { ok: false, reason: "network" },
        open: async (_auth, _model, claim) => {
          const gate = createSetupGate<FakeSession>(LIVE_SETUP_TIMEOUT_MS, claim);
          return await gate.wait(new Promise<FakeSession>(() => {}));
        },
        lateGraceMs: 1_000,
      }).then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(LIVE_SETUP_TIMEOUT_MS + 1_000);
      expect(result).toEqual({ ok: false, stage: "auth", reason: "network" });
    });

    it("どれも 決まらずに 終わった あとに 届いた ものは 閉じる（居座らせない）", async () => {
      const { mint } = recorder();
      const connect = pendingConnect("only");
      let result: unknown = "pending";
      void connectLiveInOrder<FakeSession>({
        models: ["only"],
        mint,
        open: async (_auth, _model, claim) => {
          const gate = createSetupGate<FakeSession>(LIVE_SETUP_TIMEOUT_MS, claim);
          return await gate.wait(connect.promise);
        },
      }).then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(LIVE_SETUP_TIMEOUT_MS);
      expect(result).toEqual({ ok: false, stage: "connect", reason: "timeout" });
      connect.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(connect.session.closed).toBe(true);
    });
  });
});
