import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../workers/deploy-kicker/src/index.js";

/*
 * 授業前の 本番デプロイを 起こす 外の 時計（workers/deploy-kicker・docs/deploy.md §0.15）。
 *
 * 2026-10-16（金）は 授業前に 1回も 起きなかった。原因は 3つ:
 *   1. Cloudflare の 曜日の 数字は 1＝日曜。"2,3,5" が 月・火・木に なり、水・金は 0回
 *   2. 起きた 日（10-12・10-13）も、鍵に 起こす 権限が 無く GitHub に 断られて いた
 *   3. Mac の launchd が 2時間 早く（14:10 ICT）動き、教材が 入る 前に「同じ」で 止まって いた
 * 3つの 時計（Cloudflare・Mac・GitHub）が 同じ 時刻を 指して いるかを ここで 見る。
 */

const root = new URL("../workers/deploy-kicker/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

const crons = (read("wrangler.jsonc").match(/"crons":\s*\[([^\]]*)\]/)?.[1] ?? "")
  .match(/"[^"]+"/g)!
  .map((c) => c.slice(1, -1));

/** cron の 分・時（UTC）。 */
const times = crons.map((c) => {
  const [min, hour] = c.split(/\s+/);
  return { hour: Number(hour), min: Number(min) };
});

describe("Cloudflare の Cron Trigger", () => {
  it("曜日は 名前で 書く（数字だと 1＝日曜で 1日 ずれる）", () => {
    expect(crons).toHaveLength(3);
    for (const cron of crons) expect(cron.split(/\s+/)[4]).toBe("TUE,WED,FRI");
  });

  it("16:10 / 16:52 / 17:02 ICT（＝ 09:10 / 09:52 / 10:02 UTC）に 起きる", () => {
    expect(times).toEqual([
      { hour: 9, min: 10 },
      { hour: 9, min: 52 },
      { hour: 10, min: 2 },
    ]);
  });
});

describe("Mac の 起こし役（launchd）", () => {
  const script = fileURLToPath(new URL("mac/nexmax-deploy-kick.sh", root));
  const plist = read("mac/dev.nexmax.academy.deploy-kick.plist");
  const fakeBin = mkdtempSync(join(tmpdir(), "kick-date-"));

  /** `date -u '+%u %H %M'` の 答えを 差しかえて、窓の 中か（終了コード 0）を 聞く。 */
  function inWindow(dow: number, hour: number, min: number) {
    const answer = `${dow} ${String(hour).padStart(2, "0")} ${String(min).padStart(2, "0")}`;
    writeFileSync(join(fakeBin, "date"), `#!/bin/sh\necho "${answer}"\n`);
    chmodSync(join(fakeBin, "date"), 0o755);
    const run = spawnSync("sh", [script, "--check-window"], {
      env: { ...process.env, PATH: `${fakeBin}:/usr/bin:/bin` },
      encoding: "utf8",
    });
    expect(run.stderr).toBe("");
    return run.status === 0;
  }

  it("plist は 分だけを 書く（曜日・時を 書くと Mac の 地域の 時刻で ずれる）", () => {
    const calendar = plist.match(
      /<key>StartCalendarInterval<\/key>\s*<array>([\s\S]*?)<\/array>/,
    )![1]!;
    expect(calendar).not.toMatch(/Weekday|Hour/);
    const minutes = [...calendar.matchAll(/<integer>(\d+)<\/integer>/g)].map((m) => Number(m[1]));
    for (const { min } of times) expect(minutes).toContain(min);
  });

  it("Cloudflare と 同じ 時刻は、火・水・金だけ 窓の 中", () => {
    for (const { hour, min } of times) {
      for (const dow of [2, 3, 5]) expect(inWindow(dow, hour, min)).toBe(true);
      for (const dow of [1, 4, 6, 7]) expect(inWindow(dow, hour, min)).toBe(false);
    }
  });

  it("窓は 16:05〜17:10 ICT。2時間 早い 14:10 ICT や 授業の 直前には 起こさない", () => {
    expect(inWindow(5, 9, 4)).toBe(false);
    expect(inWindow(5, 9, 5)).toBe(true);
    expect(inWindow(5, 10, 10)).toBe(true);
    expect(inWindow(5, 10, 11)).toBe(false);
    expect(inWindow(5, 7, 10)).toBe(false); // 2026-10-16 に 動いて いた 14:10 ICT
    expect(inWindow(5, 0, 0)).toBe(false);
  });
});

describe("Worker の 中身", () => {
  const env = {
    GITHUB_TOKEN: "test-token",
    GITHUB_REPO: "tomy1031/nexmax-academy",
    WORKFLOW: "deploy.yml",
    PROD_URL: "https://academy.nexmax.workers.dev",
    PROD: {
      fetch: async () => Response.json({ sha: "prod-sha", builtAt: "2026-10-14T15:10:00Z" }),
    },
  };

  type Call = { url: string; body?: { ref: string; inputs?: Record<string, string> } };

  /** GitHub の 偽物。integration の 版と、dispatch への 返事（番号）を 決める。 */
  function fakeGitHub(integrationSha: string, dispatchStatus: (ref: string) => number) {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      if (url.endsWith("/commits/integration")) return Response.json({ sha: integrationSha });
      if (url.endsWith("/dispatches"))
        return new Response(null, { status: dispatchStatus(body.ref) });
      throw new Error(`知らない 宛先: ${url}`);
    });
    return calls;
  }

  const dispatches = (calls: Call[]) => calls.filter((c) => c.url.endsWith("/dispatches"));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("状態の ページは、起こせる 鍵なら canDispatch.ok が true（ランは 作らない ref で 試す）", async () => {
    const calls = fakeGitHub("int-sha", (ref) => (ref === "main" ? 204 : 422));
    const res = await handler.fetch(new Request("https://kicker.test/"), env);
    const json = await res.json();
    expect(json.canDispatch).toEqual({ ok: true, status: 422 });
    const [probe] = dispatches(calls);
    expect(dispatches(calls)).toHaveLength(1);
    expect(probe!.body!.ref).not.toBe("main");
    // `..` を 含む 名前は git の ブランチに できない＝ 試しで デプロイが 起きる ことは ない
    expect(probe!.body!.ref).toContain("..");
  });

  it("起こす 権限が 無い 鍵（403）は、何を 直すかを 出す", async () => {
    fakeGitHub("int-sha", () => 403);
    const json = await (await handler.fetch(new Request("https://kicker.test/"), env)).json();
    expect(json.canDispatch.ok).toBe(false);
    expect(json.canDispatch.status).toBe(403);
    expect(json.canDispatch.reason).toContain("Actions: Read and write");
  });

  it("鍵が 無ければ GitHub に 頼まずに false", async () => {
    const calls = fakeGitHub("int-sha", () => 422);
    const json = await (
      await handler.fetch(new Request("https://kicker.test/"), { ...env, GITHUB_TOKEN: "" })
    ).json();
    expect(json.canDispatch.ok).toBe(false);
    expect(dispatches(calls)).toHaveLength(0);
  });

  async function runCron() {
    let job: Promise<unknown> = Promise.resolve();
    await handler.scheduled({ cron: "10 9 * * TUE,WED,FRI" }, env, {
      waitUntil: (p: Promise<unknown>) => {
        job = p;
      },
    });
    return job;
  }

  it("本番が integration と ちがえば、main で target=auto を 1回 起こす", async () => {
    const calls = fakeGitHub("int-sha", () => 204);
    await runCron();
    expect(dispatches(calls).map((c) => c.body)).toEqual([
      { ref: "main", inputs: { target: "auto" } },
    ]);
  });

  it("本番が integration と 同じなら 起こさない", async () => {
    const calls = fakeGitHub("prod-sha", () => 204);
    await runCron();
    expect(dispatches(calls)).toHaveLength(0);
  });

  it("断られたら、番号と 直しかたを 例外に 書く（Cloudflare の 記録に 残る）", async () => {
    fakeGitHub("int-sha", () => 403);
    await expect(runCron()).rejects.toThrow(/403 .*Actions: Read and write/);
  });
});
