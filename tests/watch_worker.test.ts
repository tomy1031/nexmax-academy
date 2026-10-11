import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ATTEMPTS,
  CARRY_MS,
  CLIENT_ERROR_THRESHOLD,
  PROBES,
  REMIND_MS,
  RETRY_WAIT_MS,
  classifyResponse,
  decide,
  ictLabel,
  judge,
  notify,
  runProbe,
  runWatch,
} from "../workers/watch/src/watch.js";

/*
 * 本番の 見張り（workers/watch・2026-10-11）。
 * 守る こと: 1回の つまずきでは 鳴らさない／続いたら 鳴らす／鳴らしっぱなしに しない／
 * 直ったら 言う／KV に 書かない／cron は アカウントの 残り 2本に 収める。
 */

const PROD = "https://academy.nexmax.workers.dev";
const T0 = Date.UTC(2026, 9, 13, 10, 40); // 火 17:40 ICT（授業中）

type Reply = { status: number; body?: string } | "timeout" | "network";

/** 道ごとに 返事を 順に 返す 偽の fetch。 */
function fakeFetch(script: Record<string, Reply[]>, calls: string[] = []) {
  const left = Object.fromEntries(Object.entries(script).map(([k, v]) => [k, [...v]]));
  return async (url: string) => {
    calls.push(url);
    const path = url.startsWith(PROD) ? url.slice(PROD.length) : url;
    const queue = left[path];
    const next = queue && queue.length > 1 ? queue.shift()! : queue?.[0];
    if (!next) throw new Error(`想定外の 呼び出し: ${url}`);
    if (next === "timeout") throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (next === "network") throw new TypeError("fetch failed");
    return new Response(next.body ?? "", { status: next.status });
  };
}

const healthy = (warnings: string[] = []) => ({
  status: 200,
  body: JSON.stringify({ sha: "x", stages: [], wordStages: [], warnings }),
});
const OK_ALL: Record<string, Reply[]> = {
  "/": [{ status: 200, body: "<html>" }],
  "/map": [{ status: 307 }],
  "/api/health/content": [healthy()],
};
const ERROR_1102 = {
  status: 503,
  body: "<title>Worker exceeded resource limits | academy.nexmax.workers.dev | Cloudflare</title> Error 1102",
};

const noSleep = async () => {};

describe("classifyResponse — 応答の 見分け", () => {
  const title = PROBES.find((p) => p.id === "title")!;
  const gate = PROBES.find((p) => p.id === "gate")!;

  it("Cloudflare の 1102 / 1101 の 画面を 見分ける", () => {
    expect(classifyResponse(title, 503, ERROR_1102.body)).toBe("1102");
    expect(classifyResponse(title, 500, "Error 1101 Worker threw exception")).toBe("1101");
    expect(classifyResponse(title, 502, "bad gateway")).toBe("502");
  });

  it("門番の 転送（ログインなし → タイトル）は 正常", () => {
    expect(classifyResponse(gate, 307)).toBeNull();
    expect(classifyResponse(title, 307)).toBe("307");
  });
});

describe("見に 行く ところ", () => {
  it("作り直しを 起こさない 道だけ（作りおき・門番・作りおき しない API）", () => {
    expect(PROBES.map((p) => p.path)).toEqual(["/", "/map", "/api/health/content"]);
  });
});

describe("runProbe — その 回の 中で 試し直す", () => {
  const title = PROBES[0]!;

  it("1回目で 通れば 1回で やめる", async () => {
    const calls: string[] = [];
    const r = await runProbe(title, {
      baseUrl: PROD,
      fetchImpl: fakeFetch(OK_ALL, calls),
      sleep: noSleep,
    });
    expect(r).toMatchObject({ failures: 0, attempts: 1, code: null });
    expect(calls).toHaveLength(1);
  });

  it(`だめなら ${RETRY_WAIT_MS / 1000}秒 おいて 最大 ${ATTEMPTS}回`, async () => {
    const waits: number[] = [];
    const r = await runProbe(title, {
      baseUrl: PROD,
      fetchImpl: fakeFetch({ "/": [ERROR_1102] }),
      sleep: async (ms: number) => void waits.push(ms),
    });
    expect(r).toMatchObject({ failures: 3, attempts: 3, code: "1102" });
    expect(waits).toEqual([RETRY_WAIT_MS, RETRY_WAIT_MS]);
  });

  it("途中で 通れば「いまは 通る」。失敗の 印は 残す", async () => {
    const r = await runProbe(title, {
      baseUrl: PROD,
      fetchImpl: fakeFetch({ "/": [ERROR_1102, { status: 200 }] }),
      sleep: noSleep,
    });
    expect(r).toMatchObject({ failures: 1, attempts: 2, code: null, lastFailCode: "1102" });
  });

  it("返事が 無い・つながらない も 失敗に 数える", async () => {
    const r = await runProbe(title, {
      baseUrl: PROD,
      fetchImpl: fakeFetch({ "/": ["timeout", "network", "network"] }),
      sleep: noSleep,
    });
    expect(r).toMatchObject({ failures: 3, code: "network" });
  });

  it("健康しらべが JSON で なければ 失敗", async () => {
    const r = await runProbe(PROBES[2]!, {
      baseUrl: PROD,
      fetchImpl: fakeFetch({ "/api/health/content": [{ status: 200, body: "<html>" }] }),
      sleep: noSleep,
    });
    expect(r.code).toBe("bad-json");
  });
});

const pageResult = (id: string, failures: number, code: string | null, body: unknown = null) => ({
  id,
  failures,
  attempts: code ? 3 : failures + 1,
  code,
  lastFailCode: failures > 0 ? (code ?? "1102") : null,
  body,
});
const allOk = () => [
  pageResult("title", 0, null),
  pageResult("gate", 0, null),
  pageResult("health", 0, null, { warnings: [] }),
];

describe("judge — 続いて いるか", () => {
  it("1回だけの つまずきは suspect（鳴らさない）", () => {
    const j = judge(
      null,
      [pageResult("title", 1, null), ...allOk().slice(1)],
      { skipped: true },
      T0,
    );
    expect(j.findings).toEqual([expect.objectContaining({ key: "page:title", level: "suspect" })]);
  });

  it("その 回の 中で 2回 失敗したら confirmed", () => {
    const j = judge(
      null,
      [pageResult("title", 3, "1102"), ...allOk().slice(1)],
      { skipped: true },
      T0,
    );
    expect(j.findings[0]).toMatchObject({ key: "page:title", level: "confirmed" });
    expect(j.findings[0]!.text).toContain("Error 1102");
  });

  it("間欠的な 異常: 毎回 1回だけ 失敗でも、前の 回に 続けば confirmed", () => {
    const first = judge(
      null,
      [pageResult("title", 1, null), ...allOk().slice(1)],
      { skipped: true },
      T0,
    );
    const prev = { recentFail: first.recentFail, pending: first.pending };
    const second = judge(
      prev,
      [pageResult("title", 1, null), ...allOk().slice(1)],
      { skipped: true },
      T0 + 10 * 60_000,
    );
    expect(second.findings[0]).toMatchObject({ level: "confirmed" });
    expect(second.findings[0]!.text).toContain("いまは 通る");
  });

  it("前の 失敗が 古すぎれば 続いたとは 数えない", () => {
    const prev = { recentFail: { title: T0 - CARRY_MS - 1 }, pending: {} };
    const j = judge(
      prev,
      [pageResult("title", 1, null), ...allOk().slice(1)],
      { skipped: true },
      T0,
    );
    expect(j.findings[0]).toMatchObject({ level: "suspect" });
  });

  it("教材の 警告は 同じ ものが 2回 続いたら confirmed", () => {
    const warn = ["stage:kaihatsu — 教材が 見つからない（quest:waterfall_quest）"];
    const results = [...allOk().slice(0, 2), pageResult("health", 0, null, { warnings: warn })];
    const first = judge(null, results, { skipped: true }, T0);
    expect(first.findings).toEqual([expect.objectContaining({ key: "content", level: "suspect" })]);
    const second = judge(first, results, { skipped: true }, T0 + 600_000);
    expect(second.findings).toEqual([
      expect.objectContaining({ key: "content", level: "confirmed" }),
    ]);
  });

  it(`画面の エラーは ${CLIENT_ERROR_THRESHOLD}件 から 知らせる（ページごとの 数を 添える）`, () => {
    const few = judge(null, allOk(), { rows: [{ path: "/map", kind: "render", n: 2 }] }, T0);
    expect(few.findings).toEqual([]);
    const many = judge(
      null,
      allOk(),
      {
        rows: [
          { path: "/map", kind: "render", n: 3 },
          { path: "/houkoku", kind: "stale", n: 1 },
        ],
      },
      T0,
    );
    expect(many.findings[0]).toMatchObject({ key: "client-errors", level: "confirmed" });
    expect(many.findings[0]!.text).toBe(
      "画面の エラーが 15分で 4件（/map 3件・/houkoku 1件（読み直しでも 直らず））",
    );
  });

  it("DB に 届かないのは 2回 続いたら", () => {
    const first = judge(null, allOk(), { failed: "HTTP 503" }, T0);
    expect(first.findings[0]).toMatchObject({ key: "db", level: "suspect" });
    const second = judge(first, allOk(), { failed: "HTTP 503" }, T0 + 600_000);
    expect(second.findings[0]).toMatchObject({ key: "db", level: "confirmed" });
  });
});

describe("decide — 鳴らす・念押し・直った", () => {
  const started = { startedAt: T0 - 86_400_000, open: {}, recentFail: {}, pending: {} };
  const bad = {
    findings: [{ key: "page:title", level: "confirmed", text: "タイトル画面（/）: Error 1102" }],
    recentFail: {},
    pending: {},
  };
  const shaky = {
    findings: [{ key: "page:title", level: "suspect", text: "ゆれ" }],
    recentFail: {},
    pending: {},
  };
  const clear = { findings: [], recentFail: {}, pending: {} };

  it("最初の 1回は「見張りを はじめました」（知らせ先の 試しを 兼ねる）", () => {
    const { messages, next } = decide(null, clear, T0, PROD);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "start", title: "本番の 見張りを はじめました" });
    expect(messages[0]!.text).toContain("いまは ぜんぶ 正常です");
    expect(next.startedAt).toBe(T0);
  });

  it("正常が 続く あいだは 何も 送らない", () => {
    expect(decide(started, clear, T0, PROD).messages).toEqual([]);
  });

  it("suspect だけでは 鳴らさない", () => {
    expect(decide(started, shaky, T0, PROD).messages).toEqual([]);
  });

  it("新しい 異常で 1回 → 2時間 たつまで 黙る → 念押し", () => {
    const a = decide(started, bad, T0, PROD);
    expect(a.messages).toHaveLength(1);
    expect(a.messages[0]).toMatchObject({ kind: "alert", title: "本番に 異常が あります" });
    expect(a.messages[0]!.text).toContain("🆕 タイトル画面（/）: Error 1102");
    expect(a.messages[0]!.text).toContain("17:40 ICT");

    const b = decide(a.next, bad, T0 + 10 * 60_000, PROD);
    expect(b.messages).toEqual([]);

    const c = decide(b.next, bad, T0 + REMIND_MS, PROD);
    expect(c.messages[0]).toMatchObject({ kind: "alert", title: "本番の 異常が 続いて います" });
  });

  it("ゆれて いる あいだは 閉じない（直った・壊れたを 行き来して 鳴らさない）", () => {
    const a = decide(started, bad, T0, PROD);
    const b = decide(a.next, shaky, T0 + 600_000, PROD);
    expect(b.messages).toEqual([]);
    expect(Object.keys(b.next.open)).toEqual(["page:title"]);
  });

  it("消えたら「直りました」と 続いた 長さ", () => {
    const a = decide(started, bad, T0, PROD);
    const b = decide(a.next, clear, T0 + 30 * 60_000, PROD);
    expect(b.messages).toHaveLength(1);
    expect(b.messages[0]).toMatchObject({ kind: "recovered" });
    expect(b.messages[0]!.text).toContain("30分 続いた");
    expect(b.messages[0]!.text).toContain("いまは ぜんぶ 正常です");
    expect(b.next.open).toEqual({});
  });
});

describe("notify — 知らせ先は 入って いる 鍵で 決まる", () => {
  const message = { kind: "alert", title: "本番に 異常が あります", text: "🚨 本文" };

  it("Slack の Webhook へ text を 送る", async () => {
    const sent: { url: string; body: unknown }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("ok");
    };
    const r = await notify({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" }, message, fetchImpl);
    expect(r).toEqual({ configured: 1, sent: 1 });
    expect(sent).toEqual([{ url: "https://hooks.slack.test/x", body: { text: "🚨 本文" } }]);
  });

  it("メール（Resend）へ 件名つきで 送る。宛先は カンマ区切り", async () => {
    const sent: unknown[] = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}");
    };
    await notify(
      { RESEND_API_KEY: "re_x", ALERT_EMAIL_TO: "a@example.com, b@example.com" },
      message,
      fetchImpl,
    );
    expect(sent[0]).toMatchObject({
      to: ["a@example.com", "b@example.com"],
      subject: "[NexmaxAcademy] 本番に 異常が あります",
      text: "🚨 本文",
    });
  });

  it("鍵が 無ければ どこにも 送らない（ログだけ）", async () => {
    expect(await notify({}, message, async () => new Response())).toEqual({
      configured: 0,
      sent: 0,
    });
  });
});

/** 保存された 状態の 形（テストで 読む ぶんだけ）。 */
interface SavedState {
  startedAt: number | null;
  open: Record<string, unknown>;
  last: { clientErrors: unknown };
}

describe("runWatch — 1回の 見張りの 通し", () => {
  function harness(script: Record<string, Reply[]>, env: Record<string, string> = {}) {
    let state: unknown = null;
    const logs: string[] = [];
    const calls: string[] = [];
    const base = fakeFetch(script, calls);
    const deps = {
      fetch: async (url: string) =>
        url.startsWith("https://hooks.") ? new Response("ok") : base(url),
      sleep: noSleep,
      now: () => T0,
      loadState: async () => state,
      saveState: async (s: unknown) => void (state = s),
      log: (line: string) => void logs.push(line),
    };
    return { deps, env: { PROD_URL: PROD, ...env }, logs, calls, state: () => state as SavedState };
  }

  it("ふだんは 3か所を 1回ずつ 見るだけ。状態は 1件 保存", async () => {
    const h = harness(OK_ALL);
    const r = await runWatch(h.env, h.deps);
    expect(h.calls).toEqual([`${PROD}/`, `${PROD}/map`, `${PROD}/api/health/content`]);
    expect(r.findings).toEqual([]);
    expect(h.state().last.clientErrors).toContain("見ていない");
  });

  it("知らせが 届かなかったら、次の 回に もう一度 送る（黙って 落とさない）", async () => {
    const h = harness(
      { ...OK_ALL, "/": [ERROR_1102] },
      { SLACK_WEBHOOK_URL: "https://slack.down/x" },
    );
    h.deps.fetch = async (url: string) => {
      if (url.startsWith("https://slack.down")) return new Response("no", { status: 500 });
      return fakeFetch({ ...OK_ALL, "/": [ERROR_1102] })(url);
    };
    const r = await runWatch(h.env, h.deps);
    expect(r.delivered).toBe(false);
    expect(h.state().startedAt).toBeNull();
    expect(h.state().open).toEqual({});
  });

  it("画面の エラーの 数は 件数の 関数だけを 呼ぶ", async () => {
    const urls: string[] = [];
    const h = harness(OK_ALL, {
      SUPABASE_URL: "https://db.example.co/",
      SUPABASE_ANON_KEY: "anon",
    });
    const inner = h.deps.fetch;
    h.deps.fetch = async (url: string) => {
      urls.push(url);
      if (url.startsWith("https://db.example.co"))
        return Response.json([{ path: "/map", kind: "render", n: 1 }]);
      return inner(url);
    };
    await runWatch(h.env, h.deps);
    expect(urls.filter((u) => u.startsWith("https://db."))).toEqual([
      "https://db.example.co/rest/v1/rpc/client_error_counts",
    ]);
    expect(h.state().last.clientErrors).toBe(1);
  });
});

describe("ictLabel", () => {
  it("カンボジア時間（UTC+7）で 出す", () => {
    expect(ictLabel(Date.UTC(2026, 9, 13, 10, 40))).toBe("10/13 17:40 ICT");
  });
});

describe("wrangler.jsonc — 無料枠と 本番の 枠を 守る", () => {
  const raw = readFileSync(new URL("../workers/watch/wrangler.jsonc", import.meta.url), "utf8");
  // JSONC の コメントと 末尾の カンマを 落として 読む
  const config = JSON.parse(
    raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1"),
  );
  const kicker = readFileSync(
    new URL("../workers/deploy-kicker/wrangler.jsonc", import.meta.url),
    "utf8",
  );
  // 式の 中にも カンマが ある（"10 9 * * 2,3,5"）ので、引用符で 数える
  const kickerCrons = (kicker.match(/"crons":\s*\[([^\]]*)\]/)?.[1] ?? "").match(/"[^"]+"/g) ?? [];

  it("KV を 使わない（本番の 書き込み 1000件/日 の 枠を 食わない）", () => {
    expect(config.kv_namespaces).toBeUndefined();
    expect(raw).not.toMatch(/kv_namespaces/);
  });

  it("cron は deploy-kicker と 合わせて アカウントの 上限 5本 以内", () => {
    expect(kickerCrons).toHaveLength(3);
    expect(config.triggers.crons.length + kickerCrons.length).toBeLessThanOrEqual(5);
  });

  it("曜日は 名前で 書く（Cloudflare は 1＝日曜で 数字だと 読み違える）", () => {
    for (const cron of config.triggers.crons as string[]) {
      const dow = cron.trim().split(/\s+/)[4];
      expect(dow === "*" || /^[A-Z,]+$/.test(dow!)).toBe(true);
    }
  });

  it("授業（火・水・金 17:30〜19:00 ICT ＝ 10:30〜12:00 UTC）は 5分ごとに 見る", () => {
    const dense = (config.triggers.crons as string[]).find((c) => c.includes("TUE,WED,FRI"))!;
    const [min, hour] = dense.split(/\s+/);
    const minutes = new Set(min!.split(",").map(Number));
    expect(hour).toBe("10,11");
    for (let m = 5; m < 60; m += 10) expect(minutes.has(m)).toBe(true);
    expect(config.triggers.crons).toContain("*/10 * * * *");
  });

  it("状態は Durable Object（SQLite）に 置く", () => {
    expect(config.durable_objects.bindings[0]).toEqual({
      name: "WATCH_STATE",
      class_name: "WatchState",
    });
    expect(config.migrations[0].new_sqlite_classes).toEqual(["WatchState"]);
  });
});
