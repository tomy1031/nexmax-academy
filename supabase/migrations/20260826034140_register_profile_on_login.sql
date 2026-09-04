-- supabase/migrations/20260824090000_register_profile_on_login.sql の逐語適用

-- 1. 未診断の行を許す
alter table public.profiles alter column gender drop not null;
alter table public.profiles alter column personality_type drop not null;

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female'));

alter table public.profiles drop constraint if exists profiles_personality_type_v3_check;
alter table public.profiles add constraint profiles_personality_type_v3_check
  check (
    personality_type is null
    or personality_type in (
      'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
      'INTJ', 'INTP', 'ENTJ', 'ENTP',
      'INFJ', 'INFP', 'ENFJ', 'ENFP',
      'ISTP', 'ISFP', 'ESTP', 'ESFP'
    )
  );

-- 2. 「答えがそろっているのに、タイプや性別が無い」行を作らせない
alter table public.profiles drop constraint if exists profiles_answered_row_is_complete;
alter table public.profiles add constraint profiles_answered_row_is_complete
  check (
    answers = '[]'::jsonb
    or (personality_type is not null and gender is not null)
  );

-- 3. ログイン（auth.users への追加）で登録の行を作る
create or replace function public.register_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, personality_version)
  values (new.id, coalesce(new.email, ''), 3)
  on conflict (id) do nothing;
  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists profiles_register_on_signup on auth.users;
create trigger profiles_register_on_signup
  after insert on auth.users
  for each row execute function public.register_profile_on_signup();

-- 4. すでにログイン済みの人にも、登録の行を作る（取りこぼしの回収）
insert into public.profiles (id, email, personality_version)
select u.id, u.email, 3
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null
on conflict (id) do nothing;
