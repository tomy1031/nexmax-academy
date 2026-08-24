-- profiles: Googleログインした時点で「登録だけの行」を作る（2026-08-24 の指定）
-- 適用方法: Supabase ダッシュボード → SQL Editor に全文を貼り付けて Run
--
-- 経緯: 8/21 の授業では17人が診断に取り組んだのに、先生の画面に出たのは13人だった。
--   本番のログを見ると、その時間帯の保存リクエストは8件で**全部成功**していた
--   （失敗ゼロ）。つまり残らなかった人は保存を一度も送っていない。
--   20問の答えは最後のボタンを押すまでブラウザのメモリにしか無く、結果画面を見て
--   閉じた人は **ログインした事実すら** どこにも残らなかった（auth.users にしか居ない＝
--   先生からは存在が見えない）。
--
-- 直しは2つ。(1) アプリは20問目を答えた時点で保存する（src/components/welcome-wizard.tsx）。
-- (2) ここ——ログインの時点で profiles に行を作り、「登録はした／まだ診断していない」を
--     先生の画面に見せる。次の授業で「誰がまだか」が名簿で分かるようにする。
--
-- 未診断の行を許すために gender と personality_type の not null を外す。
-- 「診断が終わったか」の判定は元から answers 側（src/lib/profile.ts の isDiagnosisComplete /
-- src/lib/personality-stats.ts の hasCompletedPersonality）なので、null は下流で
-- 「未診断」として正しく落ちる。行の存在で判定してはいけないのは 07 §522 のとおり。

begin;

-- 1. 未診断の行を許す ------------------------------------------------------
alter table public.profiles alter column gender drop not null;
alter table public.profiles alter column personality_type drop not null;

-- CHECK は結果が NULL だと「違反していない」と扱われるため、null を許すのに
-- 張り替えは要らない。それでも書き直すのは、null が**想定内**だと残すため。
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female'));

alter table public.profiles drop constraint if exists profiles_personality_type_v3_check;
alter table public.profiles add constraint profiles_personality_type_v3_check
  check (
    personality_type is null
    or personality_type in (
      'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
      'INTJ', 'INTP', 'ENTJ', 'ENTP',
      'INFJ', 'INFP', 'ENFJ', 'ENFP',
      'ISTP', 'ISFP', 'ESTP', 'ESFP'
    )
  );

-- 2. 「答えがそろっているのに、タイプや性別が無い」行を作らせない ----------
--    null を許すのは**未診断のあいだだけ**。ここを開けたままにすると、集計が
--    「診断は済んでいるのに数えられない行」を抱えることになる。
--    answers と scores の対（空か20問か）は profiles_personality_v3_check が見ている。
alter table public.profiles drop constraint if exists profiles_answered_row_is_complete;
alter table public.profiles add constraint profiles_answered_row_is_complete
  check (
    answers = '[]'::jsonb
    or (personality_type is not null and gender is not null)
  );

-- 3. ログイン（auth.users への追加）で登録の行を作る ------------------------
--    security definer なので RLS を通り抜ける（既存の app.handle_new_academy_user と同じ作法）。
--    personality_version は既定値を持たない列なので、ここで明示的に 3 を書く（07 §8.1）。
--    なまえの3欄は空のままにする——Google の名前はローマ字で、カタカナしか通さない
--    profiles_names_katakana に弾かれるため。カタカナは学習者が /welcome で入れる。
create or replace function public.register_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, personality_version)
  values (new.id, coalesce(new.email, ''), 3)
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- 登録の失敗でログインそのものを止めない。ログインできなくなるほうが害が大きい。
    return new;
end;
$$;

drop trigger if exists profiles_register_on_signup on auth.users;
create trigger profiles_register_on_signup
  after insert on auth.users
  for each row execute function public.register_profile_on_signup();

-- 4. すでにログイン済みの人にも、登録の行を作る（取りこぼしの回収） --------
--    8/18・8/21 の授業でログインしたのに診断が残らなかった人が、これで名簿に出る。
--    **既存の行には触らない**（insert のみ。update / delete をしない）。
insert into public.profiles (id, email, personality_version)
select u.id, u.email, 3
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null
on conflict (id) do nothing;

commit;
