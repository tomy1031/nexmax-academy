/**
 * AIチェック（Claude）の 窓口 — Supabase Edge Function（願い #586）
 *
 * ## なぜ Supabase に 置くか
 * アプリの サーバ（Cloudflare）は 香港で 動く ことが あり、**Claude API は 香港から 使えない**
 *（Anthropic の 対応地域一覧で 確認 2026-10-08）。画面は この 関数を **シンガポール
 *（ap-southeast-1）に 固定して** 呼ぶ（`src/lib/ai/claude-check.ts`）。
 * constraints「Worker に 仕事を させない」とも 合う。
 *
 * ## 鍵
 * `ANTHROPIC_API_KEY` は **この 関数の 秘密だけ**に 置く（Supabase の 管理画面 → Edge Functions →
 * Secrets）。Cloudflare・`.env`・ブラウザには 置かない（絶対規律4）。入って いない あいだは
 * 門番が「unconfigured」で 閉じる——画面は いまの 動き（Gemini／お手本）の まま。
 *
 * 中身は `handler.ts`（vitest で 見張る）。ここは Deno の 道具を つなぐ だけ。
 * 出しかたは docs/deploy.md §0.18。
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import { handleAiCheck, type AiCheckFailure, type ClaudeCallResult } from "./handler.ts";

const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** 往復が これより 長ければ あきらめる（画面は Gemini／お手本に 落とす）。 */
const CLAUDE_TIMEOUT_MS = 15_000;

const anthropic =
  apiKey === "" ? null : new Anthropic({ apiKey, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 1 });

function failureOf(error: unknown): AiCheckFailure {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.RateLimitError) return "rateLimited";
  if (error instanceof Anthropic.APIError && error.status === 529) return "overloaded";
  return "upstream";
}

Deno.serve((request) =>
  handleAiCheck(request, {
    hasKey: anthropic !== null,
    now: () => new Date(),

    async userIdFromJwt(jwt) {
      const { data, error } = await admin.auth.getUser(jwt);
      if (error || !data.user) return null;
      return data.user.id;
    },

    async loadContext(userId) {
      const [profileRes, settingsRes, totalsRes] = await Promise.all([
        admin.from("profiles").select("university, cohort").eq("id", userId).maybeSingle(),
        admin
          .from("ai_settings")
          .select("stopped, monthly_budget_usd, daily_user_limit, model")
          .eq("id", true)
          .maybeSingle(),
        admin.rpc("ai_usage_totals", { p_user: userId }),
      ]);
      const profile = profileRes.data as {
        university: string | null;
        cohort: number | null;
      } | null;
      const university = profile?.university ?? "";
      const cohort = university === "講師・スタッフ" ? 0 : (profile?.cohort ?? 0);
      const ruleRes =
        university === ""
          ? { data: null }
          : await admin
              .from("ai_windows")
              .select("university, cohort, windows, exceptions, override, override_until")
              .eq("university", university)
              .eq("cohort", cohort)
              .maybeSingle();
      const totals = (Array.isArray(totalsRes.data) ? totalsRes.data[0] : totalsRes.data) as
        { month_cost_usd: number | string; user_calls_today: number } | null | undefined;
      return {
        profile,
        // 読めなかった ときは null（門番が 閉じる 側に 倒す）
        settings: settingsRes.error ? null : settingsRes.data,
        rule: ruleRes.data,
        // 合計が 読めない ときは 上限に 届いた ものと みなす（費用を 出さない 側）
        monthCostUsd: totalsRes.error
          ? Number.POSITIVE_INFINITY
          : Number(totals?.month_cost_usd ?? 0),
        userCallsToday: totalsRes.error
          ? Number.POSITIVE_INFINITY
          : Number(totals?.user_calls_today ?? 0),
      };
    },

    async callClaude({ model, system, prompt, tool, maxTokens }): Promise<ClaudeCallResult> {
      if (!anthropic) return { ok: false, reason: "upstream" };
      try {
        const message = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          tools: [tool as Anthropic.Tool],
          // 道具を 必ず 呼ばせる（返事は 道具の 引数＝JSON だけ）。Haiku 5.5 は 受けつける
          tool_choice: { type: "tool", name: tool.name },
          messages: [{ role: "user", content: prompt }],
        });
        const call = message.content.find(
          (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use" && block.name === tool.name,
        );
        return {
          ok: true,
          input: call ? call.input : null,
          stopReason: message.stop_reason,
          usage: message.usage,
        };
      } catch (error) {
        return { ok: false, reason: failureOf(error) };
      }
    },

    async recordUsage(row) {
      await admin.from("ai_usage").insert(row);
    },
  }),
);
