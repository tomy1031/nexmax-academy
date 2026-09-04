-- =====================================================================
-- NexmaxAcademy RLS（docs/design/03_リニューアル設計方針.md §3.3）
--
-- 原則:
--  - 学生は自分の行のみ。教師は自クラスの学生のみ。管理者は全件。
--  - ポリシーはすべて authenticated ロールに限定し、anon には何も許可しない。
--  - 再帰を避けるため、ロール判定は app スキーマの SECURITY DEFINER 関数で行う。
--  - 旧アプリの public.profiles / public.is_admin() には触れない（同居プロジェクト）。
-- =====================================================================

-- ── 判定ヘルパー ─────────────────────────────────────────────────────
create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.role = 'admin' from public.users u where u.id = (select auth.uid())),
    false
  );
$$;

create or replace function app.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.role = 'teacher' from public.users u where u.id = (select auth.uid())),
    false
  );
$$;

create or replace function app.my_class_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.class_id from public.users u where u.id = (select auth.uid());
$$;

-- 閲覧者が target 学生の担任か
create or replace function app.teaches(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.classes c on c.id = u.class_id
    where u.id = target and c.teacher_id = (select auth.uid())
  );
$$;

-- 閲覧者が当該クラスの担任か
create or replace function app.is_class_teacher(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = target_class and c.teacher_id = (select auth.uid())
  );
$$;

-- 閲覧者の所属クラスで当該ユニットが解錠済みか
create or replace function app.unit_unlocked(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_unlocks cu
    where cu.unit_id = target_unit and cu.class_id = app.my_class_id()
  );
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'app.is_admin()', 'app.is_teacher()', 'app.my_class_id()',
    'app.teaches(uuid)', 'app.is_class_teacher(uuid)', 'app.unit_unlocked(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end
$$;

-- ── ロール昇格の防止 ─────────────────────────────────────────────────
-- SECURITY INVOKER のままにして current_user で接続ロールを見分ける
-- （SECURITY DEFINER にすると current_user が所有者に化けて判定できない）。
create or replace function app.guard_user_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if (new.role is distinct from old.role or new.class_id is distinct from old.class_id)
     and not app.is_admin() then
    raise exception 'ロールとクラス所属の変更は管理者のみ許可されています';
  end if;

  return new;
end;
$$;

drop trigger if exists users_guard_role_change on public.users;
create trigger users_guard_role_change
  before update on public.users
  for each row execute function app.guard_user_role_change();

-- ── RLS 有効化 ───────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'classes', 'units', 'contents', 'class_unlocks', 'progress', 'attempts',
    'test_results', 'game_scores', 'artifacts', 'events', 'vocabulary', 'unit_vocabulary'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end
$$;

-- ── users ────────────────────────────────────────────────────────────
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or app.is_admin() or app.teaches(id));

drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert to authenticated
  with check ((id = (select auth.uid()) and role = 'student') or app.is_admin());

drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using (id = (select auth.uid()) or app.is_admin())
  with check (id = (select auth.uid()) or app.is_admin());

drop policy if exists users_delete on public.users;
create policy users_delete on public.users for delete to authenticated
  using (app.is_admin());

-- ── classes ──────────────────────────────────────────────────────────
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
  using (app.is_admin() or teacher_id = (select auth.uid()) or id = app.my_class_id());

drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes for insert to authenticated
  with check (app.is_admin() or (app.is_teacher() and teacher_id = (select auth.uid())));

drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes for update to authenticated
  using (app.is_admin() or teacher_id = (select auth.uid()))
  with check (app.is_admin() or teacher_id = (select auth.uid()));

drop policy if exists classes_delete on public.classes;
create policy classes_delete on public.classes for delete to authenticated
  using (app.is_admin());

-- ── units（メタ情報は全員読める。ロック中の🔒表示に必要） ────────────
drop policy if exists units_select on public.units;
create policy units_select on public.units for select to authenticated
  using (true);

drop policy if exists units_write on public.units;
create policy units_write on public.units for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ── contents（本体は解錠済みユニットのみ。教師・管理者は全件） ───────
drop policy if exists contents_select on public.contents;
create policy contents_select on public.contents for select to authenticated
  using (app.is_admin() or app.is_teacher() or app.unit_unlocked(unit_id));

drop policy if exists contents_write on public.contents;
create policy contents_write on public.contents for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ── class_unlocks（解錠は担任か管理者） ──────────────────────────────
drop policy if exists class_unlocks_select on public.class_unlocks;
create policy class_unlocks_select on public.class_unlocks for select to authenticated
  using (app.is_admin() or class_id = app.my_class_id() or app.is_class_teacher(class_id));

drop policy if exists class_unlocks_write on public.class_unlocks;
create policy class_unlocks_write on public.class_unlocks for all to authenticated
  using (app.is_admin() or app.is_class_teacher(class_id))
  with check (app.is_admin() or app.is_class_teacher(class_id));

-- ── 学習データ（自分の行のみ／担任は自クラス／管理者は全件） ─────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'progress', 'attempts', 'test_results', 'game_scores', 'artifacts'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (user_id = (select auth.uid()) or app.is_admin() or app.teaches(user_id))',
      t || '_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (user_id = (select auth.uid()) or app.is_admin())',
      t || '_insert', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (user_id = (select auth.uid()) or app.is_admin())
         with check (user_id = (select auth.uid()) or app.is_admin())',
      t || '_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (app.is_admin())',
      t || '_delete', t
    );
  end loop;
end
$$;

-- ── events（テレメトリは追記のみ。書き換えさせない） ─────────────────
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (user_id = (select auth.uid()) or app.is_admin() or app.teaches(user_id));

drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (app.is_admin());

-- ── 語彙（読みは全員・更新は管理者） ─────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['vocabulary', 'unit_vocabulary'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (app.is_admin()) with check (app.is_admin())',
      t || '_write', t
    );
  end loop;
end
$$;
