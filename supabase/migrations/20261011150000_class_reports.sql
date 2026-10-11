-- 授業ごとの回答分析を残す表（2026-10-11・要望 #599）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- 火・水・金の授業のあと、Claude の定期タスクが生徒の回答を読んで分析し、組（大学×期生）ごとに
-- 1行を登録する。先生は学習の記録の画面でこれを読む。
-- 2026-10-11 の指定「分析結果は管理画面で表示できるようにしてほしい」「定期作業結果はDBに登録してほしい」。
--
-- 書くのは定期タスクだけ（Supabase のコネクタ＝RLS を通らない役割で書く）。
-- ログインした人には insert のきまりを置かない＝画面からは書けない。読むのは先生だけ。
--
-- 同じ日・同じ組をもう一度分析したら上書きする（unique で受けて on conflict do update）。
-- 表を足すだけなので、いま本番で動いているコードは壊れない。

begin;

create table if not exists public.class_reports (
  id uuid primary key default gen_random_uuid(),
  -- 授業の日（カンボジア時間）
  class_date date not null,
  university text not null default '',
  cohort integer not null default 0,
  -- その日に動いた生徒の数
  students integer not null default 0,
  -- 先生が最初に読む2〜3文のまとめ
  summary text not null default '',
  -- フォローが要る生徒: [{ "profile_id", "name", "reasons": [..], "quotes": [..] }]
  follow_up jsonb not null default '[]'::jsonb,
  -- AIの疑い: [{ "profile_id", "name", "quote", "reason" }]
  ai_suspects jsonb not null default '[]'::jsonb,
  -- クラスでつまずいたところ: [{ "title", "detail", "quotes": [..] }]
  stumbles jsonb not null default '[]'::jsonb,
  -- 次の授業でやること: ["..", ".."]
  next_steps jsonb not null default '[]'::jsonb,
  -- 書いたもの（定期タスク・手で試した等）
  source text not null default 'scheduled-task',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_date, university, cohort)
);

create index if not exists class_reports_date_idx on public.class_reports (class_date desc);

alter table public.class_reports enable row level security;

drop policy if exists class_reports_select_admin on public.class_reports;
create policy class_reports_select_admin on public.class_reports
  for select using (public.is_admin());

revoke all on public.class_reports from anon;
grant select on public.class_reports to authenticated;

comment on table public.class_reports is
  '授業ごとの回答分析。組（大学×期生）×授業の日で1行。書くのは Claude の定期タスクだけ、読むのは先生だけ。';

commit;
