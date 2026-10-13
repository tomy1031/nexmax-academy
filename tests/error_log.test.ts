import { describe, expect, it } from "vitest";
import {
  CHECK_LABELS,
  CHECK_STALE_MS,
  formatIct,
  kindLabel,
  messageLabel,
  overallLabel,
  probeResultLabel,
  type SiteCheckStatus,
} from "@/lib/error-log";
import { PROBES } from "../workers/watch/src/watch.js";

/*
 * 管理画面「エラーログ」（/admin/logs）の表示の決まり（2026-10-11）。
 */

const NOW = Date.UTC(2026, 9, 11, 11, 40); // 18:40 ICT

const status = (over: Partial<SiteCheckStatus> = {}): SiteCheckStatus => ({
  lastRunAt: new Date(NOW - 5 * 60_000).toISOString(),
  open: {},
  last: { probes: [] },
  muted: null,
  ...over,
});

describe("formatIct — カンボジア時間で出す", () => {
  it("UTC+7 の「月/日 時:分」", () => {
    expect(formatIct(NOW)).toBe("10/11 18:40");
    expect(formatIct(new Date(NOW).toISOString())).toBe("10/11 18:40");
  });

  it("日付をまたぐ", () => {
    expect(formatIct(Date.UTC(2026, 9, 11, 18, 5))).toBe("10/12 01:05");
  });

  it("無い・読めない時刻は —", () => {
    expect(formatIct(null)).toBe("—");
    expect(formatIct("not a date")).toBe("—");
  });
});

describe("overallLabel — 全体の様子", () => {
  it("異常がなければ「正常です」", () => {
    expect(overallLabel(status(), NOW)).toEqual({ tone: "ok", text: "正常です" });
  });

  it("続いている異常の数を出す", () => {
    const s = status({ open: { "page:title": { since: NOW, text: "x" } } });
    expect(overallLabel(s, NOW)).toEqual({ tone: "warn", text: "異常が続いています（1件）" });
  });

  it("自動チェックが止まっていれば、正常とは言わない", () => {
    const s = status({ lastRunAt: new Date(NOW - CHECK_STALE_MS - 60_000).toISOString() });
    expect(overallLabel(s, NOW).tone).toBe("warn");
    expect(overallLabel(s, NOW).text).toContain("止まっています");
  });

  it("まだ一度も動いていない・読めなかった", () => {
    expect(overallLabel(null, NOW).text).toBe("自動チェックはまだ一度も動いていません");
    expect(overallLabel(status({ lastRunAt: null }), NOW).tone).toBe("warn");
  });
});

describe("probeResultLabel", () => {
  it("正常・途中で通った・失敗を見分ける", () => {
    expect(probeResultLabel({ id: "title", code: null, failures: 0 })).toBe("正常");
    expect(probeResultLabel({ id: "title", code: null, failures: 1 })).toBe(
      "正常（1回失敗したあとに通った）",
    );
    expect(probeResultLabel({ id: "title", code: "1102", failures: 3 })).toBe(
      "失敗（Error 1102（Worker の上限を超えた）・3回）",
    );
    expect(probeResultLabel({ id: "title", code: "503", failures: 3 })).toBe(
      "失敗（HTTP 503・3回）",
    );
  });

  it("自動チェックが見る場所には、すべて画面の名前がある", () => {
    for (const probe of PROBES) expect(CHECK_LABELS[probe.id]).toBeTruthy();
  });
});

describe("ブラウザのエラーの行", () => {
  it("種類を画面の言葉に", () => {
    expect(kindLabel("render")).toBe("画面の表示");
    expect(kindLabel("stale")).toBe("部品の読み込み");
    expect(kindLabel(undefined)).toBe("画面の表示");
  });

  it("メッセージが無ければ digest を出す", () => {
    expect(
      messageLabel({
        at: "",
        object: "/",
        result: { name: "TypeError", message: "x is not a function" },
      }),
    ).toBe("TypeError: x is not a function");
    expect(messageLabel({ at: "", object: "/", result: { name: "Error", digest: "123" } })).toBe(
      "（サーバ側のエラー・番号 123）",
    );
    expect(messageLabel({ at: "", object: "/", result: null })).toBe("（メッセージなし）");
  });
});
