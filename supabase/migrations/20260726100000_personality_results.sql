-- personality_results: 性格診断の回答記録（履歴）
-- 適用方法: Supabase ダッシュボード → SQL Editor に全文を貼り付けて Run
-- 仕様: docs/design/06_性格診断レポート設計.md
--
-- profiles は「最新の状態」を持つ。こちらは診断を完了するたびに1行積む台帳で、
-- 学生が診断をやり直しても過去の傾向が消えない（教師が変化を見られる）。

create table if not exists public.personality_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  personality_type text not null
    check (personality_type in ('leader', 'idea', 'heart', 'challenge')),
  -- 20問の回答: ["yes"|"no"|"neutral", ...]
  answers jsonb not null default '[]'::jsonb,
  -- 軸別スコア: {"leader":0-10,"idea":0-10,"heart":0-10,"challenge":0-10}
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists personality_results_profile_created_idx
  on public.personality_results (profile_id, created_at desc);

alter table public.personality_results enable row level security;

drop policy if exists personality_results_select_own_or_admin on public.personality_results;
create policy personality_results_select_own_or_admin on public.personality_results
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists personality_results_insert_own on public.personality_results;
create policy personality_results_insert_own on public.personality_results
  for insert with check (auth.uid() = profile_id);

drop policy if exists personality_results_delete_admin on public.personality_results;
create policy personality_results_delete_admin on public.personality_results
  for delete using (public.is_admin());
