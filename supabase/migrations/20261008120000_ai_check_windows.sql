-- AIチェック（Claude）を 授業の 時間だけ 使う ための 表（願い #586）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- ## 何を するか
-- 「こたえの チェック」を Claude（Haiku 5.5）で 出す。費用は Anthropic の 月 100ドルの 枠。
-- **使えるのは 先生が 決めた 時間だけ**で、時間は **大学 × 期生ごと**に 決める
--（2026-10-08 の 指定「大学、○期生ごとに設定できる。設定のないものは常時使用不可」）。
--
-- ## 表は 3つ
-- - ai_settings … 全体で 1行（ぜんぶ 止める・月の 上限・1人 1日の 上限・モデル）
-- - ai_windows  … 組（大学 × 期生）ごとに 1行（時間わく・手動の ON/OFF）。**行が 無い 組は 使えない**
-- - ai_usage    … 1回 1行（だれが・いつ・いくら）。書くのは AIを 呼ぶ 関数（service role）だけ
--
-- ## 判定は どこで するか
-- AIを 呼ぶ 関数（supabase/functions/ai-check）が、呼ばれる たびに この 3つを 読んで 決める。
-- 生徒の 端末の 時計は 信じない。判定の 中身は src/lib/ai/claude-gate.ts（vitest が 見張る）。
--
-- ## DBは 全環境で 1つ
-- 本番も STG も 同じ DB を 見る（AGENTS.md）。この 設定は 両方に 同時に 効く。
--
-- いま 動いて いる コードは この 表を 読まない ので、先に 流しても 何も 壊れない（足す だけ）。

begin;

-- ── 全体の 設定（1行だけ） ─────────────────────────────────────────────

create table if not exists public.ai_settings (
  -- 1行だけ（app_settings と 同じ 作り）。
  id boolean primary key default true,
  -- true の あいだ、どの 組も 使えない（費用や 不具合の ときの 非常ボタン）。
  stopped boolean not null default false,
  -- 月（カンボジア時間）の 使用額が これに 届いたら、その 月は 全部 止める。
  -- 上は 100ドル（Anthropic の 無料の 枠）。それより 上には 決められない。
  monthly_budget_usd numeric(8, 2) not null default 90,
  -- 1人が 1日（カンボジア時間）に 呼べる 回数。1人が 枠を 使いきらない ため。
  daily_user_limit integer not null default 80,
  -- 使う モデル。いまは Haiku 5.5 だけ（費用の 見積もりが これ 前提）。
  model text not null default 'claude-haiku-5-5',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ai_settings drop constraint if exists ai_settings_single_row;
alter table public.ai_settings add constraint ai_settings_single_row check (id);
alter table public.ai_settings drop constraint if exists ai_settings_budget_range;
alter table public.ai_settings
  add constraint ai_settings_budget_range check (monthly_budget_usd between 0 and 100);
alter table public.ai_settings drop constraint if exists ai_settings_daily_limit_range;
alter table public.ai_settings
  add constraint ai_settings_daily_limit_range check (daily_user_limit between 0 and 1000);
alter table public.ai_settings drop constraint if exists ai_settings_model_known;
alter table public.ai_settings
  add constraint ai_settings_model_known check (model in ('claude-haiku-5-5'));

insert into public.ai_settings (id) values (true) on conflict (id) do nothing;

alter table public.ai_settings enable row level security;

drop policy if exists ai_settings_select_authenticated on public.ai_settings;
create policy ai_settings_select_authenticated on public.ai_settings
  for select to authenticated using (true);

drop policy if exists ai_settings_update_admin on public.ai_settings;
create policy ai_settings_update_admin on public.ai_settings
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists ai_settings_insert_admin on public.ai_settings;
create policy ai_settings_insert_admin on public.ai_settings
  for insert with check (public.is_admin());

comment on table public.ai_settings is
  'AIチェック（Claude）の 全体の 設定。1行だけ。組ごとの 時間は ai_windows。';

-- ── 組（大学 × 期生）ごとの 時間 ─────────────────────────────────────────

create table if not exists public.ai_windows (
  -- profiles.university と 同じ 値（AUPP / CADT / 講師・スタッフ）。
  university text not null,
  -- profiles.cohort と 同じ 1〜5。講師・スタッフは 0。
  cohort integer not null,
  -- 時間わく（カンボジア時間）。[{"days":[2,3,5],"start":"17:30","end":"19:00"}]
  -- days は 0＝日 … 6＝土。1つの 組に 何本でも 置ける（補講の 曜日を 足す）。
  windows jsonb not null default '[]'::jsonb,
  -- 手動。auto＝時間わくの とき だけ／on＝いつでも／off＝いつでも 使えない。
  override text not null default 'auto',
  -- 手動の 期限。過ぎたら auto に もどる（null は 期限なし）。
  override_until timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (university, cohort)
);

alter table public.ai_windows drop constraint if exists ai_windows_university_known;
alter table public.ai_windows
  add constraint ai_windows_university_known
  check (university in ('AUPP', 'CADT', '講師・スタッフ'));
alter table public.ai_windows drop constraint if exists ai_windows_cohort_range;
alter table public.ai_windows
  add constraint ai_windows_cohort_range check (cohort between 0 and 5);
alter table public.ai_windows drop constraint if exists ai_windows_override_known;
alter table public.ai_windows
  add constraint ai_windows_override_known check (override in ('auto', 'on', 'off'));
alter table public.ai_windows drop constraint if exists ai_windows_windows_array;
alter table public.ai_windows
  add constraint ai_windows_windows_array check (jsonb_typeof(windows) = 'array');

alter table public.ai_windows enable row level security;

-- 読むのも 書くのも 先生だけ（学習者の 画面は この 表を 読まない。判定は 関数が する）。
drop policy if exists ai_windows_select_admin on public.ai_windows;
create policy ai_windows_select_admin on public.ai_windows
  for select using (public.is_admin());

drop policy if exists ai_windows_insert_admin on public.ai_windows;
create policy ai_windows_insert_admin on public.ai_windows
  for insert with check (public.is_admin());

drop policy if exists ai_windows_update_admin on public.ai_windows;
create policy ai_windows_update_admin on public.ai_windows
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists ai_windows_delete_admin on public.ai_windows;
create policy ai_windows_delete_admin on public.ai_windows
  for delete using (public.is_admin());

comment on table public.ai_windows is
  'AIチェック（Claude）を 使える 時間。大学 × 期生 ごとに 1行。行が 無い 組は 使えない。';

-- ── 使った 量 ─────────────────────────────────────────────────────────

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- 呼んだ ときの 組（あとで 組ごとに 数える ため。プロフィールを 変えても 残る）。
  university text not null default '',
  cohort integer not null default 0,
  -- 何の チェックか（quiz＝メール・Slack・自由記述 ／ bug＝バグ報告）。
  kind text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  -- 返事が 使えたか（断られた・崩れた 回も 費用は かかる ので 残す）。
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at);
create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;

-- 読むのは 先生だけ。書くのは 関数（service role は RLS を 通らない）だけ なので
-- insert の きまりは 置かない＝ログインした 人には 書けない。
drop policy if exists ai_usage_select_admin on public.ai_usage;
create policy ai_usage_select_admin on public.ai_usage
  for select using (public.is_admin());

comment on table public.ai_usage is
  'AIチェック（Claude）を 1回 呼ぶ ごとに 1行。書くのは supabase/functions/ai-check だけ。';

-- ── 門番が 使う 合計（月の 金額・その人の きょうの 回数） ───────────────────
--
-- PostgREST の 集計は 既定で 切って ある ので、関数に する。
-- 月と 日の 区切りは カンボジア時間（Asia/Phnom_Penh・夏時間なし）。

create or replace function public.ai_usage_totals(p_user uuid)
returns table (month_cost_usd numeric, user_calls_today integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(u.cost_usd) from public.ai_usage u
      where u.created_at >= (date_trunc('month', now() at time zone 'Asia/Phnom_Penh')
                             at time zone 'Asia/Phnom_Penh')
    ), 0) as month_cost_usd,
    coalesce((
      select count(*)::integer from public.ai_usage u
      where u.user_id = p_user
        and u.created_at >= (date_trunc('day', now() at time zone 'Asia/Phnom_Penh')
                             at time zone 'Asia/Phnom_Penh')
    ), 0) as user_calls_today;
$$;

-- 呼べるのは 関数（service role）と 先生の 画面だけ。学習者には 他人の 回数を 見せない。
revoke all on function public.ai_usage_totals(uuid) from public;
revoke all on function public.ai_usage_totals(uuid) from anon;
revoke all on function public.ai_usage_totals(uuid) from authenticated;
grant execute on function public.ai_usage_totals(uuid) to service_role;

commit;
