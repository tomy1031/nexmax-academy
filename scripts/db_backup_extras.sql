-- db_backup_extras — `supabase db dump` が 落とす 2つを、SQL の 形で 書き出す。
--
-- 本番DBに 対して **読み取り だけ**で 走る（下の set transaction read only）。
-- 出力（psql -X -q -A -t）が そのまま 復元用の extras.sql に なる。
-- 使いかたは .github/workflows/backup.yml、戻しかたは docs/backup-recovery.md。
--
-- なぜ 要るか:
--   1. **移行の 台帳**（supabase_migrations.schema_migrations）。CLI は この スキーマを
--      「Supabase の もの」と して 書き出さない。台帳が 無い まま 戻すと、
--      「デプロイ（DB）」が 54本 全部を 流し直そうと して 落ち、本番デプロイの
--      関所（check_migrations）も「DBが 遅れて いる」と 止める（docs/deploy.md §0.8）。
--   2. **auth.users に 付けた トリガー**（ログインした 人を public.users・profiles に
--      登録する 2本）。表が auth に ある ので、トリガーごと 書き出しから 落ちる。
--      戻した DB で これが 無いと、**新しく ログインした 人が 名簿に 出ない**
--      ——2026-08-26 に 7人が 名簿から 消えた のと 同じ 形の 事故に なる。

set transaction read only;

-- 名前を 必ず スキーマ付きで 出させる（pg_get_triggerdef は 見える 名前を 省く）。
set local search_path = pg_catalog;

select '-- extras.sql — scripts/db_backup_extras.sql が 本番から 書き出した もの';
select '-- 1. 移行の 台帳（列は supabase CLI が あとから 足す。ここでは 版と 名前だけ）';
select 'create schema if not exists supabase_migrations;';
select 'create table if not exists supabase_migrations.schema_migrations (version text not null primary key);';
select 'alter table supabase_migrations.schema_migrations add column if not exists name text;';
select format(
  'insert into supabase_migrations.schema_migrations (version, name) values (%L, %L) on conflict (version) do nothing;',
  version,
  name
)
from supabase_migrations.schema_migrations
order by version;

select '-- 2. auth の 表に 付けた トリガー';
select regexp_replace(pg_get_triggerdef(t.oid), '^CREATE TRIGGER', 'CREATE OR REPLACE TRIGGER') || ';'
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth'
  and not t.tgisinternal
order by c.relname, t.tgname;
