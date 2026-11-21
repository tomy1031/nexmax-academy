import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CARRY_MS,
  EGRESS_DAILY_LIMIT_BYTES,
  EGRESS_SQL,
  HEALTH_EVERY_MS,
  RECOVER_QUIET_MS,
  SUPABASE_FREE_EGRESS_BYTES,
  decide,
  egressDue,
  estimateEgressBytes,
  healthDue,
  isClassWindow,
  judge,
  projectRefOf,
  readEgress,
  runWatch,
} from "../workers/watch/src/watch.js";

/*
 * 見張り（workers/watch）が Supabase の 通信量を 食いすぎない こと・食いすぎを 知らせる こと（2026-11-21）。
 *
 * 2026-11-20、見張りが 10分ごとに 叩く 教材の 健康しらべ（/api/health/content）が 1回で
 * studio_contents を 約21回 丸ごと 引いて いて（1回 約190KB）、Supabase の 無料枠（月 5GB）を
 * 超えた。全員が ログインできなく なった。アプリ側は 1回に 畳んだ（tests/supabase_egress_budget.test.ts）。
 * ここでは 見張りの 側を 守る:
 *   - 健康しらべは ふだん 1時間ごと（授業の 日の 16〜20時 ICT と、異常を 見た あとは 毎回）
 *   - wrangler.jsonc の cron の とおりに 1週間 回して、月の 通信量が 予算に 収まる
 *   - Supabase の 通信量を 1日 1回 見積もって、1日 100MB を 超えたら 知らせる
 */

const PROD = "https://academy.nexmax.workers.dev";
const MIN = 60_000;
const HOUR = 60 * MIN;
/** 健康しらべ 1回で 引く 大きさ（2026-11-21 の 公開分 15行 約190KB）。 */
const CONTENTS_BYTES = 194_000;
const MB = 1024 * 1024;

/** ICT（UTC+7）の 年月日時分 → UTC の ミリ秒。 */
const ict = (y: number, mo: number, d: number, h: number, mi = 0) =>
  Date.UTC(y, mo - 1, d, h - 7, mi);

describe("isClassWindow — 授業の 日の 16:00〜19:59 ICT", () => {
  it.each([
    [ict(2026, 11, 24, 16, 0), true, "火 16:00（授業前の 自動反映の 前）"],
    [ict(2026, 11, 24, 15, 59), false, "火 15:59"],
    [ict(2026, 11, 25, 17, 40), true, "水 17:40（授業中）"],
    [ict(2026, 11, 27, 19, 59), true, "金 19:59"],
    [ict(2026, 11, 27, 20, 0), false, "金 20:00"],
    [ict(2026, 11, 23, 17, 40), false, "月 17:40"],
    [ict(2026, 11, 26, 17, 40), false, "木 17:40"],
  ])("%s → %s（%s）", (now, expected) => {
    expect(isClassWindow(now)).toBe(expected);
  });
});

describe("healthDue — 健康しらべを 見に 行くか", () => {
  const quiet = ict(2026, 11, 23, 10, 0); // 月 10:00（授業の 外）

  it("一度も 見て いなければ 見る", () => {
    expect(healthDue(null, quiet)).toBe(true);
  });

  it("授業の 外は 1時間ごと", () => {
    const prev = { healthAt: quiet };
    expect(healthDue(prev, quiet + 10 * MIN)).toBe(false);
    expect(healthDue(prev, quiet + 50 * MIN)).toBe(false);
    expect(healthDue(prev, quiet + HEALTH_EVERY_MS)).toBe(true);
  });

  it("授業の 日の 16〜20時は 毎回", () => {
    const at = ict(2026, 11, 24, 17, 0);
    expect(healthDue({ healthAt: at }, at + 10 * MIN)).toBe(true);
  });

  it("警告・失敗を 見た あとは 毎回（続いたかを 10分で 確かめる）", () => {
    expect(healthDue({ healthAt: quiet, pending: { health: "w" } }, quiet + 10 * MIN)).toBe(true);
    expect(healthDue({ healthAt: quiet, open: { content: {} } }, quiet + 10 * MIN)).toBe(true);
    expect(healthDue({ healthAt: quiet, open: { "page:health": {} } }, quiet + 10 * MIN)).toBe(
      true,
    );
    expect(healthDue({ healthAt: quiet, recentFail: { health: quiet } }, quiet + 10 * MIN)).toBe(
      true,
    );
    // 失敗が 古く なれば（続かなかった）、ふだんの 1時間ごとに 戻る
    expect(
      healthDue({ healthAt: quiet, recentFail: { health: quiet } }, quiet + CARRY_MS + 10 * MIN),
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 1週間 回して 数える（wrangler.jsonc の cron の とおり）
 * ------------------------------------------------------------------ */

const raw = readFileSync(new URL("../workers/watch/wrangler.jsonc", import.meta.url), "utf8");
const crons: string[] = JSON.parse(
  raw
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,(\s*[}\]])/g, "$1"),
).triggers.crons;

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
/** cron の 1つの 欄が 値を 含むか（* ・ * /n ・ カンマ区切り ・ 曜日の 名前）。 */
function fieldHas(field: string, value: number, names?: string[]): boolean {
  if (field === "*") return true;
  const step = /^\*\/(\d+)$/.exec(field);
  if (step) return value % Number(step[1]) === 0;
  return field.split(",").some((part) => {
    const n = names?.indexOf(part) ?? -1;
    return (n >= 0 ? n : Number(part)) === value;
  });
}
/** その 分（UTC）に どれかの cron が 当たるか。 */
function cronFires(t: number): boolean {
  const d = new Date(t);
  return crons.some((c) => {
    const [mi, h, dom, mon, dow] = c.trim().split(/\s+/) as [
      string,
      string,
      string,
      string,
      string,
    ];
    return (
      fieldHas(mi, d.getUTCMinutes()) &&
      fieldHas(h, d.getUTCHours()) &&
      fieldHas(dom, d.getUTCDate()) &&
      fieldHas(mon, d.getUTCMonth() + 1) &&
      fieldHas(dow, d.getUTCDay(), DOW)
    );
  });
}

const OK: Record<string, () => Response> = {
  "/": () => new Response("<html>"),
  "/map": () => new Response(null, { status: 307 }),
  "/api/health/content": () =>
    Response.json({
      sha: "x",
      stages: [],
      wordStages: [],
      warnings: [],
      db: { fetches: 1, rows: 15, bytes: CONTENTS_BYTES },
    }),
};

/** 見張りを 期間の あいだ cron の とおりに 回し、日ごとに 健康しらべの 回数を 数える（ICT の 日付）。 */
async function simulate(from: number, days: number) {
  let state: unknown = null;
  let now = from;
  const perDay = new Map<string, number>();
  const deps = {
    fetch: async (url: string) => {
      throw new Error(`見張りが 外へ 出た: ${url}`);
    },
    probeFetch: async (url: string) => {
      const path = url.slice(PROD.length);
      if (path === "/api/health/content") {
        const day = new Date(now + 7 * HOUR).toISOString().slice(0, 10);
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
      }
      return OK[path]!();
    },
    sleep: async () => {},
    now: () => now,
    loadState: async () => state,
    saveState: async (s: unknown) => void (state = s),
    log: () => {},
  };
  for (; now < from + days * 24 * HOUR; now += MIN) {
    if (cronFires(now)) await runWatch({ PROD_URL: PROD }, deps);
  }
  return perDay;
}

describe("1週間 回した 健康しらべの 回数と 通信量（cron の とおり）", () => {
  // 2026-11-23（月）0:00 ICT から 7日。火・水・金が 授業
  const week = simulate(ict(2026, 11, 23, 0, 0), 7);

  it("授業の 日は 60回 以下・ほかの 日は 26回 以下（直す 前は 毎日 144〜168回）", async () => {
    const perDay = await week;
    for (const [day, n] of perDay) {
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      expect(n, day).toBeLessThanOrEqual([2, 3, 5].includes(dow) ? 60 : 26);
    }
    expect(perDay.size).toBe(7);
  });

  it("月の 通信量は 300MB 以下（無料枠 5GB の 6%）。直す 前は 約17GB", async () => {
    const perDay = await week;
    const weekCalls = [...perDay.values()].reduce((a, b) => a + b, 0);
    const monthBytes = (weekCalls / 7) * 30 * CONTENTS_BYTES;
    expect(monthBytes).toBeLessThanOrEqual(300 * MB);
    // 直す 前: 1日 144回（10分ごと）＋授業の 日 12回 × 21回 引く
    const before = ((144 * 7 + 12 * 3) / 7) * 30 * 21 * CONTENTS_BYTES;
    expect(before).toBeGreaterThan(SUPABASE_FREE_EGRESS_BYTES * 3);
  });
});

/* ------------------------------------------------------------------ *
 * 見なかった 回は 前の 異常を 残す
 * ------------------------------------------------------------------ */

describe("健康しらべを 見なかった 回", () => {
  const t = ict(2026, 11, 23, 10, 0);
  const pages = [
    { id: "title", failures: 0, attempts: 1, code: null, lastFailCode: null, body: null },
    { id: "gate", failures: 0, attempts: 1, code: null, lastFailCode: null, body: null },
  ];

  it("開いて いる 異常（教材の 警告・健康しらべの 失敗）を 閉じない", () => {
    const prev = {
      startedAt: t - 10 * HOUR,
      open: {
        content: { since: t - HOUR, notifiedAt: t - HOUR, text: "警告", quietSince: null },
        "page:health": { since: t - HOUR, notifiedAt: t - HOUR, text: "503", quietSince: null },
      },
      pending: { health: "w" },
      recentFail: { health: t - 10 * MIN },
    };
    // 2時間 見なくても（本当は healthDue が 毎回 見に 行く が）、閉じない
    const judged = judge(prev, pages, null, t + 2 * HOUR);
    expect(judged.findings.map((f: { key: string; level: string }) => [f.key, f.level])).toEqual([
      ["content", "keep"],
      ["page:health", "keep"],
    ]);
    expect(judged.pending.health).toBe("w");
    expect(judged.recentFail.health).toBe(t - 10 * MIN);
    const { messages, next } = decide(prev, judged, t + 2 * HOUR, PROD);
    expect(Object.keys(next.open).sort()).toEqual(["content", "page:health"]);
    expect(messages.filter((m: { kind: string }) => m.kind === "recovered")).toEqual([]);
  });
});

describe("健康しらべ 1回で DB を 何回 引いたか", () => {
  const t = ict(2026, 11, 23, 10, 0);
  const health = (fetches: number) => ({
    id: "health",
    failures: 0,
    attempts: 1,
    code: null,
    lastFailCode: null,
    body: { warnings: [], db: { fetches, rows: 15, bytes: CONTENTS_BYTES } },
  });

  it("1回なら 何も 出さない。古い 版（db が 無い）も 出さない", () => {
    expect(judge(null, [health(1)], null, t).findings).toEqual([]);
    expect(judge(null, [{ ...health(1), body: { warnings: [] } }], null, t).findings).toEqual([]);
  });

  it("2回 続けて 多ければ 知らせる（21回 ＝ 直す 前の 健康しらべ）", () => {
    const first = judge(null, [health(21)], null, t);
    expect(first.findings[0]).toMatchObject({ key: "health-db", level: "suspect" });
    const second = judge({ pending: first.pending }, [health(21)], null, t + 10 * MIN);
    expect(second.findings[0]).toMatchObject({ key: "health-db", level: "confirmed" });
    expect(second.findings[0]!.text).toContain("21回");
  });
});

/* ------------------------------------------------------------------ *
 * Supabase の 通信量の 見張り（1日 1回）
 * ------------------------------------------------------------------ */

describe("通信量の 見積もり", () => {
  it("2026-11-19 の 実績（教材の 丸ごと読み出し 3063回・ほか 210回）は 1日 100MB を 大きく 超える", () => {
    const bytes = estimateEgressBytes({ contents: 3063, other: 210 }, CONTENTS_BYTES);
    expect(bytes).toBeGreaterThan(500 * MB);
    expect(bytes).toBeGreaterThan(EGRESS_DAILY_LIMIT_BYTES);
  });

  it("直した あとの 授業の 日（見張り 56回＋画面と ビルド 約300回）は 100MB に 収まる", () => {
    expect(estimateEgressBytes({ contents: 356, other: 2600 }, CONTENTS_BYTES)).toBeLessThan(
      EGRESS_DAILY_LIMIT_BYTES,
    );
  });

  it("1日 100MB は 月 3GB の 速さ（無料枠の 6割）", () => {
    expect((EGRESS_DAILY_LIMIT_BYTES * 30) / SUPABASE_FREE_EGRESS_BYTES).toBeCloseTo(0.59, 1);
  });

  it("超えたら 1回で 知らせる（24時間の 合計なので）。文に 月の 見込みと 無料枠を 書く", () => {
    const t = ict(2026, 11, 23, 9, 0);
    const judged = judge(null, [], null, t, {
      egress: { contents: 3063, other: 210 },
      contentsBytes: CONTENTS_BYTES,
    });
    const f = judged.findings.find((x: { key: string }) => x.key === "egress")!;
    expect(f).toMatchObject({ level: "confirmed" });
    expect(f.text).toContain("この24時間で約");
    expect(f.text).toContain("無料枠は月5.0GB");
    expect(f.text).toContain("3063回");
  });

  it("下回れば 何も 出さない。見なかった 回は 開いて いる 知らせを 残す", () => {
    const t = ict(2026, 11, 23, 9, 0);
    expect(
      judge(null, [], null, t, { egress: { contents: 100, other: 100 }, contentsBytes: 1 })
        .findings,
    ).toEqual([]);
    const prev = { open: { egress: { since: t, notifiedAt: t, text: "多い", quietSince: null } } };
    expect(judge(prev, [], null, t + 10 * MIN, { egress: { skipped: true } }).findings).toEqual([
      { key: "egress", level: "keep", text: "多い" },
    ]);
  });
});

describe("egressDue — 1日 1回（朝 9時 ICT を 過ぎた 最初の 回）", () => {
  const morning = ict(2026, 11, 23, 9, 0);
  it("正常なら 翌朝まで 見ない。知らせた あと・測れなかった あとは 1時間ごと", () => {
    expect(egressDue(null, false, morning)).toBe(true);
    const last = { at: morning };
    expect(egressDue(last, false, morning + 10 * MIN)).toBe(false);
    expect(egressDue(last, false, morning + 23 * HOUR)).toBe(false); // 翌 8:00
    expect(egressDue(last, false, morning + 24 * HOUR)).toBe(true); // 翌 9:00
    expect(egressDue(last, true, morning + 50 * MIN)).toBe(false);
    expect(egressDue(last, true, morning + HOUR)).toBe(true);
    expect(egressDue({ at: morning, failed: "HTTP 401" }, false, morning + HOUR)).toBe(true);
  });
});

describe("readEgress — Supabase の 管理用 API で この24時間を 数える", () => {
  const env = {
    SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_ACCESS_TOKEN: "sbp_test",
  };
  const now = Date.UTC(2026, 10, 23, 2, 0);

  it("URL の ref・鍵・SQL・24時間の 窓で 呼ぶ", async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const r = await readEgress(
      env,
      async (url: string, init?: RequestInit) => {
        seen = { url, auth: new Headers(init?.headers).get("authorization") };
        return Response.json({ result: [{ contents: 3063, other: 210 }] });
      },
      now,
    );
    expect(r).toEqual({ contents: 3063, other: 210 });
    const url = new URL(seen!.url);
    expect(url.origin + url.pathname).toBe(
      "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/analytics/endpoints/logs.all",
    );
    expect(url.searchParams.get("sql")).toBe(EGRESS_SQL);
    expect(url.searchParams.get("iso_timestamp_start")).toBe("2026-11-22T02:00:00.000Z");
    expect(url.searchParams.get("iso_timestamp_end")).toBe("2026-11-23T02:00:00.000Z");
    expect(seen!.auth).toBe("Bearer sbp_test");
  });

  it("鍵が 無ければ 呼ばない", async () => {
    const r = await readEgress(
      { SUPABASE_URL: env.SUPABASE_URL },
      async () => {
        throw new Error("呼んだ");
      },
      now,
    );
    expect(r).toEqual({ skipped: true });
  });

  it("断られた・形が おかしい ときは 測れなかった と 返す", async () => {
    expect(await readEgress(env, async () => new Response("no", { status: 401 }), now)).toEqual({
      failed: "HTTP 401",
    });
    expect(await readEgress(env, async () => Response.json({ result: [] }), now)).toEqual({
      failed: "bad-json",
    });
  });

  it("ref は 秘密の URL から 読む（リポジトリに 書かない）", () => {
    expect(projectRefOf("https://abcdefghijklmnopqrst.supabase.co/")).toBe("abcdefghijklmnopqrst");
    expect(projectRefOf("https://example.com")).toBeNull();
    expect(projectRefOf(undefined)).toBeNull();
  });
});

describe("runWatch の 通し: 通信量が 多ければ 1通 知らせ、下がって 1時間で「直りました」", () => {
  it("鍵が あれば 朝 9時に 見積もり、多ければ 知らせる", async () => {
    let state: unknown = null;
    let counts = { contents: 3063, other: 210 };
    const sent: string[] = [];
    let now = ict(2026, 11, 23, 9, 0);
    const deps = {
      fetch: async (url: string, init?: RequestInit) => {
        if (url.startsWith("https://api.supabase.com/")) return Response.json({ result: [counts] });
        if (url.startsWith("https://hooks.slack.test/")) {
          sent.push(JSON.parse(String(init?.body)).text);
          return new Response("ok");
        }
        throw new Error(`想定外: ${url}`);
      },
      probeFetch: async (url: string) => OK[url.slice(PROD.length)]!(),
      sleep: async () => {},
      now: () => now,
      loadState: async () => state,
      saveState: async (s: unknown) => void (state = s),
      log: () => {},
    };
    const env = {
      PROD_URL: PROD,
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_ACCESS_TOKEN: "sbp_test",
      SLACK_WEBHOOK_URL: "https://hooks.slack.test/x",
    };

    await runWatch(env, deps); // はじめました（その中に 通信量の 異常）
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Supabase の通信量が多い");
    expect((state as { egress: { bytes: number } }).egress.bytes).toBe(
      estimateEgressBytes(counts, CONTENTS_BYTES),
    );

    counts = { contents: 300, other: 2000 }; // 直した
    for (let i = 0; i < 6; i++) {
      now += 10 * MIN;
      await runWatch(env, deps);
    }
    // 10:00 に 見直して 正常。まだ 閉じない（1時間 正常が 続く まで）
    expect(sent).toHaveLength(1);
    for (let i = 0; i < 6; i++) {
      now += 10 * MIN;
      await runWatch(env, deps);
    }
    expect(now - ict(2026, 11, 23, 10, 0)).toBeGreaterThanOrEqual(RECOVER_QUIET_MS);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain("✅ 直りました");
    expect(sent[1]).toContain("Supabase の通信量");
  });
});
