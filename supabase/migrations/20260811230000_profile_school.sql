-- profiles: 学校（AUPP / CADT）と 何期生（1〜5）を持つ（願い #27）
-- 適用方法: Supabase ダッシュボード → SQL Editor にこのファイル全文を貼り付けて Run
--
-- 先生がクラスを見分けるための情報。なまえと同じ扱いで、学習者が自分で選ぶ。
-- 既定を「未設定」にしておくのは、この列を足す前に作られた行を残すため
-- （入れ直しはアプリが `/welcome` で案内する）。

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
