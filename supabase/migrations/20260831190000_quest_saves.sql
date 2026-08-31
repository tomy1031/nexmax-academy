-- quest_saves: クエストの セーブを **チームで 共有する**（願い #285）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- 2026-08-30 の 指定「選ばれた4人はセーブデータをシェアします」「負荷エラーの
-- 起こらない範囲で supabase への登録をお願いします」。
--
-- ## 1人1行では 足りない
-- これまでの 学習データ（quiz_results / meeting_turn_logs）は すべて
-- `auth.uid() = profile_id` の **1人1行**だった。こちらは 逆で、**4人が 同じ 1行**を
-- 読み書きする。だから 所有者を 1人に 決められない——`member_ids` の 配列で 持ち、
-- 「その 配列に 自分が いるか」で 判定する。
--
-- ## 同じ 4人なら 同じ セーブに 戻る
-- `quest_member_key()` は member_ids を **並べ替えて つないだ 文字列**を 返す。
-- えらぶ 順番が 違っても 同じ 組なら 同じ 鍵に なるので、「きのうの つづき」に 戻れる。
-- 生成列では なく **式インデックス**に して あるのは、生成列に 副問い合わせを
-- 書けない ため（PostgreSQL 17 で `cannot use subquery in column generation expression`）。
-- どちらに しても 鍵は DBが 作るので、アプリが 作り方を まちがえる 余地は ない。
--
-- ## update を 置く（quiz_results との ちがい）
-- 成績の 台帳は「一度 書いたら 誰も 直せない」ことに 意味が あったが、セーブは
-- **進むたびに 上書きする** ものなので update が 要る。ただし **消せるのは 先生だけ**。
--
-- ## 負荷
-- 書くのは **場面クリア・ゲームオーバー・クリア の 節目だけ**（1回の 遊びで 30回ほど）。
-- 1手ごとには 書かない。端末（localStorage）には 1手ごとに 置くので、
-- 途中で 画面を 閉じても 消えない（meeting_turn_logs の ためかたと 同じ 考え方）。

begin;

-- 並べ替えて つないだ 鍵を 返す。式インデックスから 呼ぶので immutable が 要る。
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
  -- 手番の 順（えらんだ 順）。1〜4人。
  member_ids uuid[] not null,
  -- ゲームの 状態（画面の reducer が そのまま 入れる）。
  state jsonb not null default '{}'::jsonb,
  -- 最後に 書いた 人。誰が 保存したかが 分かると、先生が 追える。
  updated_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quest_saves
  drop constraint if exists quest_saves_members_size;
alter table public.quest_saves
  add constraint quest_saves_members_size
  check (array_length(member_ids, 1) between 1 and 4);

-- 同じ クエスト・同じ 組は 1行だけ（「つづきから」が 2つに 割れない）。
create unique index if not exists quest_saves_quest_member_key
  on public.quest_saves (quest_id, public.quest_member_key(member_ids));

-- 自分が 入って いる セーブを 引く ための 索引。
create index if not exists quest_saves_member_ids_gin
  on public.quest_saves using gin (member_ids);

alter table public.quest_saves enable row level security;

-- きまりは 4つ。**メンバーかどうか**で 読み書きを 決める。
--   1. メンバーは 読める／先生は ぜんぶ 読める
--   2. メンバーは 作れる（自分が 入って いる 組だけ）
--   3. メンバーは 上書きできる（セーブは 進むたびに 変わる）
--   4. 消せるのは 先生だけ
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

commit;
