import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aiGroupOf,
  clockMinutes,
  decideAiGate,
  effectiveOverride,
  insideSchedule,
  insideWindows,
  parseExceptions,
  parseWindows,
  phnomPenhDate,
  phnomPenhClock,
  phnomPenhMonthStart,
  phnomPenhNextMidnight,
  ruleOpenNow,
  type AiGroupRule,
} from "@/lib/ai/claude-gate";

/**
 * AIチェック（Claude）の 門番（`src/lib/ai/claude-gate.ts`・願い #586）
 *
 * 2026-10-08 の 指定:「火・水・金 17:30〜19:00」「大学、○期生ごとに設定できる。
 * 設定のないものは常時使用不可」。ここが 開く 側に 壊れると **授業の 外でも 費用が 出る**。
 * 閉じる 側に 壊れると **授業中に 使えない**（学習者は 止まらないが、先生は 気づけない）。
 */

/** 2026-10-13（火）の カンボジア時間 hh:mm を UTC の Date に する。 */
function tuesday(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 13, (h ?? 0) - 7, m ?? 0));
}

const CLASS: AiGroupRule = {
  university: "AUPP",
  cohort: 3,
  windows: [{ days: [2, 3, 5], start: "17:30", end: "19:00" }],
  exceptions: [],
  override: "auto",
  overrideUntil: null,
};

const SETTINGS = { stopped: false, monthlyBudgetUsd: 90, dailyUserLimit: 80 };

function gate(overrides: Partial<Parameters<typeof decideAiGate>[0]> = {}) {
  return decideAiGate({
    now: tuesday("18:00"),
    hasKey: true,
    settings: SETTINGS,
    group: { university: "AUPP", cohort: 3 },
    rule: CLASS,
    monthCostUsd: 1,
    userCallsToday: 0,
    ...overrides,
  });
}

describe("関数の 側の 写し", () => {
  it("src と supabase/functions の 門番が 同じ 中身（直したら node scripts/sync_ai_check.mjs）", () => {
    const src = readFileSync("src/lib/ai/claude-gate.ts", "utf-8");
    const copy = readFileSync("supabase/functions/ai-check/claude-gate.ts", "utf-8");
    expect(copy).toBe(src);
  });

  it("門番は import を 持たない（Deno と Next の 両方で そのまま 動く）", () => {
    const src = readFileSync("src/lib/ai/claude-gate.ts", "utf-8");
    expect(src).not.toMatch(/^import /m);
  });
});

describe("カンボジア時間", () => {
  it("UTC+7 で 曜日と 分を 出す", () => {
    expect(phnomPenhClock(tuesday("17:30"))).toEqual({ day: 2, minutes: 17 * 60 + 30 });
    // UTC では 火曜 17:30、カンボジアでは 水曜 0:30
    expect(phnomPenhClock(new Date(Date.UTC(2026, 9, 13, 17, 30)))).toEqual({
      day: 3,
      minutes: 30,
    });
  });

  it("今月の 1日 0時・あしたの 0時", () => {
    // カンボジアの 11月1日 0:30 は UTC では 10月31日 17:30——もう 11月に 数える
    expect(phnomPenhMonthStart(new Date(Date.UTC(2026, 9, 31, 17, 30))).toISOString()).toBe(
      "2026-10-31T17:00:00.000Z",
    );
    expect(phnomPenhNextMidnight(tuesday("18:00")).toISOString()).toBe("2026-10-13T17:00:00.000Z");
  });
});

describe("時間わく", () => {
  it("はじめは 入る・おわりは 入らない", () => {
    expect(insideWindows(CLASS.windows, tuesday("17:29"))).toBe(false);
    expect(insideWindows(CLASS.windows, tuesday("17:30"))).toBe(true);
    expect(insideWindows(CLASS.windows, tuesday("18:59"))).toBe(true);
    expect(insideWindows(CLASS.windows, tuesday("19:00"))).toBe(false);
  });

  it("曜日が ちがえば 入らない（月曜の 18:00）", () => {
    const monday = new Date(tuesday("18:00").getTime() - 24 * 60 * 60_000);
    expect(insideWindows(CLASS.windows, monday)).toBe(false);
  });

  it("崩れた わくは 落とす（開く 側に 倒さない）", () => {
    expect(
      parseWindows([
        { days: [2], start: "19:00", end: "17:30" },
        { days: [], start: "17:30", end: "19:00" },
        { days: [9], start: "17:30", end: "19:00" },
        { days: [2], start: "25:00", end: "26:00" },
        { start: "17:30", end: "19:00" },
        "17:30",
        { days: [5, 2, 2], start: "17:30", end: "19:00" },
      ]),
    ).toEqual([{ days: [2, 5], start: "17:30", end: "19:00" }]);
    expect(parseWindows(null)).toEqual([]);
    expect(clockMinutes("7:05")).toBe(425);
    expect(clockMinutes("24:00")).toBe(1440);
    expect(clockMinutes("24:01")).toBeNull();
  });
});

describe("組", () => {
  it("大学と 期生が そろって いなければ 使えない", () => {
    expect(aiGroupOf({ university: "AUPP", cohort: 3 })).toEqual({ university: "AUPP", cohort: 3 });
    expect(aiGroupOf({ university: "AUPP", cohort: 0 })).toBeNull();
    expect(aiGroupOf({ university: "", cohort: 3 })).toBeNull();
    expect(aiGroupOf({ university: "XYZ", cohort: 3 })).toBeNull();
    expect(aiGroupOf({ university: null, cohort: null })).toBeNull();
  });

  it("講師・スタッフは 期生を 持たない（0 に そろえる）", () => {
    expect(aiGroupOf({ university: "講師・スタッフ", cohort: 4 })).toEqual({
      university: "講師・スタッフ",
      cohort: 0,
    });
  });
});

describe("門番", () => {
  it("授業の 時間は 開く", () => {
    expect(gate()).toEqual({ open: true });
  });

  it("鍵が 無ければ 閉じる（いちばん 先に 見る）", () => {
    expect(gate({ hasKey: false, settings: { ...SETTINGS, stopped: true } })).toEqual({
      open: false,
      reason: "unconfigured",
    });
  });

  it("非常ボタン・組なし・設定なし・時間の 外", () => {
    expect(gate({ settings: { ...SETTINGS, stopped: true } })).toEqual({
      open: false,
      reason: "stopped",
    });
    expect(gate({ group: null })).toEqual({ open: false, reason: "noGroup" });
    expect(gate({ rule: null })).toEqual({ open: false, reason: "noRule" });
    expect(gate({ now: tuesday("19:00") })).toEqual({ open: false, reason: "outside" });
  });

  it("手動の ON は 時間の 外でも 開き、期限を 過ぎたら 時間どおりに もどる", () => {
    const on: AiGroupRule = {
      ...CLASS,
      override: "on",
      overrideUntil: tuesday("21:00").toISOString(),
    };
    expect(gate({ rule: on, now: tuesday("20:00") })).toEqual({ open: true });
    expect(gate({ rule: on, now: tuesday("21:00") })).toEqual({ open: false, reason: "outside" });
    expect(effectiveOverride(on, tuesday("21:00"))).toBe("auto");
  });

  it("手動の OFF は 授業の 時間でも 閉じる", () => {
    const off: AiGroupRule = { ...CLASS, override: "off", overrideUntil: null };
    expect(gate({ rule: off })).toEqual({ open: false, reason: "off" });
    expect(ruleOpenNow(off, tuesday("18:00"))).toBe(false);
  });

  it("月の 上限・1人の 上限", () => {
    expect(gate({ monthCostUsd: 90 })).toEqual({ open: false, reason: "budget" });
    expect(gate({ userCallsToday: 80 })).toEqual({ open: false, reason: "userLimit" });
    expect(gate({ userCallsToday: 79 })).toEqual({ open: true });
  });

  it("期限の 文字が 崩れて いれば 時間どおり", () => {
    expect(
      effectiveOverride({ ...CLASS, override: "on", overrideUntil: "あした" }, tuesday("20:00")),
    ).toBe("auto");
  });
});

describe("日に よって ちがう 時間（2026-10-08 の 指定）", () => {
  it("曜日ごとに ちがう 時間を 持てる（火 17:30〜・水 18:00〜）", () => {
    const rule: AiGroupRule = {
      ...CLASS,
      windows: [
        { days: [2], start: "17:30", end: "19:00" },
        { days: [3], start: "18:00", end: "19:30" },
      ],
    };
    const wednesday = (hhmm: string) => new Date(tuesday(hhmm).getTime() + 24 * 60 * 60_000);
    expect(insideSchedule(rule, tuesday("17:45"))).toBe(true);
    expect(insideSchedule(rule, wednesday("17:45"))).toBe(false);
    expect(insideSchedule(rule, wednesday("19:15"))).toBe(true);
  });

  it("その 日だけ「なし」なら、曜日の 時間でも 閉じる", () => {
    const rule: AiGroupRule = { ...CLASS, exceptions: [{ date: "2026-10-13" }] };
    expect(insideSchedule(rule, tuesday("18:00"))).toBe(false);
    expect(gate({ rule })).toEqual({ open: false, reason: "outside" });
  });

  it("その 日だけ「この 時間」なら、曜日の 時間は 見ない", () => {
    const rule: AiGroupRule = {
      ...CLASS,
      exceptions: [{ date: "2026-10-13", start: "15:00", end: "16:30" }],
    };
    expect(insideSchedule(rule, tuesday("15:30"))).toBe(true);
    expect(insideSchedule(rule, tuesday("18:00"))).toBe(false);
  });

  it("ほかの 日の 例外は 効かない", () => {
    const rule: AiGroupRule = { ...CLASS, exceptions: [{ date: "2026-10-14" }] };
    expect(insideSchedule(rule, tuesday("18:00"))).toBe(true);
  });

  it("カンボジアの 日付で 数える（UTC では まだ 前の 日）", () => {
    // カンボジアの 10/14 0:30 は UTC では 10/13 17:30
    expect(phnomPenhDate(new Date(Date.UTC(2026, 9, 13, 17, 30)))).toBe("2026-10-14");
  });

  it("崩れた 例外は 落とす（時刻が 片方だけ・前後が 逆・日付の 形が ちがう）", () => {
    expect(
      parseExceptions([
        { date: "2026-10-14" },
        { date: "2026-10-15", start: "15:00", end: "16:30" },
        { date: "2026-10-16", start: "15:00" },
        { date: "2026-10-17", start: "18:00", end: "17:00" },
        { date: "10/18" },
        "2026-10-19",
      ]),
    ).toEqual([{ date: "2026-10-14" }, { date: "2026-10-15", start: "15:00", end: "16:30" }]);
    expect(parseExceptions(undefined)).toEqual([]);
  });
});
