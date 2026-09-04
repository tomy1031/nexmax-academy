alter table public.profiles
  add column if not exists family_name text not null default '',
  add column if not exists given_name text not null default '',
  add column if not exists nickname text not null default '';

comment on column public.profiles.family_name is '苗字（カタカナ）。カンボジアは苗字が先。';
comment on column public.profiles.given_name is '名前（カタカナ）。';
comment on column public.profiles.nickname is '先生に呼んでほしい名前（カタカナ・任意）。';
comment on column public.profiles.display_name is '呼び名。nickname → given_name の順でアプリが組み立てる。';

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
