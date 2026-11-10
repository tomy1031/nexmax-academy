-- 管理者の判定から「メールアドレスの直書き」を外す。管理者は profiles.is_admin だけで決める。
--
-- なぜ:
--   20260824050601 版の enforce_profile_identity は、メールアドレス2つを
--   「いつでも管理者」に固定していた（seed_admin）。このリポジトリは公開なので、
--   管理者のログインIDをコードに書かない。is_admin 列を先生の画面から切り替える
--   仕組み（#153-5/6）は 20260821100000 から既にあり、この2人も DB 上で
--   is_admin = true になっている（2026-11-10 に確認。管理者は5人）。
--
-- 変わること:
--   上の2人も、ほかの管理者と同じく「先生の画面で外せば外れる」ようになる。
--   全員の管理者を外してしまったときは、SQL で is_admin を true に戻す。
--
-- 変わらないこと:
--   新規登録は is_admin = false。管理者でない人は is_admin を変えられない。
--   email / updated_at をトリガーで強制するのも同じ。トリガー（profiles_identity）は張り直さない。

create or replace function public.enforce_profile_identity()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  u_email text;
begin
  select email into u_email from auth.users where id = new.id;
  if u_email is not null then
    new.email := u_email;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
  elsif not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
