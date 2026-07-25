-- profiles: 学習者プロフィール（オンボーディング結果）
-- 適用方法: Supabase ダッシュボード → SQL Editor にこのファイル全文を貼り付けて Run
-- 仕様: docs/design/05_ゲーム導入オンボーディング設計.md §5

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  gender text not null check (gender in ('male', 'female')),
  personality_type text not null
    check (personality_type in ('leader', 'idea', 'heart', 'challenge')),
  -- 20問の回答: ["yes"|"no"|"neutral", ...]（チーム編成の参考データ）
  answers jsonb not null default '[]'::jsonb,
  -- 軸別スコア: {"leader":0-10,"idea":0-10,"heart":0-10,"challenge":0-10}
  scores jsonb not null default '{}'::jsonb,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 管理者判定（security definer で RLS の再帰を回避）
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- email / is_admin / updated_at はクライアントの申告を信用せずトリガーで強制する
create or replace function public.enforce_profile_identity()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  u_email text;
begin
  select email into u_email from auth.users where id = new.id;
  if u_email is not null then
    new.email := u_email;
  end if;
  new.is_admin := coalesce(u_email, new.email) in ('tomy1031@gmail.com', 's.tominaga@nextmake.co.jp');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_identity on public.profiles;
create trigger profiles_identity
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_identity();

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin on public.profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete using (public.is_admin());
