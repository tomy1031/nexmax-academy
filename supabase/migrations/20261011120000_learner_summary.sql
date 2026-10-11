-- 学習の きろく（/admin/records）に「生徒の 一覧」を 置く ための 2つの view（2026-10-11・願い #599）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- ## なぜ 要るか
--
-- 先生が まず 知りたいのは「どの 生徒に フォローが 要るか」と「全体の 進み」で、
-- 教材ごとの 行では ない（「そもそも進捗は各教材ごとよりも全体で把握できれば良い」）。
-- 1人ずつの まとめを 画面で 数えると、生の 行を 新しい ほうから 2000行までしか 読めない
-- ので **学期の 途中で 古い 記録が 黙って 数から 消える**（もんだいの 回答は もう 3,500行）。
-- 数えるのは DB の 仕事に する（record_index と 同じ 考え）。
--
-- ## 1. learner_summary —— 1人 1行
--   * 終えた 教材の id（全体の 進みは 画面が ステージの 台帳と 照らして 数える。
--     どの 教材が どの ステージかは 教材の 側に しか 無いので、ここでは 持たない）
--   * ことばの テスト: 受けた セット数・合格した セット数・**足ぶみ**の セット数
--     （同じ テストで 3回 以上 不合格の まま。2026-10-11 の 指定）
--   * 会話: 評価の ついた 発言数と miss の 数（つまずきの 印は 画面が 割合で 決める）
--   * 修了証の 数（生徒の 行の 印 🎓。修了証は 結果の 印で 主役では ない）
--   * 最後に 動いた 時刻
--
-- ## 2. learner_quiz_first —— 1人 × 1もんだいセットで 1行
--   **初回の 点**。2回目 以降の 満点で 1回目の つまずきが 隠れない ように、
--   丸ごと 通した 回（full_set）の いちばん 古い 回を 返す。合格ラインは 教材の 側に
--   あるので、合否は 画面が 決める。
--
-- どちらも `security_invoker = true`。素の 表の RLS が そのまま 効く
-- （学習者＝自分のぶん・先生＝全員ぶん）。付けないと 作った 人の 目で 走り、
-- 学習者が 全員ぶんの まとめを 読めて しまう。
--
-- view を 足すだけ なので、いま 本番で 動いて いる コードは 壊れない。

begin;

create or replace view public.learner_summary
with (security_invoker = true) as
with prog as (
  select profile_id,
         array_agg(content_id order by content_id) filter (where status = 'completed') as completed_ids,
         max(updated_at) as last_at
    from public.content_progress
   group by profile_id
),
word_sets as (
  select profile_id, stage_id,
         bool_or(coalesce(passed, false)) as ever_passed,
         count(*) filter (where passed is not true) as fails,
         max(created_at) as last_at
    from public.word_test_results
   where mode = 'test'
   group by profile_id, stage_id
),
word as (
  select profile_id,
         count(*) as word_sets,
         count(*) filter (where ever_passed) as word_passed_sets,
         count(*) filter (where not ever_passed and fails >= 3) as word_stuck_sets,
         max(last_at) as last_at
    from word_sets
   group by profile_id
),
talk as (
  select profile_id,
         count(*) filter (where grade is not null) as talk_graded,
         count(*) filter (where grade = 'miss') as talk_miss,
         max(created_at) as last_at
    from public.meeting_turn_logs
   group by profile_id
),
quiz as (
  select profile_id, max(created_at) as last_at
    from public.quiz_results
   group by profile_id
),
cert as (
  select profile_id, count(*) as certificates
    from public.completion_certificates
   group by profile_id
)
select p.id as profile_id,
       coalesce(prog.completed_ids, '{}'::text[]) as completed_ids,
       coalesce(word.word_sets, 0)::int as word_sets,
       coalesce(word.word_passed_sets, 0)::int as word_passed_sets,
       coalesce(word.word_stuck_sets, 0)::int as word_stuck_sets,
       coalesce(talk.talk_graded, 0)::int as talk_graded,
       coalesce(talk.talk_miss, 0)::int as talk_miss,
       coalesce(cert.certificates, 0)::int as certificates,
       greatest(prog.last_at, word.last_at, talk.last_at, quiz.last_at) as last_at
  from public.profiles p
  left join prog on prog.profile_id = p.id
  left join word on word.profile_id = p.id
  left join talk on talk.profile_id = p.id
  left join quiz on quiz.profile_id = p.id
  left join cert on cert.profile_id = p.id;

comment on view public.learner_summary is
  '学習の きろくの 生徒の 一覧。1人 1行（終えた 教材・ことばの 合格と 足ぶみ・会話の miss・修了証の 数）。'
  ' security_invoker なので 素の 表の RLS が そのまま 効く。';

create or replace view public.learner_quiz_first
with (security_invoker = true) as
with attempts as (
  select profile_id, quiz_set_id, attempt_id,
         min(created_at) as at,
         sum(earned)::int as score,
         sum(max_points)::int as max_score
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
       runs::int as runs
  from ranked
 where nth = 1;

comment on view public.learner_quiz_first is
  'もんだいセットの 初回の 点（丸ごと 通した 回の いちばん 古い 回）。1人 × 1セットで 1行。'
  ' 合格ラインは 教材の 側に あるので 合否は 画面が 決める。security_invoker。';

-- 読めるのは ログインした 人だけ（record_index と 同じ）。
revoke all on public.learner_summary from anon;
revoke all on public.learner_quiz_first from anon;
grant select on public.learner_summary to authenticated;
grant select on public.learner_quiz_first to authenticated;

commit;
