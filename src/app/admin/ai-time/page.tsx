"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { claudeStatus } from "@/lib/ai/claude-check";
import {
  AI_STAFF_AFFILIATION,
  clockMinutes,
  effectiveOverride,
  phnomPenhMonthStart,
  phnomPenhNextMidnight,
  ruleOpenNow,
  type AiGroupRule,
  type AiWindow,
} from "@/lib/ai/claude-gate";
import {
  deleteAiRule,
  fetchAiRules,
  fetchAiSettings,
  fetchAiUsageSince,
  saveAiRule,
  saveAiSettings,
  type AiSettingsRow,
  type AiUsageRow,
} from "@/lib/ai/claude-settings-db";
import { fetchAllProfiles, fetchOwnProfile, type ProfileRow } from "@/lib/profile-db";
import { COHORTS, UNIVERSITIES } from "@/lib/school";
import { createClient } from "@/lib/supabase/client";

/**
 * AIの 時間（先生向け・管理者だけ）— 願い #586
 *
 * こたえの チェック（Claude・Haiku 5.5）を **使える 時間**を、**大学 × 期生 ごと**に 決める。
 * 2026-10-08 の 指定:「火・水・金 17:30〜19:00ですが、それらを設定できる画面も作りたいです。
 * 大学、○期生ごとに設定できる。設定のないものは常時使用不可」。
 *
 * - 時刻は **カンボジア時間**。判定は AIを 呼ぶ 関数が する（`src/lib/ai/claude-gate.ts`）
 * - 使えない ときも 学習者は 止まらない（いまの 動き＝Gemini／お手本に 落ちる）
 * - 認可は ここでは 決めない。画面は 入口を 隠すだけで、関所は RLS（`public.is_admin()`）
 */

/** 画面に 並べる 曜日の 順（月はじまり）。値は 0＝日 … 6＝土。 */
const DAYS: readonly { value: number; label: string }[] = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 0, label: "日" },
];

/** いまの 授業（2026-10-08 の 指定）。ボタン 1つで 入れられる ように する。 */
const CLASS_PRESET: AiWindow = { days: [2, 3, 5], start: "17:30", end: "19:00" };

/** 手動で ON に する 長さ。 */
const MANUAL_ON_HOURS = 2;

interface Group {
  readonly university: string;
  readonly cohort: number;
}

const GROUPS: readonly Group[] = [
  ...UNIVERSITIES.flatMap((university) => COHORTS.map((cohort) => ({ university, cohort }))),
  { university: AI_STAFF_AFFILIATION, cohort: 0 },
];

function groupKey(group: Group): string {
  return `${group.university}:${group.cohort}`;
}

function groupName(group: Group): string {
  return group.university === AI_STAFF_AFFILIATION
    ? AI_STAFF_AFFILIATION
    : `${group.university} ${group.cohort}期`;
}

function windowText(window: AiWindow): string {
  const days = DAYS.filter((day) => window.days.includes(day.value))
    .map((day) => day.label)
    .join("・");
  return `${days} ${window.start}〜${window.end}`;
}

function clockText(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("ja-JP", {
    timeZone: "Asia/Phnom_Penh",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dollars(value: number): string {
  return `${value.toFixed(2)}ドル`;
}

/** 組の「いま」を 1行で 言う。 */
function nowText(
  rule: AiGroupRule | undefined,
  settings: AiSettingsRow,
  monthCost: number,
  now: Date,
) {
  if (settings.stopped) return { open: false, text: "ぜんぶ 止めて います" };
  if (monthCost >= settings.monthlyBudgetUsd)
    return { open: false, text: "今月の 上限に 届きました" };
  if (!rule) return { open: false, text: "設定が ありません（使えません）" };
  const override = effectiveOverride(rule, now);
  const until = rule.overrideUntil ? `（${clockText(rule.overrideUntil)} まで）` : "";
  if (override === "on") return { open: true, text: `手動で ON${until}` };
  if (override === "off") return { open: false, text: `手動で OFF${until}` };
  return ruleOpenNow(rule, now)
    ? { open: true, text: "授業の 時間です" }
    : { open: false, text: "時間の 外です" };
}

/** 鍵（関数の 秘密）の ようす。先生が 自分で 窓口に 問いあわせて 知る。 */
function keyText(reason: string | null): string {
  if (reason === null) return "たしかめて います…";
  if (reason === "unconfigured") return "まだ 入って いません（タスクボードの カード）";
  if (reason === "notDeployed") return "窓口が まだ 出て いません";
  if (reason === "network" || reason === "upstream" || reason === "badShape") {
    return "窓口に つながりませんでした";
  }
  return "入って います";
}

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<AiSettingsRow | null>(null);
  const [rules, setRules] = useState<AiGroupRule[]>([]);
  const [usage, setUsage] = useState<AiUsageRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [keyReason, setKeyReason] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(async () => {
    const [nextSettings, nextRules, nextUsage] = await Promise.all([
      fetchAiSettings(),
      fetchAiRules(),
      fetchAiUsageSince(phnomPenhMonthStart(new Date()).toISOString()),
    ]);
    setSettings(nextSettings);
    setRules(nextRules);
    setUsage(nextUsage);
    setNow(new Date());
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        router.replace("/welcome");
        return;
      }
      try {
        const own = await fetchOwnProfile();
        if (!active) return;
        if (!own) {
          router.replace("/welcome");
          return;
        }
        if (!own.is_admin) {
          router.replace("/map");
          return;
        }
        const [, allProfiles] = await Promise.all([reload(), fetchAllProfiles()]);
        if (!active) return;
        setProfiles(allProfiles);
        setLoading(false);
        const status = await claudeStatus();
        if (active) setKeyReason(status.open ? "" : status.reason);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reload, router]);

  // 「いま」の 札を 1分ごとに 描き直す（授業が 始まったら 画面でも 分かる）
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const run = useCallback(
    async (label: string, work: () => Promise<void>) => {
      setSaving(true);
      setNotice(null);
      try {
        await work();
        await reload();
        setNotice(`${label}。本番と STG の 両方に すぐ 効きます。`);
      } catch (error) {
        setNotice(
          `保存できませんでした: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  const monthCost = useMemo(() => usage.reduce((sum, row) => sum + row.costUsd, 0), [usage]);
  const studentsOf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const profile of profiles) {
      const university = profile.university ?? "";
      const cohort = university === AI_STAFF_AFFILIATION ? 0 : (profile.cohort ?? 0);
      const key = `${university}:${cohort}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [profiles]);
  const usageOf = useMemo(() => {
    const totals = new Map<string, { cost: number; calls: number }>();
    for (const row of usage) {
      const key = `${row.university}:${row.cohort}`;
      const one = totals.get(key) ?? { cost: 0, calls: 0 };
      totals.set(key, { cost: one.cost + row.costUsd, calls: one.calls + 1 });
    }
    return totals;
  }, [usage]);

  if (loading) return <AdminLoading />;
  if (errorMessage || !settings) return <AdminError message={errorMessage ?? "読めませんでした"} />;

  const ruleOf = (group: Group) =>
    rules.find((rule) => rule.university === group.university && rule.cohort === group.cohort);

  return (
    <AdminPageFrame>
      <AdminHeader
        title="AIの 時間"
        note="こたえの チェック（Claude）を 使える 時間を、大学 × 期生 ごとに 決めます。設定の 無い 組は 使えません。時刻は カンボジア時間です。"
      />

      {notice ? (
        <p
          role="status"
          className="text-navy bg-panel-tint mb-4 rounded-xl px-3 py-2 text-sm font-bold"
        >
          {notice}
        </p>
      ) : null}

      <GlobalCard
        settings={settings}
        monthCost={monthCost}
        monthCalls={usage.length}
        keyReason={keyReason}
        saving={saving}
        onSave={(next, label) => void run(label, () => saveAiSettings(next))}
      />

      <section className="card-pop mt-4 px-5 py-5">
        <h2 className="text-navy text-base font-black">組ごとの 時間</h2>
        <ul className="mt-3 divide-y divide-[color:var(--hairline,#e5e7eb)]">
          {GROUPS.map((group) => {
            const key = groupKey(group);
            const rule = ruleOf(group);
            const state = nowText(rule, settings, monthCost, now);
            const spent = usageOf.get(key);
            return (
              <li key={key} className="py-3" data-group={key}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-navy min-w-24 font-black">{groupName(group)}</span>
                  <span className="text-ink-soft text-xs font-bold">
                    {studentsOf.get(key) ?? 0}人
                  </span>
                  <span
                    data-open={state.open ? "yes" : "no"}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                      state.open ? "bg-[#d9f7d6] text-[#1d6b2a]" : "bg-panel-tint text-ink-soft"
                    }`}
                  >
                    {state.open ? "● 使える" : "○ 使えない"}・{state.text}
                  </span>
                  {spent ? (
                    <span className="text-ink-soft text-xs font-bold">
                      今月 {spent.calls}回・{dollars(spent.cost)}
                    </span>
                  ) : null}
                </div>
                <p className="text-ink mt-1 text-sm font-bold">
                  {rule && rule.windows.length > 0
                    ? rule.windows.map(windowText).join(" ／ ")
                    : "時間わくは まだ ありません"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <SmallButton
                    disabled={saving}
                    onClick={() => setEditing(editing === key ? null : key)}
                  >
                    {editing === key ? "閉じる" : "時間を 決める"}
                  </SmallButton>
                  <SmallButton
                    disabled={saving}
                    onClick={() =>
                      void run(`${groupName(group)}を ${MANUAL_ON_HOURS}時間 ON に しました`, () =>
                        saveAiRule({
                          university: group.university,
                          cohort: group.cohort,
                          windows: rule?.windows ?? [],
                          override: "on",
                          overrideUntil: new Date(
                            Date.now() + MANUAL_ON_HOURS * 60 * 60_000,
                          ).toISOString(),
                        }),
                      )
                    }
                  >
                    いまから {MANUAL_ON_HOURS}時間 ON
                  </SmallButton>
                  {rule ? (
                    <SmallButton
                      disabled={saving}
                      onClick={() =>
                        void run(`${groupName(group)}を きょうは OFF に しました`, () =>
                          saveAiRule({
                            ...rule,
                            override: "off",
                            overrideUntil: phnomPenhNextMidnight(new Date()).toISOString(),
                          }),
                        )
                      }
                    >
                      きょうは OFF
                    </SmallButton>
                  ) : null}
                  {rule && rule.override !== "auto" ? (
                    <SmallButton
                      disabled={saving}
                      onClick={() =>
                        void run(`${groupName(group)}を 時間どおりに もどしました`, () =>
                          saveAiRule({ ...rule, override: "auto", overrideUntil: null }),
                        )
                      }
                    >
                      時間どおりに もどす
                    </SmallButton>
                  ) : null}
                </div>
                {editing === key ? (
                  <WindowEditor
                    initial={rule?.windows ?? []}
                    saving={saving}
                    canDelete={rule !== undefined}
                    onSave={(windows) =>
                      void run(`${groupName(group)}の 時間を 保存しました`, async () => {
                        await saveAiRule({
                          university: group.university,
                          cohort: group.cohort,
                          windows,
                          override: rule?.override ?? "auto",
                          overrideUntil: rule?.overrideUntil ?? null,
                        });
                        setEditing(null);
                      })
                    }
                    onDelete={() =>
                      void run(
                        `${groupName(group)}の 設定を 消しました（使えません）`,
                        async () => {
                          await deleteAiRule(group.university, group.cohort);
                          setEditing(null);
                        },
                      )
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card-pop mt-4 px-5 py-5">
        <h2 className="text-navy text-base font-black">つかう まえに</h2>
        <ul className="text-ink mt-3 space-y-2 text-sm font-bold">
          <li>
            <strong className="text-navy">本番と STG の 両方に 同時に 効きます。</strong> DB は
            全環境で 1つを 共有しています。
          </li>
          <li>
            使えない 時間も、学習者は 止まりません。生徒が 自分の Gemini の 鍵を 入れて いれば
            Gemini が 見て、無ければ お手本と アプリの ⭕✗で 進みます。
          </li>
          <li>
            学習者の 端末は「使えるか」を 1分 ためます。時間に なってから 1分 ほどで
            切りかわります。
          </li>
          <li>大学・期生を まだ 選んで いない 生徒は、どの 組の 設定でも 使えません。</li>
        </ul>
      </section>
    </AdminPageFrame>
  );
}

function SmallButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="border-hairline text-navy rounded-xl border-2 bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function GlobalCard({
  settings,
  monthCost,
  monthCalls,
  keyReason,
  saving,
  onSave,
}: {
  settings: AiSettingsRow;
  monthCost: number;
  monthCalls: number;
  keyReason: string | null;
  saving: boolean;
  onSave: (next: AiSettingsRow, label: string) => void;
}) {
  const [budget, setBudget] = useState(String(settings.monthlyBudgetUsd));
  const [daily, setDaily] = useState(String(settings.dailyUserLimit));
  const budgetValue = Number(budget);
  const dailyValue = Number(daily);
  const valid =
    Number.isFinite(budgetValue) &&
    budgetValue >= 0 &&
    budgetValue <= 100 &&
    Number.isInteger(dailyValue) &&
    dailyValue >= 0 &&
    dailyValue <= 1000;
  const ratio =
    settings.monthlyBudgetUsd > 0 ? Math.min(1, monthCost / settings.monthlyBudgetUsd) : 1;

  return (
    <section className="card-pop px-5 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className={`grid h-12 w-12 place-items-center rounded-full text-2xl ${
            settings.stopped ? "bg-panel-tint" : "bg-[#d9f7d6]"
          }`}
        >
          {settings.stopped ? "⏸️" : "▶️"}
        </span>
        <div className="min-w-0">
          <p className="text-navy text-lg font-black">
            {settings.stopped ? "いま ぜんぶ 止めて います" : "組ごとの 時間で 動いて います"}
          </p>
          <p className="text-ink-soft text-sm font-bold">
            Claude の 鍵: {keyText(keyReason)}・モデル: {settings.model}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-navy text-sm font-black">
          今月 {dollars(monthCost)} ／ 上限 {dollars(settings.monthlyBudgetUsd)}（{monthCalls}回）
        </p>
        <div className="bg-panel-tint mt-1 h-2 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-[#4c8dff]"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-ink text-sm font-bold">
          月の 上限（ドル・100まで）
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            className="border-hairline mt-1 block w-28 rounded-lg border-2 px-2 py-1"
          />
        </label>
        <label className="text-ink text-sm font-bold">
          1人 1日の 上限（回）
          <input
            type="number"
            min={0}
            max={1000}
            step={1}
            value={daily}
            onChange={(event) => setDaily(event.target.value)}
            className="border-hairline mt-1 block w-28 rounded-lg border-2 px-2 py-1"
          />
        </label>
        <button
          type="button"
          disabled={saving || !valid}
          onClick={() =>
            onSave(
              { ...settings, monthlyBudgetUsd: budgetValue, dailyUserLimit: dailyValue },
              "上限を 保存しました",
            )
          }
          className="btn-game px-4 py-2 text-sm disabled:opacity-40"
        >
          上限を 保存
        </button>
      </div>

      <div className="mt-4">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave(
              { ...settings, stopped: !settings.stopped },
              settings.stopped ? "動かしました" : "ぜんぶ 止めました",
            )
          }
          className="border-hairline text-navy rounded-2xl border-2 bg-white px-5 py-2.5 text-sm font-bold disabled:opacity-40"
        >
          {settings.stopped ? "動かす（組ごとの 時間に もどす）" : "ぜんぶ 止める（非常ボタン）"}
        </button>
      </div>
    </section>
  );
}

function WindowEditor({
  initial,
  saving,
  canDelete,
  onSave,
  onDelete,
}: {
  initial: readonly AiWindow[];
  saving: boolean;
  canDelete: boolean;
  onSave: (windows: AiWindow[]) => void;
  onDelete: () => void;
}) {
  const [windows, setWindows] = useState<AiWindow[]>(() =>
    initial.length > 0 ? initial.map((one) => ({ ...one, days: [...one.days] })) : [CLASS_PRESET],
  );
  const problems = windows.map((window) => {
    const start = clockMinutes(window.start);
    const end = clockMinutes(window.end);
    if (window.days.length === 0) return "曜日を 1つ 以上 えらんで ください";
    if (start === null || end === null) return "時刻を 入れて ください";
    if (start >= end) return "おわりは はじめより 後に して ください";
    return "";
  });
  const valid = problems.every((one) => one === "");
  const update = (index: number, next: AiWindow) =>
    setWindows((all) => all.map((one, at) => (at === index ? next : one)));

  return (
    <div className="bg-panel-tint mt-3 rounded-xl px-4 py-3">
      {windows.map((window, index) => (
        <div key={index} className="border-hairline mb-3 rounded-lg border-2 bg-white px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((day) => {
              const on = window.days.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    update(index, {
                      ...window,
                      days: on
                        ? window.days.filter((value) => value !== day.value)
                        : [...window.days, day.value],
                    })
                  }
                  className={`h-8 w-8 rounded-full text-sm font-black ${
                    on ? "bg-navy text-white" : "border-hairline text-navy border-2 bg-white"
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
            <input
              type="time"
              aria-label="はじめ"
              value={window.start}
              onChange={(event) => update(index, { ...window, start: event.target.value })}
              className="border-hairline rounded-lg border-2 px-2 py-1"
            />
            〜
            <input
              type="time"
              aria-label="おわり"
              value={window.end}
              onChange={(event) => update(index, { ...window, end: event.target.value })}
              className="border-hairline rounded-lg border-2 px-2 py-1"
            />
            <button
              type="button"
              onClick={() => setWindows((all) => all.filter((_, at) => at !== index))}
              className="text-ink-soft ml-auto text-xs font-bold underline"
            >
              この わくを 消す
            </button>
          </div>
          {problems[index] ? (
            <p className="mt-1 text-xs font-bold text-[#b42318]">{problems[index]}</p>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <SmallButton onClick={() => setWindows((all) => [...all, { ...CLASS_PRESET }])}>
          わくを 足す
        </SmallButton>
        <SmallButton onClick={() => setWindows([{ ...CLASS_PRESET }])}>
          火・水・金 17:30〜19:00 に する
        </SmallButton>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving || !valid || windows.length === 0}
          onClick={() =>
            onSave(windows.map((one) => ({ ...one, days: [...one.days].sort((a, b) => a - b) })))
          }
          className="btn-game px-4 py-2 text-sm disabled:opacity-40"
        >
          保存
        </button>
        {canDelete ? (
          <button
            type="button"
            disabled={saving}
            onClick={onDelete}
            className="border-hairline text-navy rounded-2xl border-2 bg-white px-4 py-2 text-sm font-bold disabled:opacity-40"
          >
            設定を 消す（使えなく する）
          </button>
        ) : null}
      </div>
    </div>
  );
}
