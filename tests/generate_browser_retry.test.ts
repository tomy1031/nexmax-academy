import { afterEach, describe, expect, it, vi } from "vitest";
import { generateFromBrowser } from "@/lib/ai/generate-browser";

/**
 * 混んでいるとき（503）だけ 1回 やり直す
 *
 * 2026-08-17 の 本番確認で、同じ 問いを 3回 投げて 2回 503 が 返った（Google 側の
 * 一時的な 混雑）。学習者には 「AIの みかたは いま つかえません」としか 見えず、
 * 自分の 日本語を 疑うことになる。1回だけ 待って やり直す。
 *
 * **粘りすぎない**ことも 同じくらい大事なので、2回目も 駄目なら すぐ 理由を 返す
 * （会話の 途中で 待たせるより、規則ベースの 受け止めに 回すほうがよい）。
 */

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Google の 正常な 返事の形。 */
function answer(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

/** 混雑（503 UNAVAILABLE）。 */
const BUSY = { error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateFromBrowser", () => {
  it("503 のあと 通れば、呼ぶ側には 成功として返る", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, BUSY))
      .mockResolvedValueOnce(reply(200, answer("はい")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFromBrowser({ apiKey: "k", model: "m", prompt: "p" });

    expect(result).toEqual({ ok: true, text: "はい" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("2回とも 503 なら、使いすぎ（quota）と 混ぜずに overloaded を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(503, BUSY));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFromBrowser({ apiKey: "k", model: "m", prompt: "p" });

    expect(result).toEqual({ ok: false, reason: "overloaded" });
    // 粘りすぎない（会話の途中で待たせない）
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("503 以外は やり直さない（429 は やり直すと 悪化する）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(429, {
        error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFromBrowser({ apiKey: "k", model: "m", prompt: "p" });

    expect(result).toEqual({ ok: false, reason: "rateLimited" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("一度で 通れば やり直さない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, answer("こんにちは")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFromBrowser({ apiKey: "k", model: "m", prompt: "p" });

    expect(result).toEqual({ ok: true, text: "こんにちは" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
