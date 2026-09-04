-- =====================================================================
-- NexmaxAcademy コアスキーマ（フェーズ1 / docs/design/03_リニューアル設計方針.md §3.2）
--
-- 前提と注意:
--  - この Supabase プロジェクトは旧アプリ（nextmake_onbording）と同居している。
--    旧アプリの public.profiles / public.is_admin() / profiles_identity トリガには触れない。
--  - 衝突回避のため、本アプリのヘルパー関数はすべて app スキーマに置く（Data API 非公開）。
--  - RLS の有効化とポリシーは後続の *_academy_rls_policies.sql で定義する。
-- =====================================================================

create schema if not exists app;
comment on schema app is 'NexmaxAcademy の内部ヘルパー（RLS補助関数など）。Data API には公開しない。';

grant usage on schema app to authenticated, service_role;

-- ── 列挙型 ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'user_role') then
    create type public.user_role as enum ('student', 'teacher', 'admin');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'unit_type') then
    create type public.unit_type as enum ('lecture', 'listening', 'game', 'live', 'wordstage');
  end if;
end
$$;

-- ── 共通トリガ関数 ───────────────────────────────────────────────────
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── users（auth.users に 1:1。ロールとクラス所属を持つ） ─────────────
create table if not exists public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.user_role not null default 'student',
  name       text not null default '',
  class_id   uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.users is '学習者・教師・管理者。id は auth.users.id と同一。';
comment on column public.users.role is 'student / teacher / admin。昇格は管理者のみ（app.guard_user_role_change）。';

-- ── classes（クラス。teacher_id は担任） ─────────────────────────────
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  teacher_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.classes is 'クラス。教師は自クラスの学生データのみ参照できる（RLS）。';

-- users.class_id の外部キーは classes 作成後に付ける（相互参照のため）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_class_id_fkey') then
    alter table public.users
      add constraint users_class_id_fkey
      foreign key (class_id) references public.classes (id) on delete set null;
  end if;
end
$$;

create index if not exists users_class_id_idx on public.users (class_id);
create index if not exists classes_teacher_id_idx on public.classes (teacher_id);

-- ── units / contents（教材ユニットとスキーマ準拠コンテンツ本体） ─────
create table if not exists public.units (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  type           public.unit_type not null,
  schema_version integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.units is '教材ユニットのメタ情報。本体は contents.data（zodスキーマ準拠）。';

create table if not exists public.contents (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.units (id) on delete cascade,
  version    integer not null default 1,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, version)
);
comment on table public.contents is 'コンテンツ本体（src/content/schema.ts のスキーマ準拠 JSON）。';

create index if not exists contents_unit_id_idx on public.contents (unit_id);

-- ── class_unlocks（教師によるユニット解錠） ──────────────────────────
create table if not exists public.class_unlocks (
  class_id    uuid not null references public.classes (id) on delete cascade,
  unit_id     uuid not null references public.units (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  by          uuid references public.users (id) on delete set null,
  primary key (class_id, unit_id)
);
comment on table public.class_unlocks is 'クラス単位のユニット解錠。学生は解錠済みユニットの contents のみ読める。';

create index if not exists class_unlocks_unit_id_idx on public.class_unlocks (unit_id);

-- ── 学習データ ───────────────────────────────────────────────────────
create table if not exists public.progress (
  user_id    uuid not null references public.users (id) on delete cascade,
  unit_id    uuid not null references public.units (id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);
comment on table public.progress is 'ユニットごとの進捗（再開位置など）。localStorage の置換先。';

create index if not exists progress_unit_id_idx on public.progress (unit_id);

create table if not exists public.attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  unit_id     uuid not null references public.units (id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  summary     jsonb not null default '{}'::jsonb
);
comment on table public.attempts is '1回の挑戦（開始〜終了）。summary に所要時間・ヒント回数などを入れる。';

create index if not exists attempts_user_unit_idx on public.attempts (user_id, unit_id);

create table if not exists public.test_results (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  score   integer not null,
  passed  boolean not null default false,
  at      timestamptz not null default now()
);
comment on table public.test_results is 'テスト結果。旧GASスプレッドシートの成績の移行先（03 §3.3）。';

create index if not exists test_results_user_unit_idx on public.test_results (user_id, unit_id);

create table if not exists public.game_scores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  unit_id    uuid not null references public.units (id) on delete cascade,
  stars      integer not null default 0 check (stars between 0 and 3),
  best       integer not null default 0,
  plays      integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, unit_id)
);
comment on table public.game_scores is 'ゲーム系ユニットの星・ベストスコア・プレイ回数。';

create table if not exists public.artifacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  unit_id    uuid not null references public.units (id) on delete cascade,
  kind       text not null,
  body       text not null default '',
  created_at timestamptz not null default now()
);
comment on table public.artifacts is '学習者の産出物（自由入力・音声書き起こしなど）。kind で種別を区別する。';

create index if not exists artifacts_user_unit_idx on public.artifacts (user_id, unit_id);

create table if not exists public.events (
  id      bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  verb    text not null,
  object  text,
  result  jsonb not null default '{}'::jsonb,
  at      timestamptz not null default now()
);
comment on table public.events is 'テレメトリ（検収パイプライン第4段のつまずきレポート入力・03 §4）。';

create index if not exists events_user_at_idx on public.events (user_id, at desc);
create index if not exists events_unit_at_idx on public.events (unit_id, at desc);

-- ── 語彙 ─────────────────────────────────────────────────────────────
create table if not exists public.vocabulary (
  id         uuid primary key default gen_random_uuid(),
  term       text not null,
  reading    text not null default '',
  meaning_en text not null default '',
  jlpt_level text check (jlpt_level in ('N5', 'N4', 'N3', 'N2', 'N1')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term, reading)
);
comment on table public.vocabulary is 'ポップアップ辞書・語彙計測の元データ（旧 vocabularyData 280語の移行先）。';

create table if not exists public.unit_vocabulary (
  unit_id       uuid not null references public.units (id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary (id) on delete cascade,
  primary key (unit_id, vocabulary_id)
);
comment on table public.unit_vocabulary is 'ユニットと語彙の対応（新出語数の計測に使う）。';

create index if not exists unit_vocabulary_vocabulary_id_idx on public.unit_vocabulary (vocabulary_id);

-- ── updated_at 自動更新 ──────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'classes', 'units', 'contents', 'progress', 'game_scores', 'vocabulary'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function app.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end
$$;

-- ── サインアップ時に public.users 行を用意する ───────────────────────
-- 注意: この Supabase は旧アプリと同居しているため、このトリガは旧アプリ経由の
-- サインアップでも発火する（public.users に student 行が1件増えるだけ）。
-- 認証を絶対に止めないよう、例外は握りつぶして signup を継続させる。
create or replace function app.handle_new_academy_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_academy on auth.users;
create trigger on_auth_user_created_academy
  after insert on auth.users
  for each row execute function app.handle_new_academy_user();

-- 既存の認証ユーザー（同居する旧アプリのユーザーを含む）を取り込む
insert into public.users (id, name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), '')
from auth.users u
on conflict (id) do nothing;
