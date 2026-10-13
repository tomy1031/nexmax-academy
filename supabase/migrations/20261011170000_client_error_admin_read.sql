-- ブラウザで起きたエラー（events の client_error）を、管理画面の管理者が読めるようにする（2026-10-11）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- なぜ:
--   20261011150000 で記録は入るようになったが、読めるのは events_select の app.is_admin()
--   （public.users の role）だけだった。このアプリの管理者は public.profiles.is_admin で決まり
--   （public.is_admin()・5人）、public.users の admin は 0人。つまり管理画面のエラーログから
--   誰も読めなかった（2026-10-11 に本番の DB で数えて確認）。
--
-- 足すのは読む許可 1つだけ。だれのでもない client_error の行に限る。学習者の行や
-- ほかの verb の見え方は変えない。

begin;

drop policy if exists events_select_client_error_admin on public.events;
create policy events_select_client_error_admin on public.events for select to authenticated
  using (verb = 'client_error' and user_id is null and public.is_admin());

commit;
