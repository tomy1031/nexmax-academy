create table if not exists public.studio_contents (
  id text primary key,
  kind text not null,
  data jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  stage_id text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create index if not exists studio_contents_kind_status_idx on public.studio_contents (kind, status);
create index if not exists studio_contents_stage_idx on public.studio_contents (stage_id);

create or replace function public.touch_studio_contents_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists studio_contents_touch_updated_at on public.studio_contents;
create trigger studio_contents_touch_updated_at
  before insert or update on public.studio_contents
  for each row execute function public.touch_studio_contents_updated_at();

alter table public.studio_contents enable row level security;

drop policy if exists studio_contents_select_published_or_admin on public.studio_contents;
create policy studio_contents_select_published_or_admin on public.studio_contents
  for select using (
    status = 'published' or public.is_admin()
  );

drop policy if exists studio_contents_insert_admin on public.studio_contents;
create policy studio_contents_insert_admin on public.studio_contents
  for insert with check (public.is_admin());

drop policy if exists studio_contents_update_admin on public.studio_contents;
create policy studio_contents_update_admin on public.studio_contents
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists studio_contents_delete_admin on public.studio_contents;
create policy studio_contents_delete_admin on public.studio_contents
  for delete using (public.is_admin());
