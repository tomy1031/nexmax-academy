-- profiles: 所属に「講師・スタッフ」を足し、管理者フラグを先生の画面から変えられるようにする（願い #153-5/6）
-- リポジトリの正本: supabase/migrations/20260821100000_staff_affiliation_and_admin_flag.sql

alter table public.profiles
  drop constraint if exists profiles_university_known;

alter table public.profiles
  add constraint profiles_university_known
  check (university in ('', 'AUPP', 'CADT', '講師・スタッフ'));

comment on column public.profiles.university is '所属。AUPP / CADT / 講師・スタッフ。空文字は未設定（列を足す前の行）。';

create or replace function public.enforce_profile_identity()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  u_email text;
  seed_admin boolean;
begin
  select email into u_email from auth.users where id = new.id;
  if u_email is not null then
    new.email := u_email;
  end if;

  seed_admin := coalesce(u_email, new.email) in ('tomy1031@gmail.com', 's.tominaga@nextmake.co.jp');

  if seed_admin then
    new.is_admin := true;
  elsif tg_op = 'INSERT' then
    new.is_admin := false;
  elsif not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_identity on public.profiles;
create trigger profiles_identity
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_identity();
