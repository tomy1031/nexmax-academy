-- 画面の エラーを `events` に 残す（本番の 見張り・2026-10-11）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- なぜ:
--   画面が 落ちても どこにも 記録が 無く、学習者や 先生の 申告で はじめて 分かって いた。
--   src/app/global-error.tsx が エラーの 要約（ページ・メッセージ・ログインの 有無）を
--   ブラウザから ここへ 1行 送る（src/lib/error-report.ts）。
--
-- 守る こと:
--   * **だれの エラーかは 残さない。** user_id は 空のまま（ログインの 有無だけ result に 入る）。
--     だから ログイン前の 画面（タイトル）の エラーも 残せる。
--   * **入れる だけ。** anon に 許すのは この 形の insert だけで、読む・直す・消すは 許さない。
--     読めるのは これまで どおり 管理者だけ（events_select は user_id が 空の 行を 学習者に 見せない）。
--   * **増えすぎない。** 端末ごとの 間引きは ブラウザ側。ここは 全体の ふた——
--     10分に 30行を 超えたら 黙って 捨てる（鍵は 公開なので、ブラウザを 通らない 連打にも 効く ように）。
--     古い 行は 14日で 消す。
--   * 見張りの Worker（workers/watch）が 読むのは **数だけ**（client_error_counts）。中身は 出さない。
--   * **道（object）は だれでも 書ける**ので、形を 絞る（/ で 始まる・空白や 制御文字なし・
--     種類は render／stale だけ）。知らせの 文に 混ぜる 側でも 消毒する（workers/watch）。
--   * ふた・片づけ・件数は **だれの でもない 行だけ**を 数える。ログイン中の 人が 自分の
--     user_id で 入れる 行（既存の events_insert）で ふたを 埋めさせない・件数に 混ぜない。
--
-- いま 動いて いる コードは events を 使って いない（0行）ので、先に 流して 壊れる ものは 無い。
-- 変える のは「not null を 外す」「insert の 許可を 足す」「関数・トリガーを 足す」だけ。

begin;

-- ── 1. だれの でもない 行を 置けるように する ──
alter table public.events alter column user_id drop not null;

create index if not exists events_client_error_at_idx
  on public.events (at desc) where verb = 'client_error' and user_id is null;

-- ── 2. 入れる だけを 許す（anon と ログイン中の 両方。送る ときは anon の 鍵で 送る）──
-- authenticated は 20260727013256 で すでに insert を 持って いる。足すのは anon だけ。
grant insert on table public.events to anon;

do $$
declare
  seq text := pg_get_serial_sequence('public.events', 'id');
begin
  -- identity の 番号を 取る 権利（無いと insert が 権限エラーに なる 版が ある）
  if seq is not null then
    execute format('grant usage on sequence %s to anon, authenticated', seq);
  end if;
end
$$;

drop policy if exists events_insert_client_error on public.events;
create policy events_insert_client_error on public.events for insert to anon, authenticated
  with check (
    verb = 'client_error'
    and user_id is null
    and unit_id is null
    and object is not null
    and char_length(object) <= 200
    and left(object, 1) = '/'
    and object !~ '[[:space:][:cntrl:]]'
    and jsonb_typeof(result) = 'object'
    and coalesce(result ->> 'kind', 'render') in ('render', 'stale')
    and octet_length(result::text) <= 2048
  );

-- ── 3. 全体の ふたと 片づけ（ブラウザを 通らない 連打にも 効く）──
create or replace function app.client_error_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 時刻は 送り手に 決めさせない（古い 日付で 埋められない ように）
  new.at := now();

  if (
    select count(*) from public.events e
    where e.verb = 'client_error' and e.user_id is null
      and e.at > now() - interval '10 minutes'
  ) >= 30 then
    return null; -- 黙って 捨てる（ブラウザ側は 送りっぱなしで 返事を 見ない）
  end if;

  delete from public.events e
  where e.verb = 'client_error' and e.user_id is null
    and e.at < now() - interval '14 days';

  return new;
end;
$$;

revoke all on function app.client_error_guard() from public;

drop trigger if exists events_client_error_guard on public.events;
create trigger events_client_error_guard
  before insert on public.events
  for each row
  when (new.verb = 'client_error' and new.user_id is null)
  execute function app.client_error_guard();

-- ── 4. 見張りが 読む 数（中身は 出さない）──
-- 返すのは ページと 種類ごとの 件数だけ。ページの パスは 公開の アプリの 道で、
-- メッセージ・ログインの 有無・時刻の 細かさは 出さない。見る 幅は 1〜60分に 丸める。
create or replace function public.client_error_counts(p_minutes integer default 15)
returns table (path text, kind text, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.object as path,
    coalesce(e.result ->> 'kind', 'render') as kind,
    count(*)::integer as n
  from public.events e
  where e.verb = 'client_error'
    and e.user_id is null
    and e.at > now() - make_interval(mins => least(greatest(coalesce(p_minutes, 15), 1), 60))
  group by 1, 2
  order by 3 desc, 1
  limit 20;
$$;

revoke all on function public.client_error_counts(integer) from public;
grant execute on function public.client_error_counts(integer) to anon, authenticated, service_role;

comment on function public.client_error_counts(integer) is
  '本番の 見張り（workers/watch）が 読む 画面の エラーの 件数。ページと 種類ごとの 数だけ 返す。';

commit;
