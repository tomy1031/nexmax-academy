-- classmates: 同じ 学校・同じ 期の 学生を 引く（願い #285・4人で 遊ぶ ゲーム）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- 経緯: 「開発の工程」の ゲームは **同じ 学校かつ 同じ 期の 学生を 4人 えらぶ**
--   （2026-08-30 の 指定）。ところが profiles の RLS は
--     profiles_select_own_or_admin … using (auth.uid() = id or public.is_admin())
--   なので、**学習者が 名簿を 引くと 自分の 1行しか 返らない**。
--   このままでは えらぶ 画面が 空に なる。
--
-- どう 開けるか: ポリシーを ゆるめる のでは なく、**必要な 列だけを 返す 関数**を 足す。
--   ポリシーを「同じ 期なら 見える」に 広げると、`select *` で
--   email・answers・scores・is_admin まで 同級生に 渡って しまう。
--   ここでは id・表示名・性別・タイプ の 4つ だけを 返す——ゲームに 要るのは
--   「名前を えらぶ」と「その人の ネクマックスを 出す」の 2つ だけ。
--
-- security definer に するのは is_admin() と register_profile_on_signup() と 同じ 作法
--（自分の 行を 読むために profiles を 引くので、RLS の 再帰を 避ける）。

begin;

-- 何度 流しても 同じ 結果に なるように、先に 落としてから 作る。
drop function if exists public.classmates();

create or replace function public.classmates()
returns table (
  id uuid,
  display_name text,
  family_name text,
  given_name text,
  nickname text,
  gender text,
  personality_type text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.family_name,
    p.given_name,
    p.nickname,
    p.gender,
    p.personality_type
  from public.profiles as p
  join public.profiles as me on me.id = auth.uid()
  where
    -- 学校と 期が そろって いる 学生だけ。未設定（'' と 0）は 相手にも 自分にも 認めない
    -- ——0期生どうしが 全員 同級生に なって しまう。
    me.university in ('AUPP', 'CADT')
    and me.cohort between 1 and 5
    and p.university = me.university
    and p.cohort = me.cohort
    -- 講師・スタッフは 出さない（学習者の 名簿を 汚さない。src/lib/school.ts の STAFF_AFFILIATION）
    and p.university <> '講師・スタッフ'
  order by p.display_name, p.id
$$;

comment on function public.classmates() is
  '自分と 同じ 学校・同じ 期の 学生（自分を 含む）。ゲームの 4人えらびで 使う。'
  '返すのは id・なまえ・性別・タイプ だけ——email や answers は 同級生に 渡さない。';

-- ログインして いる 人だけが 呼べる。anon（ログイン前）には 渡さない。
revoke all on function public.classmates() from public;
revoke all on function public.classmates() from anon;
grant execute on function public.classmates() to authenticated;

commit;
