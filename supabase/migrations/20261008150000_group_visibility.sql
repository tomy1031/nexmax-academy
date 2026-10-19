-- 組（大学 × 期生）ごとに ステージ・教材を 非表示に する（願い #589）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- ## 何を するか
-- 2026-10-08 の 指定:「どのステージのどの教材を表示させるかも調整できるといいです。
-- デフォルトはどの学校のどの期も同じ表示状態からスタートしたいけど、場合によって
-- 非表示にしたりするものもあって欲しい」。
--
-- - **行が 無い 組は 全部 見える**（いまの まま）。AIの 時間（ai_windows）とは 逆
-- - 行に あるのは「隠す もの」だけ。見せる もの を 並べない（教材を 足した 日に
--   どの 組でも 自動で 見える ように する ため）
--
-- ## 学習者は 自分の 組の ぶん だけ 読む
-- 表そのものは 先生だけが 読み書きする。学習者の 画面は `my_group_visibility()` を
-- 1回 呼ぶ だけ——ログインした 人の 組を DB の 側で 引くので、端末が 組を 知らなくても よい。
--
-- ## DBは 全環境で 1つ
-- 本番も STG も 同じ DB を 見る（AGENTS.md）。この 設定は 両方に 同時に 効く。
-- いま 動いて いる コードは この 表を 読まない ので、先に 流しても 何も 壊れない（足す だけ）。

begin;

create table if not exists public.group_visibility (
  -- profiles.university と 同じ 値（AUPP / CADT / 講師・スタッフ）。
  university text not null,
  -- profiles.cohort と 同じ 1〜5。講師・スタッフは 0。
  cohort integer not null,
  -- 隠す ステージの id。
  hidden_stages text[] not null default '{}',
  -- 隠す 教材。「ステージid/教材id」（同じ 教材が 2つの ステージに 入る ことが あるため）。
  hidden_contents text[] not null default '{}',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (university, cohort)
);

alter table public.group_visibility drop constraint if exists group_visibility_university_known;
alter table public.group_visibility
  add constraint group_visibility_university_known
  check (university in ('AUPP', 'CADT', '講師・スタッフ'));
alter table public.group_visibility drop constraint if exists group_visibility_cohort_range;
alter table public.group_visibility
  add constraint group_visibility_cohort_range check (cohort between 0 and 5);

alter table public.group_visibility enable row level security;

-- 表は 先生だけ。学習者は 下の 関数で 自分の 組の ぶん だけ 受けとる。
drop policy if exists group_visibility_select_admin on public.group_visibility;
create policy group_visibility_select_admin on public.group_visibility
  for select using (public.is_admin());

drop policy if exists group_visibility_insert_admin on public.group_visibility;
create policy group_visibility_insert_admin on public.group_visibility
  for insert with check (public.is_admin());

drop policy if exists group_visibility_update_admin on public.group_visibility;
create policy group_visibility_update_admin on public.group_visibility
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists group_visibility_delete_admin on public.group_visibility;
create policy group_visibility_delete_admin on public.group_visibility
  for delete using (public.is_admin());

comment on table public.group_visibility is
  '組（大学 × 期生）ごとに 隠す ステージ・教材。行が 無い 組は 全部 見える。';

-- ── 学習者の 画面が 呼ぶ ──────────────────────────────────────────────
-- ログインした 人の 組の 隠す もの。行が 無ければ 0行（＝全部 見える）。
-- 講師・スタッフは 期生を 持たない ので 0 に そろえる（ai_windows と 同じ）。

create or replace function public.my_group_visibility()
returns table (hidden_stages text[], hidden_contents text[])
language sql
stable
security definer
set search_path = public
as $$
  select v.hidden_stages, v.hidden_contents
  from public.profiles p
  join public.group_visibility v
    on v.university = p.university
   and v.cohort = case when p.university = '講師・スタッフ' then 0 else p.cohort end
  where p.id = auth.uid();
$$;

revoke all on function public.my_group_visibility() from public;
revoke all on function public.my_group_visibility() from anon;
grant execute on function public.my_group_visibility() to authenticated;

commit;
