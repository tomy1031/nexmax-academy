-- 並べ替えて つないだ 鍵。えらぶ 順番が ちがっても 同じ 組なら 同じ 値。
create or replace function public.quest_member_key(members uuid[])
returns text
language sql
immutable
strict
as $$
  select array_to_string(array(select unnest(members)::text order by 1), ',')
$$;

create table if not exists public.quest_saves (
  id uuid primary key default gen_random_uuid(),
  quest_id text not null,
  member_ids uuid[] not null,
  state jsonb not null default '{}'::jsonb,
  updated_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quest_saves drop constraint if exists quest_saves_members_size;
alter table public.quest_saves add constraint quest_saves_members_size
  check (array_length(member_ids, 1) between 1 and 4);

create unique index if not exists quest_saves_quest_member_key
  on public.quest_saves (quest_id, public.quest_member_key(member_ids));
create index if not exists quest_saves_member_ids_gin
  on public.quest_saves using gin (member_ids);

alter table public.quest_saves enable row level security;

drop policy if exists quest_saves_select_member_or_admin on public.quest_saves;
create policy quest_saves_select_member_or_admin on public.quest_saves
  for select using (auth.uid() = any (member_ids) or public.is_admin());

drop policy if exists quest_saves_insert_member on public.quest_saves;
create policy quest_saves_insert_member on public.quest_saves
  for insert with check (auth.uid() = any (member_ids) and auth.uid() = updated_by);

drop policy if exists quest_saves_update_member on public.quest_saves;
create policy quest_saves_update_member on public.quest_saves
  for update using (auth.uid() = any (member_ids))
  with check (auth.uid() = any (member_ids) and auth.uid() = updated_by);

drop policy if exists quest_saves_delete_admin on public.quest_saves;
create policy quest_saves_delete_admin on public.quest_saves
  for delete using (public.is_admin());

comment on table public.quest_saves is
  'クエストの セーブ。えらばれた 4人で 1行を 共有する（願い #285）。書くのは 節目だけ。';
