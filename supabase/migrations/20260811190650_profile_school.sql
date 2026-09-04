alter table public.profiles
  add column if not exists university text not null default '',
  add column if not exists cohort integer not null default 0;

comment on column public.profiles.university is '学校。AUPP / CADT。空文字は未設定（列を足す前の行）。';
comment on column public.profiles.cohort is '何期生。1〜5。0 は未設定（列を足す前の行）。';

alter table public.profiles
  drop constraint if exists profiles_university_known;

alter table public.profiles
  add constraint profiles_university_known check (university in ('', 'AUPP', 'CADT'));

alter table public.profiles
  drop constraint if exists profiles_cohort_range;

alter table public.profiles
  add constraint profiles_cohort_range check (cohort between 0 and 5);
