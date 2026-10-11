-- 初回の合否を学習者の画面とそろえる（2026-10-11・要望 #599 のレビューの直し）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- 学習者の画面は、もんだいの合否を「正解した問題の数 ÷ 答えた問題の数」を四捨五入した割合で
-- 決めている（src/components/quiz/quiz-reducer.ts。2026-08-19 の指定「何問中何問正解の何％か」）。
-- learner_quiz_first は点（earned / max_points）しか返しておらず、2点・3点の問題を含むセットで
-- 合否が食い違っていた（例: 2点の問題4問だけ正解 → 学習者には 4/9=44% で不合格、一覧では 8/13=62%）。
--
-- 正解数と問題数を列の最後に足す。create or replace view は列を後ろに足すことだけができるので、
-- いまの列（点）はそのまま残す＝いま本番で動いているコードは壊れない。

begin;

create or replace view public.learner_quiz_first
with (security_invoker = true) as
with attempts as (
  select profile_id, quiz_set_id, attempt_id,
         min(created_at) as at,
         sum(earned)::int as score,
         sum(max_points)::int as max_score,
         count(*) filter (where correct)::int as correct_count,
         count(*)::int as question_count
    from public.quiz_results
   where full_set
   group by profile_id, quiz_set_id, attempt_id
),
ranked as (
  select attempts.*,
         row_number() over (partition by profile_id, quiz_set_id order by at, attempt_id) as nth,
         count(*) over (partition by profile_id, quiz_set_id) as runs
    from attempts
)
select profile_id, quiz_set_id,
       score as first_score,
       max_score as first_max,
       at as first_at,
       runs::int as runs,
       correct_count as first_correct,
       question_count as first_questions
  from ranked
 where nth = 1;

comment on view public.learner_quiz_first is
  'もんだいセットの初回（丸ごと通した回のいちばん古い回）。1人×1セットで1行。合否は first_correct / first_questions を'
  '四捨五入した割合で、学習者の画面と同じ式で画面が決める。security_invoker。';

commit;
