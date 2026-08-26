-- profiles: 所属に「講師・スタッフ」を足し、管理者フラグを先生の画面から変えられるようにする（願い #153-5/6）
-- 適用: main へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- 何度流しても同じ結果になるように書く（既存マイグレーションの作法）。

-- 1) 所属 ------------------------------------------------------------------
-- 学校ではない所属を1つだけ許す。学習者の画面には出さず、先生の画面（ユーザー管理）
-- だけが付けられる（選べる値の台帳は src/lib/school.ts）。
alter table public.profiles
  drop constraint if exists profiles_university_known;

alter table public.profiles
  add constraint profiles_university_known
  check (university in ('', 'AUPP', 'CADT', '講師・スタッフ'));

comment on column public.profiles.university is '所属。AUPP / CADT / 講師・スタッフ。空文字は未設定（列を足す前の行）。';

-- 2) 管理者フラグ ----------------------------------------------------------
-- これまで enforce_profile_identity() は、更新のたびに メール2件の決め打ちで
-- is_admin を上書きしていた。そのため先生の画面で「はい」に変えても、保存した
-- 瞬間に false へ戻っていた（画面から管理者を増やす道が無かった）。
--
-- 決め打ちを捨てるのではなく、次の3つに分ける:
--   ・種の2メールは **常に** 管理者（自分をロックアウトできない）
--   ・新しい行は必ず false（作った本人が自分を管理者にはできない）
--   ・それ以外の更新は「いま管理者である人が出した更新」のときだけ申告値を受け取る
--     （管理者でない人の更新は前の値を保つ＝自分で昇格できない）
create or replace function public.enforce_profile_identity()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  u_email text;
  seed_admin boolean;
begin
  select email into u_email from auth.users where id = new.id;
  if u_email is not null then
    new.email := u_email;
  end if;

  seed_admin := coalesce(u_email, new.email) in ('tomy1031@gmail.com', 's.tominaga@nextmake.co.jp');

  if seed_admin then
    new.is_admin := true;
  elsif tg_op = 'INSERT' then
    new.is_admin := false;
  elsif not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- トリガー本体は既存のまま（before insert or update）。念のため張り直す。
drop trigger if exists profiles_identity on public.profiles;
create trigger profiles_identity
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_identity();
