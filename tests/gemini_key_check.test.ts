import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adviceFor,
  ALL_KEY_CHECK_REASONS,
  checkGeminiKey,
  KEY_CHECK_ADVICE,
  KEY_CHECK_FURIGANA,
} from "../src/lib/ai/key-check";
import { FORBIDDEN_LEARNER_WORDS } from "../src/content/schema";
import { reasonFromCode } from "../src/lib/ai/upstream-error";
import { uncoveredKanji } from "../src/lib/text/furigana";

/**
 * 学習者の「せつぞくを ためす」（src/lib/ai/key-check.ts）
 *
 *  1. 文言は 全パターンで 裸の 漢字を 残さない（規律2）・見下し語を 含まない（規律1）
 *  2. Google の 返事（名前つきの 失敗）が、そのまま 理由の 名前に なる
 *  3. 空の キーは Google に 聞かない
 */

function googleError(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("文言", () => {
  it("すべての パターンの 漢字が 読み辞書で 覆われている", () => {
    for (const reason of ALL_KEY_CHECK_REASONS) {
      const advice = adviceFor(reason);
      expect({ reason, bare: uncoveredKanji(advice.what, KEY_CHECK_FURIGANA) }).toEqual({
        reason,
        bare: [],
      });
      expect({ reason, bare: uncoveredKanji(advice.next, KEY_CHECK_FURIGANA) }).toEqual({
        reason,
        bare: [],
      });
    }
  });

  it("見下し語を 含まない", () => {
    for (const reason of ALL_KEY_CHECK_REASONS) {
      const advice = adviceFor(reason);
      for (const word of FORBIDDEN_LEARNER_WORDS) {
        expect(advice.what).not.toContain(word);
        expect(advice.next).not.toContain(word);
      }
    }
  });

  it("Google の 名前を 分類した 結果が、ぜんぶ 文言を 持つ（既定の upstream に 落ちない）", () => {
    // 網羅そのものは 型（Record<KeyCheckReason, …>）が 保証する。ここは 実際の 分類器を 通して
    // 「知っている 名前なのに 既定の 文言が 出る」ことが 無いのを 見る。
    const googleReasons = [
      "API_KEY_INVALID",
      "API_KEY_EXPIRED",
      "API_KEY_HTTP_REFERRER_BLOCKED",
      "API_KEY_IP_ADDRESS_BLOCKED",
      "API_KEY_SERVICE_BLOCKED",
      "SERVICE_DISABLED",
      "ACCESS_TOKEN_TYPE_UNSUPPORTED",
    ];
    const googleStatuses = [
      "FAILED_PRECONDITION",
      "PERMISSION_DENIED",
      "UNAUTHENTICATED",
      "RESOURCE_EXHAUSTED",
      "NOT_FOUND",
    ];
    for (const reason of googleReasons) {
      const name = reasonFromCode({ status: null, reason });
      expect(name).not.toBeNull();
      expect(adviceFor(name!)).not.toBe(KEY_CHECK_ADVICE.upstream);
    }
    for (const status of googleStatuses) {
      const name = reasonFromCode({ status, reason: null });
      expect(name).not.toBeNull();
      expect(adviceFor(name!)).not.toBe(KEY_CHECK_ADVICE.upstream);
    }
  });

  it("知らない 名前は upstream に 寄せる", () => {
    expect(adviceFor("somethingNew")).toBe(KEY_CHECK_ADVICE.upstream);
  });
});

describe("checkGeminiKey", () => {
  it("空の キーは Google に 聞かずに noKey（任意の 欄なので しっぱいでは なく 注意）", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkGeminiKey("   ")).toEqual({ level: "warn", reason: "noKey" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("きっぷが 作れたら ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => googleError(200, { name: "auth_tokens/abc" })),
    );
    expect(await checkGeminiKey("AIzaTest")).toEqual({ level: "ok", reason: "ok" });
  });

  it("API_KEY_INVALID は badKey（しっぱい）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        googleError(400, {
          error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] },
        }),
      ),
    );
    expect(await checkGeminiKey("AIzaWrong")).toEqual({ level: "fail", reason: "badKey" });
  });

  it("名前の 無い 400 は tokenRejected（注意。たいわは キーで 直接 つなぐ）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => googleError(400, { error: {} })),
    );
    expect(await checkGeminiKey("AQ.new")).toEqual({ level: "warn", reason: "tokenRejected" });
  });

  it("FAILED_PRECONDITION は locationNotSupported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => googleError(400, { error: { status: "FAILED_PRECONDITION" } })),
    );
    expect(await checkGeminiKey("AIzaTest")).toEqual({
      level: "fail",
      reason: "locationNotSupported",
    });
  });

  it("つながらなければ network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await checkGeminiKey("AIzaTest")).toEqual({ level: "fail", reason: "network" });
  });
});
