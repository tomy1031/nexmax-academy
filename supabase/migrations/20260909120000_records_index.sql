-- 学習の きろく（/admin/records）を 先に 絞れるようにする ための 2つ（2026-09-09 の 指定・願い #346）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- ## 1. record_index —— 「どこに 記録が あるか」の 見取り図
--
-- 先生の 画面は これまで **種類を 先に えらばせて**いた（進み具合／もんだい／…）。
-- 先に 決めたいのは 誰の・どこの であって 種類では ない、という 指定を 受けて、
-- 絞り込みを 先に 置く。そのとき 画面が 知りたい ことが 2つ 出る:
--
--   * 単元の 一覧から **記録の 無い 教材を 落とす**（いまは 教材 82本ぜんぶが 並ぶ）
--   * その 絞り込みで **どの 種類に 記録が あるか**（無い 種類の ボタンを 出さない）
--
-- 素の 表を 数えに 行く 道は 採らない。画面は 新しい ほうから 2000行までしか 読まない
-- ので、`quiz_results` は すでに 1933行 —— **もうすぐ 上限に 当たる**。当たった 日から、
-- 古い 教材が 一覧から 黙って 消える（先生には「その 教材の 記録が 無い」に 見える）。
-- 数えるのは DB の 仕事に する。
--
-- 返るのは (種類, 学生, 教材) ごとに 1行だけ なので、学期を 通しても 数千行に とどまる。
--
-- `security_invoker = true` が 要（PG15+）。これが 無いと 見取り図は **作った 人の 目**で
-- 走り、学習者が 自分の 画面から 全員ぶんの 記録の ありかを 数えられて しまう。
-- 付けて あれば 素の 表の RLS が そのまま 効く（学習者＝自分のぶん・先生＝全員ぶん）。
--
-- ## 2. meeting_turn_logs.ask —— 会話の **元の しつもん**
--
-- 「会話に関しては、元の質問（AIが生徒に確認する内容）も表示して欲しい」（同日の 指定）。
-- いまは 記録に `question_id` しか 無く、
--   * ヘンディさんの ミーティング … 教材から 引き直せる（`questions[].ask`）
--   * 松井社長の たいわ（talk-game） … `talk:talk` の ような **ばん**で、しつもんは
--     AI が その場で 作る ので **どこにも 残って いない**
-- 後者が 引けない。列を 足して、これから の 記録では 話した とおりの 文を 残す。
-- 古い 行は 空 —— 画面は 教材から 引き直す 道に 落ちる（迷子に しない）。
--
-- 既定つきの 列を 足すだけなので、いま 本番で 動いて いる コードは 壊れない。

begin;

alter table public.meeting_turn_logs
  add column if not exists ask text not null default '';

comment on column public.meeting_turn_logs.ask is
  'AIが 学生に 聞いた 文そのもの。空 = この 列より 前の 記録（教材から 引き直す）。';

create or replace view public.record_index
with (security_invoker = true) as
select
  kind,
  profile_id,
  unit_id,
  sum(n)::bigint as n
from (
  select 'progress'::text as kind, profile_id, content_id as unit_id, count(*) as n
    from public.content_progress group by profile_id, content_id
  union all
  select 'quiz'::text, profile_id, quiz_set_id, count(*)
    from public.quiz_results group by profile_id, quiz_set_id
  union all
  -- ことばは 明細（1語1行）と 成績の 2つの 表に 分かれて いる。画面では 1つの 種類。
  select 'word'::text, profile_id, stage_id, count(*)
    from public.word_test_answers group by profile_id, stage_id
  union all
  select 'word'::text, profile_id, stage_id, count(*)
    from public.word_test_results group by profile_id, stage_id
  union all
  -- 会話も ミーティング（ヘンディさん・松井社長）と たいわ（お客さま）で 表が ちがう。
  select 'talk'::text, profile_id, meeting_id, count(*)
    from public.meeting_turn_logs group by profile_id, meeting_id
  union all
  select 'talk'::text, profile_id, talk_id, count(*)
    from public.talk_turn_logs group by profile_id, talk_id
  union all
  select 'listening'::text, profile_id, listening_id, count(*)
    from public.listening_results group by profile_id, listening_id
) counted
group by kind, profile_id, unit_id;

comment on view public.record_index is
  '学習の きろくの 見取り図。(種類, 学生, 教材) ごとの 件数だけ。中身は 持たない。'
  ' security_invoker なので 素の 表の RLS が そのまま 効く（学習者は 自分のぶんだけ）。';

-- 読めるのは ログインした 人だけ。件数だけ とはいえ「誰が 何を やったか」なので anon には 出さない。
revoke all on public.record_index from anon;
grant select on public.record_index to authenticated;

commit;
