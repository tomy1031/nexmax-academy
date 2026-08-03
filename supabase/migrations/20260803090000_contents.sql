-- contents: コンテンツスタジオの教材（下書き・公開）と生成アセットの置き場
-- 適用方法: Supabase ダッシュボード → SQL Editor にこのファイル全文を貼り付けて Run
-- 仕様: docs/design/07_コンテンツスタジオ設計書.html §11
--
-- 教材は data(jsonb) 1枚で持つ。規格（zod スキーマ）の進化が速く、正しさは
-- アプリ側の zod が守るためである（学習記録の側は逆に実カラムにする — §11.2）。
-- git の content/*.json と DB のこの表は合流して読まれ、同一IDは DB が勝つ（§11.1）。

create table if not exists public.contents (
  -- 教材ID（git 側の JSON と同じ値。同一IDなら DB 版が表示に勝つ）
  id text primary key,
  -- 'wordstage' | 'quizset' | 'meeting' | 'scenario' | 'stage' | 'manga' | 'article'
  -- 種別の増減はアプリ側スキーマ（src/content/schema.ts）が唯一の正のため制約は置かない
  kind text not null,
  -- スキーマ準拠のコンテンツ本体（contentSchema でパースしてから使う）
  data jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- どのステージに置くつもりの下書きか（管理画面の絞り込み用。参照の正はステージ側 §3）
  stage_id text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create index if not exists contents_kind_status_idx on public.contents (kind, status);
create index if not exists contents_stage_idx on public.contents (stage_id);

-- updated_at はクライアントの申告を信用せずトリガーで強制する（profiles と同じ流儀）
create or replace function public.touch_contents_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contents_touch_updated_at on public.contents;
create trigger contents_touch_updated_at
  before insert or update on public.contents
  for each row execute function public.touch_contents_updated_at();

alter table public.contents enable row level security;

-- 読み: 公開分は誰でも / 下書きは管理者だけ
--
-- 学習者の画面（/map・/stage・/manga・/article）はログインを求めていない
-- （ミドルウェアはセッションを更新するだけで、リダイレクトしない）。
-- ここを認証必須にすると、git 由来の教材は見えるのに DB 由来の教材だけ
-- ログアウト時に消える、という壊れ方をする。公開＝公開で揃える
-- （下の assets バケットも同じ方針で読み取りは公開）。
drop policy if exists contents_select_published_or_admin on public.contents;
create policy contents_select_published_or_admin on public.contents
  for select using (
    status = 'published' or public.is_admin()
  );

-- 書き: 管理者だけ（公開可否は「検査を通ったか」でアプリ側が決め、DBは主体を絞る）
drop policy if exists contents_insert_admin on public.contents;
create policy contents_insert_admin on public.contents
  for insert with check (public.is_admin());

drop policy if exists contents_update_admin on public.contents;
create policy contents_update_admin on public.contents
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists contents_delete_admin on public.contents;
create policy contents_delete_admin on public.contents
  for delete using (public.is_admin());

-- ------------------------------------------------------------------
-- Storage: 生成画像（WebP）・音声の置き場（§11）
-- 読み取りは公開（学習者の端末が直接取りに行く）。書き込みは管理者だけ。
-- ------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('assets', 'assets', true)
  on conflict (id) do update set public = true;

drop policy if exists assets_select_public on storage.objects;
create policy assets_select_public on storage.objects
  for select using (bucket_id = 'assets');

drop policy if exists assets_insert_admin on storage.objects;
create policy assets_insert_admin on storage.objects
  for insert with check (bucket_id = 'assets' and public.is_admin());

drop policy if exists assets_update_admin on storage.objects;
create policy assets_update_admin on storage.objects
  for update using (bucket_id = 'assets' and public.is_admin())
  with check (bucket_id = 'assets' and public.is_admin());

drop policy if exists assets_delete_admin on storage.objects;
create policy assets_delete_admin on storage.objects
  for delete using (bucket_id = 'assets' and public.is_admin());
