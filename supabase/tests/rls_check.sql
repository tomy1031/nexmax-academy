-- RLS の 許可・拒否を **本物の DB に 聞いて** 確かめる（2026-09-03）
--
-- なぜ 要るか:
--   移行SQL に RLS が 書いて あることと、**本番の DB で 効いて いる**ことは 別である。
--   `npm run check:migrations` は「流れたか」しか 見ない。ここは「効いて いるか」を 見る。
--   ブラウザから Supabase を 直に 呼ぶ 使い方（教材ページの クライアント化）では、
--   送る 中身は 利用者が 書きかえられる ので、**RLS だけが 境界**に なる。
--
-- 何を するか:
--   1. 管理者でない 学習者を 2人 えらぶ（多い順。**id は 出さない**）
--   2. その 1人に なりすます（`set local role authenticated` ＋ JWT の sub）
--   3. 許可（自分のは 見える・書ける）と 拒否（他人のは 見えない・書けない）を 数える
--
-- 安全のきまり:
--   * ぜんぶ **1つの トランザクション**の 中で 行い、最後に `rollback` する
--   * 書き込みの 試しは **拒否されるはずの 向き**だけ（通って しまっても 巻き戻る）
--   * 書きかえの 試しは **中身の 変わらない 更新**（`x = x`）にする
--   * 学習者の 名前・メールは 読まない。数だけ を 見る
--
-- 走らせかた:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_check.sql
--   （`node scripts/check_rls.mjs` が これを 呼ぶ。鍵が 無ければ 正直に そう言う）

begin;

-- ── 1. 被験者と 期待値を 先に 取る（ここは まだ 管理者の 目で 読む）──
select set_config('app.me', (
  select p.id::text from public.profiles p
  where coalesce(p.is_admin, false) = false
  order by (select count(*) from public.quiz_results q where q.profile_id = p.id) desc, p.id
  limit 1
), true);

select set_config('app.other', (
  select p.id::text from public.profiles p
  where coalesce(p.is_admin, false) = false
  order by (select count(*) from public.quiz_results q where q.profile_id = p.id) desc, p.id
  offset 1 limit 1
), true);

select set_config('app.my_quiz', (
  select count(*)::text from public.quiz_results
  where profile_id = nullif(current_setting('app.me', true), '')::uuid
), true);

select set_config('app.other_quiz', (
  select count(*)::text from public.quiz_results
  where profile_id = nullif(current_setting('app.other', true), '')::uuid
), true);

select set_config('app.published', (
  select count(*)::text from public.studio_contents where status = 'published'
), true);

select set_config('app.all_studio', (select count(*)::text from public.studio_contents), true);

-- ── 2. その 学習者に なりすます ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.me', true), 'role', 'authenticated')::text,
  true
);

-- ── 3. 許可と 拒否を 数える ──
do $$
declare
  me        uuid := nullif(current_setting('app.me', true), '')::uuid;
  other     uuid := nullif(current_setting('app.other', true), '')::uuid;
  my_quiz   int  := coalesce(nullif(current_setting('app.my_quiz', true), '')::int, 0);
  other_quiz int := coalesce(nullif(current_setting('app.other_quiz', true), '')::int, 0);
  published int  := coalesce(nullif(current_setting('app.published', true), '')::int, 0);
  all_studio int := coalesce(nullif(current_setting('app.all_studio', true), '')::int, 0);
  bad int := 0;
  n   int;

  procedure_note text;
begin
  if me is null or other is null then
    raise notice 'ℹ 学習者が 2人 いないので 見送ります（空の DB では ふつうの こと）';
    return;
  end if;

  if is_admin() then
    bad := bad + 1;
    raise warning '✗ 前提: えらんだ 被験者が 管理者だった（管理者は 全部 見えるので 検査に ならない）';
  else
    raise notice '✓ 前提: 被験者は 管理者では ない';
  end if;

  -- 許可 ── 自分の ぶんは 見える
  n := (select count(*) from public.quiz_results);
  if n = my_quiz then raise notice '✓ 許可 自分の quiz_results が 見える（% 件）', n;
  else bad := bad + 1; raise warning '✗ 許可 自分の quiz_results: % 件（期待 %）', n, my_quiz; end if;

  n := (select count(*) from public.profiles);
  if n = 1 then raise notice '✓ 許可 自分の profiles だけが 見える（1 件）';
  else bad := bad + 1; raise warning '✗ profiles が % 件 見えている（期待 1）', n; end if;

  -- 拒否 ── 他人の ぶんは 見えない
  n := (select count(*) from public.quiz_results where profile_id = other);
  if n = 0 then raise notice '✓ 拒否 他人の quiz_results は 見えない（本当は % 件 ある）', other_quiz;
  else bad := bad + 1; raise warning '✗ 他人の quiz_results が % 件 見えている', n; end if;

  n := (select count(*) from public.profiles where id = other);
  if n = 0 then raise notice '✓ 拒否 他人の profiles は 見えない';
  else bad := bad + 1; raise warning '✗ 他人の profiles が 見えている'; end if;

  n := (select count(*) from public.personality_results where profile_id = other);
  if n = 0 then raise notice '✓ 拒否 他人の personality_results は 見えない';
  else bad := bad + 1; raise warning '✗ 他人の personality_results が % 件 見えている', n; end if;

  n := (select count(*) from public.meeting_turn_logs where profile_id = other);
  if n = 0 then raise notice '✓ 拒否 他人の meeting_turn_logs は 見えない';
  else bad := bad + 1; raise warning '✗ 他人の meeting_turn_logs が % 件 見えている', n; end if;

  n := (select count(*) from public.quest_saves where not (me = any(member_ids)));
  if n = 0 then raise notice '✓ 拒否 仲間で ない quest_saves は 見えない';
  else bad := bad + 1; raise warning '✗ 仲間で ない quest_saves が % 件 見えている', n; end if;

  -- 教材は 公開ぶんだけ
  n := (select count(*) from public.studio_contents);
  if n = published then raise notice '✓ 教材は 公開ぶんだけ 見える（%/% 件）', n, all_studio;
  else bad := bad + 1; raise warning '✗ studio_contents が % 件 見えている（公開は % 件）', n, published; end if;

  -- 拒否 ── 他人の ぶんは 書きかえられない（中身の 変わらない 更新で 試す）
  with tried as (
    update public.quiz_results set answer_text = answer_text where profile_id = other returning 1
  ) select count(*) into n from tried;
  if n = 0 then raise notice '✓ 拒否 他人の quiz_results は 書きかえられない';
  else bad := bad + 1; raise warning '✗ 他人の quiz_results を % 行 書きかえられた', n; end if;

  with tried as (
    update public.profiles set updated_at = updated_at where id = other returning 1
  ) select count(*) into n from tried;
  if n = 0 then raise notice '✓ 拒否 他人の profiles は 書きかえられない';
  else bad := bad + 1; raise warning '✗ 他人の profiles を % 行 書きかえられた', n; end if;

  -- 拒否 ── 他人の 名前で 保存できない（通っても この 副トランザクションが 巻き戻す）
  begin
    insert into public.quiz_results (profile_id, quiz_set_id, question_id, question_type, correct, attempt_id)
    values (other, '__rls_probe__', '__rls_probe__', 'choice', false, gen_random_uuid());
    bad := bad + 1;
    raise warning '✗ 他人の profile_id で quiz_results に 保存できた';
  exception when insufficient_privilege then
    raise notice '✓ 拒否 他人の profile_id では 保存できない（42501）';
  end;

  begin
    insert into public.personality_results (profile_id) values (other);
    bad := bad + 1;
    raise warning '✗ 他人の profile_id で personality_results に 保存できた';
  exception
    when insufficient_privilege then
      raise notice '✓ 拒否 他人の profile_id では personality_results に 保存できない（42501）';
    when others then
      get stacked diagnostics procedure_note = message_text;
      raise notice 'ℹ personality_results の 保存は 別の 理由で 止まった: %', procedure_note;
  end;

  if bad > 0 then
    raise exception 'RLS の 検査で % 件 だめでした（上の ✗ を 見てください）', bad;
  end if;
  raise notice '── RLS の 検査は ぜんぶ 通りました ──';
end $$;

rollback;
