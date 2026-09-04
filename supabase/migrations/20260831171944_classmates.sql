drop function if exists public.classmates();

create or replace function public.classmates()
returns table (
  id uuid,
  display_name text,
  family_name text,
  given_name text,
  nickname text,
  gender text,
  personality_type text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.family_name,
    p.given_name,
    p.nickname,
    p.gender,
    p.personality_type
  from public.profiles as p
  join public.profiles as me on me.id = auth.uid()
  where
    me.university in ('AUPP', 'CADT')
    and me.cohort between 1 and 5
    and p.university = me.university
    and p.cohort = me.cohort
    and p.university <> '講師・スタッフ'
  order by p.display_name, p.id
$$;

comment on function public.classmates() is
  '自分と 同じ 学校・同じ 期の 学生（自分を 含む）。ゲームの 4人えらびで 使う。返すのは id・なまえ・性別・タイプ だけ。';

revoke all on function public.classmates() from public;
revoke all on function public.classmates() from anon;
grant execute on function public.classmates() to authenticated;
