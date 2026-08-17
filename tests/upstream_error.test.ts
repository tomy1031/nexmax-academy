import { describe, expect, it } from "vitest";
import { readUpstreamCode, reasonFromCode } from "@/lib/ai/upstream-error";

/**
 * 上流（Google）のエラーから「機械向けの名前」だけを取り出す部分の検査。
 *
 * ここが守るのは2つ:
 *  1. 400 を「キーが違う」と言い切らない（正しいキーでも 400 は返る）
 *  2. 文章もキーも外へ出さない（AGENTS.md 規律4）
 */

/** Google の実際の形（本文は実測の文言をそのまま）。 */
function googleError(status: string, reason?: string, message = "something went wrong") {
  return {
    error: {
      code: 400,
      message,
      status,
      details: reason
        ? [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason,
              domain: "googleapis.com",
              metadata: { service: "generativelanguage.googleapis.com" },
            },
          ]
        : [],
    },
  };
}

describe("readUpstreamCode", () => {
  it("status と reason の記号だけを拾う", () => {
    const body = googleError(
      "INVALID_ARGUMENT",
      "API_KEY_INVALID",
      "API key not valid. Please pass a valid API key.",
    );
    expect(readUpstreamCode(body)).toEqual({
      status: "INVALID_ARGUMENT",
      reason: "API_KEY_INVALID",
    });
  });

  it("文章は 記号の形に ならないので 通らない", () => {
    const body = { error: { status: "API key not valid. Please pass a valid API key." } };
    expect(readUpstreamCode(body).status).toBeNull();
  });

  it("キーが 紛れ込んでも 通らない（小文字と . を含むため）", () => {
    const body = {
      error: { status: "AIzaSyDummyKeyValue123", details: [{ reason: "AQ.Ab8RN6" }] },
    };
    expect(readUpstreamCode(body)).toEqual({ status: null, reason: null });
  });

  it("本文が 読めなくても 落ちない", () => {
    expect(readUpstreamCode(null)).toEqual({ status: null, reason: null });
    expect(readUpstreamCode("<html>502</html>")).toEqual({ status: null, reason: null });
    expect(readUpstreamCode({ error: { details: "not-an-array" } })).toEqual({
      status: null,
      reason: null,
    });
  });
});

describe("reasonFromCode", () => {
  it("キーが 無効だと 名指しされたときだけ badKey", () => {
    expect(
      reasonFromCode(readUpstreamCode(googleError("INVALID_ARGUMENT", "API_KEY_INVALID"))),
    ).toBe("badKey");
  });

  it("場所が 対象外なら locationNotSupported（キーのせいに しない）", () => {
    const body = googleError(
      "FAILED_PRECONDITION",
      undefined,
      "User location is not supported for the API use.",
    );
    expect(reasonFromCode(readUpstreamCode(body))).toBe("locationNotSupported");
  });

  it("期限切れ・制限つき・API未有効を 分けて返す", () => {
    expect(reasonFromCode({ status: null, reason: "API_KEY_EXPIRED" })).toBe("keyExpired");
    expect(reasonFromCode({ status: null, reason: "API_KEY_HTTP_REFERRER_BLOCKED" })).toBe(
      "keyRestricted",
    );
    expect(reasonFromCode({ status: null, reason: "API_KEY_SERVICE_BLOCKED" })).toBe(
      "keyRestricted",
    );
    expect(reasonFromCode({ status: null, reason: "SERVICE_DISABLED" })).toBe("apiDisabled");
  });

  /*
   * 2026-08-17 の実測。AQ. で はじまる 新形式（auth key）を APIキーとして 投げると、
   * 上流は OAuth の トークンだと 解釈して 401 を返す。「権限が 無い」と 言うと
   * 先生は プロジェクトの 設定を 見に行ってしまうので、キーの 形式の 問題だと 分けて言う。
   */
  it("キーの 形式が 受け付けられないときは wrongKeyType（noPermission に 混ぜない）", () => {
    const body = {
      error: {
        code: 401,
        message:
          "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.",
        status: "UNAUTHENTICATED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED",
            metadata: { service: "generativelanguage.googleapis.com" },
          },
        ],
      },
    };
    expect(reasonFromCode(readUpstreamCode(body))).toBe("wrongKeyType");
  });

  it("名前が 読めない 400 は null（呼ぶ側の 受け皿に まわす）", () => {
    expect(reasonFromCode({ status: "INVALID_ARGUMENT", reason: null })).toBeNull();
    expect(reasonFromCode({ status: null, reason: null })).toBeNull();
  });
});
