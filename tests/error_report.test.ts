import { describe, expect, it } from "vitest";
import {
  DEVICE_HOURLY_CAP,
  REPORT_MARK,
  SAME_ERROR_GAP_MS,
  buildClientErrorEvent,
  errorFingerprint,
  reportClientError,
  sanitizeErrorText,
  sanitizePath,
  takeReportTicket,
  type ReportDeps,
} from "@/lib/error-report";

/*
 * 画面の エラーを events 表へ 送る（2026-10-11・本番の 見張り）。
 * 守る こと: だれか・鍵を 送らない／同じ エラーを 何度も 送らない／送れなくても 落ちない。
 */

function fakeStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

const CONFIG = { url: "https://example.supabase.co/", anonKey: "anon-public-key" };

function deps(over: Partial<ReportDeps> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const d: ReportDeps = {
    config: CONFIG,
    pathname: "/houkoku/manga",
    loggedIn: true,
    build: "f96a3f03415f4812183ce9199731f56fb4e862aa",
    store: fakeStore(),
    now: 1_000_000_000_000,
    send: async (url, init) => void calls.push({ url, init }),
    ...over,
  };
  return { d, calls };
}

describe("sanitizeErrorText — 人や 鍵に つながる ものを 伏せる", () => {
  it("メール・UUID・JWT・長い 数字・URL の クエリを 伏せる", () => {
    const text = sanitizeErrorText(
      "user taro.yamada+1@example.com id 3f1c2b9a-1234-4cde-8f00-0123456789ab " +
        "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc phone 0123456789 " +
        "at https://academy.nexmax.workers.dev/auth/callback?code=secret#frag",
    );
    expect(text).not.toMatch(/taro|3f1c2b9a|eyJ|0123456789|secret|frag/);
    expect(text).toContain("<email>");
    expect(text).toContain("<id>");
    expect(text).toContain("<token>");
    expect(text).toContain("<num>");
    expect(text).toContain("https://academy.nexmax.workers.dev/auth/callback");
  });

  it("相対の 道の クエリも 落とす（名前や 短い 数字が 残らない）", () => {
    expect(sanitizeErrorText("failed /auth/callback?next=%2Fmap&name=Sokha&n=12345 here")).toBe(
      "failed /auth/callback here",
    );
  });

  it("英数の 長い 鍵（API キーの 形）を 伏せる", () => {
    expect(sanitizeErrorText("key AIzaSyA1b2C3d4E5f6G7h8I9j0KLMNOPqrstu used")).toBe(
      "key <token> used",
    );
  });

  it("ふつうの エラー文は 読める まま 残す（原因が 見えなく ならない ように）", () => {
    expect(sanitizeErrorText("Cannot read properties of undefined (reading 'map')")).toBe(
      "Cannot read properties of undefined (reading 'map')",
    );
  });

  it("長すぎる 文は 切る", () => {
    expect(sanitizeErrorText("あ".repeat(1000))).toHaveLength(300);
  });
});

describe("sanitizePath — 道だけ 送る", () => {
  it("クエリと # を 落とす（?code= が 乗る ため）", () => {
    expect(sanitizePath("/?error=auth&code=abc")).toBe("/");
    expect(sanitizePath("/houkoku/manga#top")).toBe("/houkoku/manga");
  });

  it("空白は 残さない（DB が 受け取らない 形に しない）", () => {
    expect(sanitizePath("/a b/c")).toBe("/a_b/c");
  });

  it("道の 中の id らしい ものは 伏せる", () => {
    expect(sanitizePath("/admin/records/3f1c2b9a-1234-4cde-8f00-0123456789ab")).toBe(
      "/admin/records/<id>",
    );
  });
});

describe("buildClientErrorEvent — 送る 形", () => {
  it("ページ・メッセージ・digest・ログインの 有無・ビルドだけ。だれかは 入れない", () => {
    const error = Object.assign(new TypeError("x is not a function"), { digest: "123" });
    const event = buildClientErrorEvent(error, {
      pathname: "/map",
      loggedIn: false,
      kind: "render",
      build: "f96a3f03415f4812183ce9199731f56fb4e862aa",
    });
    expect(event).toEqual({
      verb: "client_error",
      object: "/map",
      result: {
        kind: "render",
        name: "TypeError",
        message: "x is not a function",
        digest: "123",
        logged_in: false,
        build: "f96a3f03415f",
      },
    });
    expect(Object.keys(event)).not.toContain("user_id");
  });

  it("Error でない ものが 投げられても 形を 保つ", () => {
    const event = buildClientErrorEvent("boom", {
      pathname: "/",
      loggedIn: true,
      kind: "render",
      build: null,
    });
    expect(event.result).toMatchObject({ name: "Error", message: "boom", digest: null });
  });

  it("DB の ふた（2048 バイト）に 収まる", () => {
    const event = buildClientErrorEvent(new Error("あ".repeat(5000)), {
      pathname: `/${"a".repeat(500)}`,
      loggedIn: true,
      kind: "render",
      build: "x".repeat(100),
    });
    expect(new TextEncoder().encode(JSON.stringify(event.result)).length).toBeLessThanOrEqual(2048);
    expect(event.object.length).toBeLessThanOrEqual(200);
  });
});

describe("takeReportTicket — 端末ごとの 間引き（30人 同時でも 増えすぎない）", () => {
  const now = 1_000_000_000_000;

  it("同じ エラーは 30分に 1回だけ", () => {
    const store = fakeStore();
    expect(takeReportTicket(store, "a", now)).toBe(true);
    expect(takeReportTicket(store, "a", now + 60_000)).toBe(false);
    expect(takeReportTicket(store, "a", now + SAME_ERROR_GAP_MS)).toBe(true);
  });

  it("ちがう エラーでも 1時間に 5回まで", () => {
    const store = fakeStore();
    for (let i = 0; i < DEVICE_HOURLY_CAP; i++) {
      expect(takeReportTicket(store, `e${i}`, now + i)).toBe(true);
    }
    expect(takeReportTicket(store, "another", now + 10)).toBe(false);
    expect(takeReportTicket(store, "another", now + 60 * 60_000 + 10)).toBe(true);
  });

  it("壊れた 記録が 入って いても 落ちずに やり直す", () => {
    const store = fakeStore();
    store.setItem(REPORT_MARK, "{not json");
    expect(takeReportTicket(store, "a", now)).toBe(true);
  });

  it("記録を 書けない ときは 送らない（送りすぎる より まし）", () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(takeReportTicket(store, "a", now)).toBe(false);
  });

  it("古い 印は 捨てる（置き場所を 太らせない）", () => {
    const store = fakeStore();
    takeReportTicket(store, "old", now);
    takeReportTicket(store, "new", now + SAME_ERROR_GAP_MS + 1);
    const saved = JSON.parse(store.map.get(REPORT_MARK) ?? "{}");
    expect(Object.keys(saved.last)).toEqual(["new"]);
  });
});

describe("errorFingerprint", () => {
  it("番号だけ ちがう エラーは 同じと みなす（chunk 番号など）", () => {
    const ctx = { pathname: "/map", loggedIn: true, kind: "render" as const, build: null };
    const a = buildClientErrorEvent(new Error("Loading chunk 12 failed"), ctx);
    const b = buildClientErrorEvent(new Error("Loading chunk 345 failed"), ctx);
    expect(errorFingerprint(a)).toBe(errorFingerprint(b));
  });
});

describe("reportClientError — 送りかた", () => {
  it("anon の 鍵で events へ 1行。ユーザーの JWT は 付けない", () => {
    const { d, calls } = deps();
    expect(reportClientError(new Error("boom"), "render", d)).toBe(true);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://example.supabase.co/rest/v1/events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({
      apikey: "anon-public-key",
      Authorization: "Bearer anon-public-key",
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      verb: "client_error",
      object: "/houkoku/manga",
      result: { kind: "render", message: "boom", logged_in: true },
    });
  });

  it("同じ エラーが 続けて 来ても 1回だけ 送る", () => {
    const { d, calls } = deps();
    reportClientError(new Error("boom"), "render", d);
    reportClientError(new Error("boom"), "render", { ...d, now: d.now + 1000 });
    expect(calls).toHaveLength(1);
  });

  it("Supabase が 未設定（鍵ゼロの デモモード・e2e）なら 送らない", () => {
    const { d, calls } = deps({ config: null });
    expect(reportClientError(new Error("boom"), "render", d)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("送れなくても 例外を 外へ 出さない（落ちた 画面を さらに 落とさない）", async () => {
    const { d } = deps({
      send: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    expect(() => reportClientError(new Error("boom"), "render", d)).not.toThrow();
    const thrower = deps({
      send: () => {
        throw new TypeError("sync");
      },
    });
    expect(reportClientError(new Error("boom"), "render", thrower.d)).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
  });

  it("ブラウザの 外（node）で 呼ばれても 落ちない", () => {
    expect(reportClientError(new Error("boom"))).toBe(false);
  });
});
