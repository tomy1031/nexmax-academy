/**
 * AIチェック（Claude）の 門番 — **いま この 人が 使えるか** を 決める 純粋な 関数（願い #586）
 *
 * ## だれが 使うか
 * - AIを 呼ぶ 関数（`supabase/functions/ai-check/`）… 呼ばれる たびに これで 決める。
 *   **この ファイルは 関数の 側に 写しが ある**（`supabase/functions/ai-check/claude-gate.ts`）。
 *   Deno の 関数は `src/` を 読めない ため。2つが 同じ 中身かは
 *   `tests/claude_gate.test.ts` が 見張る——**直したら `node scripts/sync_ai_check.mjs` を 回す**。
 * - 先生の 画面（`/admin/ai-time`）… 組ごとに「いま 使えるか」を 出す。
 *
 * だから **import を 1つも 持たない**（Deno と Next の 両方で そのまま 動く ため）。
 *
 * ## 決まり（2026-10-08 の 指定）
 * - 授業は 火・水・金 17:30〜19:00。**時間は 大学 × 期生ごとに 先生が 決める**
 * - **設定の 無い 組は 常に 使えない**。大学・期生を まだ 選んで いない 人も 使えない
 * - 時刻は **カンボジア時間**（UTC+7・夏時間なし）。生徒の 端末の 時計は 信じない
 * - **日に よって 時間が ちがう ことも ある**（同日の 指定「日によって違う可能性も0ではない
 *   ので、入力に柔軟性を持たせてください」）。だから 2段で 持つ:
 *   1. 曜日ごとの 時間わく（`windows`）… 曜日ごとに ちがう 時間・1日に 何回でも
 *   2. 日付の 例外（`exceptions`）… **その 日だけは 曜日の わくを 使わない**。
 *      「この 日は なし」か「この 日だけ この 時間」
 */

/** 時間わく 1本（カンボジア時間）。 */
export interface AiWindow {
  /** 曜日（0＝日 … 6＝土）。 */
  readonly days: readonly number[];
  /** はじめ（"17:30"）。 */
  readonly start: string;
  /** おわり（"19:00"）。はじめより 後。 */
  readonly end: string;
}

/**
 * 日付の 例外 1つ（カンボジア時間の 日付）。
 * はじめ・おわりが 無ければ「その 日は なし」。ある ときは「その 日だけ この 時間」。
 * 同じ 日付に 何本 置いても よい（その 日に 2回 授業が ある とき）。
 */
export interface AiDateException {
  /** "2026-10-14"。 */
  readonly date: string;
  readonly start?: string;
  readonly end?: string;
}

export type AiOverride = "auto" | "on" | "off";

/** 組（大学 × 期生）ごとの 決まり。`ai_windows` の 1行。 */
export interface AiGroupRule {
  readonly university: string;
  readonly cohort: number;
  readonly windows: readonly AiWindow[];
  /** 日付の 例外。無い 組は 空。 */
  readonly exceptions: readonly AiDateException[];
  readonly override: AiOverride;
  /** 手動の 期限（ISO）。過ぎたら auto に もどる。null は 期限なし。 */
  readonly overrideUntil: string | null;
}

/** 全体の 設定。`ai_settings` の 1行。 */
export interface AiGlobalSettings {
  /** ぜんぶ 止める（非常ボタン）。 */
  readonly stopped: boolean;
  /** 月の 上限（ドル）。 */
  readonly monthlyBudgetUsd: number;
  /** 1人 1日の 回数の 上限。 */
  readonly dailyUserLimit: number;
}

/** 使えない わけ。画面（先生）と 記録で 名前で 言う。 */
export type AiGateClosed =
  "unconfigured" | "stopped" | "noGroup" | "noRule" | "off" | "outside" | "budget" | "userLimit";

export type AiGateResult =
  { readonly open: true } | { readonly open: false; readonly reason: AiGateClosed };

/** 学校ではない 所属（`src/lib/school.ts` の `STAFF_AFFILIATION` と 同じ 値）。 */
export const AI_STAFF_AFFILIATION = "講師・スタッフ";

/** 組に なれる 大学（`src/lib/school.ts` の `AFFILIATIONS` と 同じ 値）。 */
export const AI_GROUP_UNIVERSITIES = ["AUPP", "CADT", AI_STAFF_AFFILIATION] as const;

/** カンボジア時間は UTC+7（夏時間なし）。 */
const PHNOM_PENH_OFFSET_MINUTES = 7 * 60;

/** カンボジア時間の 曜日（0＝日）と、その日の 0時からの 分。 */
export function phnomPenhClock(now: Date): { day: number; minutes: number } {
  const local = new Date(now.getTime() + PHNOM_PENH_OFFSET_MINUTES * 60_000);
  return { day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** カンボジア時間の 日付（"2026-10-14"）。 */
export function phnomPenhDate(now: Date): string {
  const local = new Date(now.getTime() + PHNOM_PENH_OFFSET_MINUTES * 60_000);
  return local.toISOString().slice(0, 10);
}

/** カンボジア時間の 今月の 1日 0時（UTC の 時刻で 返す）。今月の 使用額の 区切り。 */
export function phnomPenhMonthStart(now: Date): Date {
  const local = new Date(now.getTime() + PHNOM_PENH_OFFSET_MINUTES * 60_000);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return new Date(start - PHNOM_PENH_OFFSET_MINUTES * 60_000);
}

/** カンボジア時間の あしたの 0時（UTC の 時刻で 返す）。「きょうは OFF」の 期限。 */
export function phnomPenhNextMidnight(now: Date): Date {
  const local = new Date(now.getTime() + PHNOM_PENH_OFFSET_MINUTES * 60_000);
  const next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return new Date(next - PHNOM_PENH_OFFSET_MINUTES * 60_000);
}

/** "17:30" → 1050。形が ちがえば null。 */
export function clockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

/**
 * DB の `windows`（jsonb）を 読む。**崩れた わくは 落とす**（黙って 開けない）。
 * 開く 側に 倒すと、先生の 打ち間違い 1つで 一日中 費用が 出る。
 */
export function parseWindows(raw: unknown): AiWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: AiWindow[] = [];
  for (const one of raw) {
    if (!one || typeof one !== "object") continue;
    const bag = one as { days?: unknown; start?: unknown; end?: unknown };
    if (typeof bag.start !== "string" || typeof bag.end !== "string") continue;
    const start = clockMinutes(bag.start);
    const end = clockMinutes(bag.end);
    if (start === null || end === null || start >= end) continue;
    const days = Array.isArray(bag.days)
      ? [
          ...new Set(
            bag.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6),
          ),
        ].sort((a, b) => a - b)
      : [];
    if (days.length === 0) continue;
    out.push({ days, start: bag.start.trim(), end: bag.end.trim() });
  }
  return out;
}

/**
 * DB の `exceptions`（jsonb）を 読む。**崩れた ものは 落とす**。
 * 時刻が 片方だけ・はじめ ≧ おわり の ものは 開く 側に 倒さず 捨てる。
 */
export function parseExceptions(raw: unknown): AiDateException[] {
  if (!Array.isArray(raw)) return [];
  const out: AiDateException[] = [];
  for (const one of raw) {
    if (!one || typeof one !== "object") continue;
    const bag = one as { date?: unknown; start?: unknown; end?: unknown };
    if (typeof bag.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bag.date)) continue;
    const hasStart = typeof bag.start === "string" && bag.start.trim() !== "";
    const hasEnd = typeof bag.end === "string" && bag.end.trim() !== "";
    if (!hasStart && !hasEnd) {
      out.push({ date: bag.date });
      continue;
    }
    if (!hasStart || !hasEnd) continue;
    const start = clockMinutes(bag.start as string);
    const end = clockMinutes(bag.end as string);
    if (start === null || end === null || start >= end) continue;
    out.push({
      date: bag.date,
      start: (bag.start as string).trim(),
      end: (bag.end as string).trim(),
    });
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""),
  );
}

/**
 * いま 授業の 時間か（曜日の わく ＋ 日付の 例外）。
 *
 * **その 日に 例外が 1つでも あれば、曜日の わくは 見ない**——「この 日だけ 15:00〜」と
 * 書いたのに いつもの 17:30〜 も 開いて いたら、例外の 意味が 無い。
 * その 日の 例外が「なし」だけなら 一日中 閉じる。
 */
export function insideSchedule(
  rule: Pick<AiGroupRule, "windows" | "exceptions">,
  now: Date,
): boolean {
  const today = phnomPenhDate(now);
  const todays = rule.exceptions.filter((one) => one.date === today);
  if (todays.length === 0) return insideWindows(rule.windows, now);
  const { minutes } = phnomPenhClock(now);
  return todays.some((one) => {
    if (one.start === undefined || one.end === undefined) return false;
    const start = clockMinutes(one.start);
    const end = clockMinutes(one.end);
    return start !== null && end !== null && minutes >= start && minutes < end;
  });
}

/** 時間わくの どれかに 入って いるか（はじめ ≦ いま ＜ おわり）。 */
export function insideWindows(windows: readonly AiWindow[], now: Date): boolean {
  const { day, minutes } = phnomPenhClock(now);
  return windows.some((window) => {
    const start = clockMinutes(window.start);
    const end = clockMinutes(window.end);
    if (start === null || end === null) return false;
    return window.days.includes(day) && minutes >= start && minutes < end;
  });
}

/** 手動が いま 効いて いるか（期限を 過ぎたら auto）。 */
export function effectiveOverride(rule: AiGroupRule, now: Date): AiOverride {
  if (rule.override === "auto") return "auto";
  if (rule.overrideUntil === null) return rule.override;
  const until = Date.parse(rule.overrideUntil);
  if (Number.isNaN(until)) return "auto";
  return now.getTime() < until ? rule.override : "auto";
}

/**
 * プロフィールから 組を 出す。大学・期生が そろって いなければ null（＝使えない）。
 * 講師・スタッフは 期生を 持たない ので 0 に そろえる。
 */
export function aiGroupOf(profile: {
  university?: string | null;
  cohort?: number | null;
}): { university: string; cohort: number } | null {
  const university = profile.university ?? "";
  if (university === AI_STAFF_AFFILIATION) return { university, cohort: 0 };
  if (!(AI_GROUP_UNIVERSITIES as readonly string[]).includes(university)) return null;
  const cohort = profile.cohort ?? 0;
  if (!Number.isInteger(cohort) || cohort < 1 || cohort > 5) return null;
  return { university, cohort };
}

/** 組の 決まりだけで 見た「いま 開いて いるか」（先生の 画面の 札・費用は 見ない）。 */
export function ruleOpenNow(rule: AiGroupRule, now: Date): boolean {
  const override = effectiveOverride(rule, now);
  if (override === "on") return true;
  if (override === "off") return false;
  return insideSchedule(rule, now);
}

/**
 * 門番。**閉じる わけを 先に 見る 順**に 並べて ある
 *（鍵 → 非常ボタン → 組 → 手動 → 時間 → 月の 上限 → 1人の 上限）。
 */
export function decideAiGate(input: {
  now: Date;
  /** 関数に Claude の 鍵が 入って いるか。 */
  hasKey: boolean;
  settings: AiGlobalSettings;
  /** 呼んだ 人の 組（`aiGroupOf`）。 */
  group: { university: string; cohort: number } | null;
  /** その 組の 決まり。行が 無ければ null。 */
  rule: AiGroupRule | null;
  /** 今月（カンボジア時間）の 使用額。 */
  monthCostUsd: number;
  /** その人の きょう（カンボジア時間）の 回数。 */
  userCallsToday: number;
}): AiGateResult {
  if (!input.hasKey) return { open: false, reason: "unconfigured" };
  if (input.settings.stopped) return { open: false, reason: "stopped" };
  if (!input.group) return { open: false, reason: "noGroup" };
  if (!input.rule) return { open: false, reason: "noRule" };
  const override = effectiveOverride(input.rule, input.now);
  if (override === "off") return { open: false, reason: "off" };
  if (override === "auto" && !insideSchedule(input.rule, input.now)) {
    return { open: false, reason: "outside" };
  }
  if (input.monthCostUsd >= input.settings.monthlyBudgetUsd) {
    return { open: false, reason: "budget" };
  }
  if (input.userCallsToday >= input.settings.dailyUserLimit) {
    return { open: false, reason: "userLimit" };
  }
  return { open: true };
}
