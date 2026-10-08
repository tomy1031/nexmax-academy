import { createClient } from "@/lib/supabase/client";
import { requireOwnId } from "@/lib/supabase/claims";
import {
  parseExceptions,
  parseWindows,
  type AiDateException,
  type AiGlobalSettings,
  type AiGroupRule,
  type AiOverride,
  type AiWindow,
} from "@/lib/ai/claude-gate";

/**
 * AIの 時間（先生の 画面 `/admin/ai-time`）の 読み書き（願い #586）
 *
 * 表は `ai_settings`（全体 1行）・`ai_windows`（組ごと）・`ai_usage`（1回 1行）。
 * 読むのも 書くのも **先生だけ**（RLS）。ブラウザから Supabase を 直に 見る——
 * Worker に 仕事を させない（constraints 2026-08-26）。
 *
 * **本番も STG も 同じ DB** を 見るので、ここで 変えた 設定は 両方に 同時に 効く。
 */

export interface AiSettingsRow extends AiGlobalSettings {
  readonly model: string;
  readonly updatedAt: string | null;
}

function client() {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function fetchAiSettings(): Promise<AiSettingsRow> {
  const { data, error } = await client()
    .from("ai_settings")
    .select("stopped, monthly_budget_usd, daily_user_limit, model, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  const row = data as {
    stopped?: boolean;
    monthly_budget_usd?: number | string;
    daily_user_limit?: number;
    model?: string;
    updated_at?: string | null;
  } | null;
  return {
    stopped: row?.stopped === true,
    monthlyBudgetUsd: Number(row?.monthly_budget_usd ?? 90),
    dailyUserLimit: row?.daily_user_limit ?? 80,
    model: row?.model ?? "claude-haiku-5-5",
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveAiSettings(next: AiGlobalSettings): Promise<void> {
  const supabase = client();
  const updatedBy = await requireOwnId(supabase);
  const { error } = await supabase.from("ai_settings").upsert({
    id: true,
    stopped: next.stopped,
    monthly_budget_usd: next.monthlyBudgetUsd,
    daily_user_limit: next.dailyUserLimit,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function fetchAiRules(): Promise<AiGroupRule[]> {
  const { data, error } = await client()
    .from("ai_windows")
    .select("university, cohort, windows, exceptions, override, override_until");
  if (error) throw error;
  return (
    (data ?? []) as {
      university: string;
      cohort: number;
      windows: unknown;
      exceptions: unknown;
      override: string;
      override_until: string | null;
    }[]
  ).map((row) => ({
    university: row.university,
    cohort: row.cohort,
    windows: parseWindows(row.windows),
    exceptions: parseExceptions(row.exceptions),
    override: (["on", "off"].includes(row.override) ? row.override : "auto") as AiOverride,
    overrideUntil: row.override_until,
  }));
}

export async function saveAiRule(rule: {
  university: string;
  cohort: number;
  windows: readonly AiWindow[];
  exceptions: readonly AiDateException[];
  override: AiOverride;
  overrideUntil: string | null;
}): Promise<void> {
  const supabase = client();
  const updatedBy = await requireOwnId(supabase);
  const { error } = await supabase.from("ai_windows").upsert({
    university: rule.university,
    cohort: rule.cohort,
    windows: rule.windows,
    exceptions: rule.exceptions,
    override: rule.override,
    override_until: rule.override === "auto" ? null : rule.overrideUntil,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** 組の 設定を 消す（＝その 組は 使えなく なる）。 */
export async function deleteAiRule(university: string, cohort: number): Promise<void> {
  const { error } = await client()
    .from("ai_windows")
    .delete()
    .eq("university", university)
    .eq("cohort", cohort);
  if (error) throw error;
}

export interface AiUsageRow {
  readonly userId: string;
  readonly university: string;
  readonly cohort: number;
  readonly costUsd: number;
  readonly ok: boolean;
  readonly createdAt: string;
}

/** 今月（カンボジア時間）の 使った 量。 */
export async function fetchAiUsageSince(sinceIso: string): Promise<AiUsageRow[]> {
  const { data, error } = await client()
    .from("ai_usage")
    .select("user_id, university, cohort, cost_usd, ok, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(20_000);
  if (error) throw error;
  return (
    (data ?? []) as {
      user_id: string;
      university: string;
      cohort: number;
      cost_usd: number | string;
      ok: boolean;
      created_at: string;
    }[]
  ).map((row) => ({
    userId: row.user_id,
    university: row.university,
    cohort: row.cohort,
    costUsd: Number(row.cost_usd) || 0,
    ok: row.ok,
    createdAt: row.created_at,
  }));
}
