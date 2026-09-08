-- app_settings: 先生が 管理画面から 順路の 鍵を まとめて 外せるようにする
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- ## なぜ 要るのか
-- 順路の 鍵（関門）は **学習者のため**の しくみだが、教材の 不具合で 関門が
-- 開かなく なると、授業が その場で 止まる（願い #333「札が3/10しか開かない」・
-- #246「ヘンディさんの あとに 進めない」）。原因を 直すまでの あいだ、先生が
-- 手で 鍵を 外せる 逃げ道を 置く。**取り急ぎの レバー**であって、関門そのものを
-- 捨てるわけでは ない（既定は false ＝ これまでどおり 鍵は かかる）。
--
-- ## 1行しか 作らせない
-- 設定は アプリ全体に 1つ。`id boolean primary key default true` ＋ `check (id)` で、
-- 2行目を DBが 受けつけない。行が 増えると「どっちが 効いて いるのか」を
-- 画面から 判断できなく なる——鍵の 話で それは 起きて ほしくない。
--
-- ## DBは 全環境で 1つ
-- 本番も STG も 同じ DB を 見る（AGENTS.md）。**このスイッチ 1つで 両方に 効く**。
-- 逆に 言えば、STG で 外すと 本番でも 外れる。画面に その旨を 書いてある。

begin;

create table if not exists public.app_settings (
  -- 1行だけ。下の check と 合わせて 2行目を 作れなくする。
  id boolean primary key default true,
  -- 順路の 鍵を 外すか。true の あいだ、学習者は どの 教材も そのまま ひらける。
  gates_unlocked boolean not null default false,
  -- 誰が いつ 動かしたか。授業のあとに「なぜ 開いて いたのか」を たどれるようにする。
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings
  drop constraint if exists app_settings_single_row;
alter table public.app_settings
  add constraint app_settings_single_row check (id);

-- 行が 無いと 画面が 「読めなかった」のか「false」なのかを 区別できない。先に 置く。
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- きまりは 3つ。**読むのは 全員・変えるのは 先生だけ**。
--   1. ログインして いれば 読める（学習者の 教材の画面が 見て 鍵を 外すため）
--   2. 変えられるのは 先生だけ
--   3. 行を 増やせるのも 先生だけ（ふだんは 上の 1行が あるので 出番は 無い）
drop policy if exists app_settings_select_authenticated on public.app_settings;
create policy app_settings_select_authenticated on public.app_settings
  for select to authenticated using (true);

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin on public.app_settings
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists app_settings_insert_admin on public.app_settings;
create policy app_settings_insert_admin on public.app_settings
  for insert with check (public.is_admin());

comment on table public.app_settings is
  'アプリ全体の せってい。1行だけ。いまは 順路の 鍵を まとめて 外す スイッチのみ。';
comment on column public.app_settings.gates_unlocked is
  'true の あいだ 関門を 素通りさせる。既定 false。本番・STG は 同じ DB なので 両方に 効く。';

commit;
