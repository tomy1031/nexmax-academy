-- profiles: なまえを「苗字・名前・先生に呼んでほしい名前」に分ける（願い #14）
-- 適用方法: Supabase ダッシュボード → SQL Editor にこのファイル全文を貼り付けて Run
--
-- display_name は消さない。マップの右上・先生の画面・CSV・会話の話者名がこの列を見ているため、
-- 「呼び名（呼んでほしい名前 → 無ければ名前）」を入れる列として残し、アプリが組み立てて書く
-- （src/lib/name.ts の buildDisplayName）。

alter table public.profiles
  add column if not exists family_name text not null default '',
  add column if not exists given_name text not null default '',
  add column if not exists nickname text not null default '';

comment on column public.profiles.family_name is '苗字（カタカナ）。カンボジアは苗字が先。';
comment on column public.profiles.given_name is '名前（カタカナ）。';
comment on column public.profiles.nickname is '先生に呼んでほしい名前（カタカナ・任意）。';
comment on column public.profiles.display_name is '呼び名。nickname → given_name の順でアプリが組み立てる。';

-- カタカナ（長音符・中点・語間のスペース）だけを受ける。
-- 空文字を許すのは、分けて持つ前に作られた行を残すため（入れ直しはアプリが案内する）。
-- クライアントの正は src/lib/name.ts。ここは最後の砦。
alter table public.profiles
  drop constraint if exists profiles_names_katakana;

alter table public.profiles
  add constraint profiles_names_katakana check (
    family_name ~ '^[ァ-ヶーヴ・ 　]*$'
    and given_name ~ '^[ァ-ヶーヴ・ 　]*$'
    and nickname ~ '^[ァ-ヶーヴ・ 　]*$'
    and length(family_name) <= 20
    and length(given_name) <= 20
    and length(nickname) <= 20
  );
