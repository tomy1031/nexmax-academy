-- 性格診断 v3 — MBTI 4軸 / 16タイプへの移行
-- 適用方法: Supabase ダッシュボード → SQL Editor に全文を貼り付けて Run
-- 仕様: docs/design/07_性格タイプ設計_MBTI16.md §8
--
-- v2 → v3 は破壊的変更。列の意味・値域・回答形式がすべて変わる。
--   personality_type : 'leader'|'idea'|'heart'|'challenge'   → 16コード（'ISTJ' 等）
--   answers          : ["yes"|"neutral"|"no"] × 20           → ["a"|"b"] × 20
--   scores           : {leader,idea,heart,challenge} 各0〜10  → {ei,sn,tf,jp} 各0〜5
--
-- 実行順が重要（07 §8.1）。旧行を消す前に制約を張り替えると、旧値 'leader' が
-- 新CHECKに違反して ALTER 自体が失敗する。
--
-- 冪等性について:
--   * DDL は drop if exists → add の順なので何度でも流せる。
--   * DELETE は「v3コードでない行」だけを消す条件付きにしてある。したがって再実行しても
--     移行後に作られた正常な v3 プロフィールは消えない（無条件 DELETE にすると、2回目の
--     実行で本物の学習者データが消える）。
--   * 逆に、v3コードなのに answers/scores が壊れている行が残っていた場合は、この後の
--     ALTER ... ADD CONSTRAINT が失敗する。黙って消さずに落ちるのが正しい挙動なので、
--     そのときは中身を確認してから手で対処する。
--
-- CHECK制約の書きかたについて:
--   * PostgreSQLのCHECKにサブクエリは書けない。jsonb演算子だけで表現している。
--   * CHECKは結果がNULLだと「違反していない」と扱われる。キー欠損でNULLに落ちて素通り
--     するのを防ぐため、型判定は coalesce(jsonb_typeof(...), '') で包む。
--   * jsonb_array_length は配列以外を渡すとエラーになる。ANDの評価順は保証されないので
--     CASE で順序を固定する。

begin;

-- 1. v2 の行を消す。
--    現在の本番データは開発者本人の1行のみ（07 §8 冒頭）。互換期間は設けない。
--    personality_results は profile_id の on delete cascade で一緒に消える。
--    is_admin は次回オンボーディング時に profiles_identity トリガーが許可メールから再付与する。
--    ※ /welcome の診断済み判定は「行の存在」（src/app/welcome/page.tsx の
--      `if (profile) redirect("/map")`）なので、answers を空にするだけでは再診断に入れない。
--      行ごと消すのが正しい。
delete from public.profiles
where personality_type not in (
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTP', 'ISFP', 'ESTP', 'ESFP'
);

-- cascade で消えるはずだが、親を持たない v2 の記録が万一残っていた場合に備える。
delete from public.personality_results
where personality_type not in (
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTP', 'ISFP', 'ESTP', 'ESFP'
);

-- 2. 旧CHECK制約（4値）を落とす。
alter table public.profiles drop constraint if exists profiles_personality_type_check;
alter table public.personality_results
  drop constraint if exists personality_results_personality_type_check;

-- 張り直す v3 制約も、再実行できるよう先に落としておく。
alter table public.profiles drop constraint if exists profiles_personality_type_v3_check;
alter table public.profiles drop constraint if exists profiles_answers_v3_check;
alter table public.profiles drop constraint if exists profiles_scores_v3_check;
alter table public.profiles drop constraint if exists profiles_personality_v3_check;
alter table public.profiles drop constraint if exists profiles_personality_version_check;
alter table public.personality_results
  drop constraint if exists personality_results_personality_type_v3_check;
alter table public.personality_results
  drop constraint if exists personality_results_answers_v3_check;
alter table public.personality_results
  drop constraint if exists personality_results_scores_v3_check;
alter table public.personality_results
  drop constraint if exists personality_results_version_check;

-- 3. 判定の前提をDBで保証する。
--    アプリの `scores[axis] >= 3` という判定は「4キーちょうど・各値0〜5の整数」が
--    成り立って初めて意味を持つ。欠損・小数・範囲外・キー違いをここで落とす。

-- 3a. 16コード
alter table public.profiles add constraint profiles_personality_type_v3_check
  check (personality_type in (
    'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
    'INTJ', 'INTP', 'ENTJ', 'ENTP',
    'INFJ', 'INFP', 'ENFJ', 'ENFP',
    'ISTP', 'ISFP', 'ESTP', 'ESFP'
  ));

alter table public.personality_results add constraint personality_results_personality_type_v3_check
  check (personality_type in (
    'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
    'INTJ', 'INTP', 'ENTJ', 'ENTP',
    'INFJ', 'INFP', 'ENFJ', 'ENFP',
    'ISTP', 'ISFP', 'ESTP', 'ESFP'
  ));

-- 3b. profiles は answers と scores を1つの制約で見る。
--     列ごとに独立して空を許すと「回答は空なのにスコアだけ完成」という中途半端な状態が
--     通ってしまうため、**両方とも空（未診断）** か **両方とも完成** のどちらかに限定する。
--     `<@` は「左の全要素が右に含まれる」なので、a と b 以外が1つでもあれば false。
--     scores は4キーを引いて '{}' になることで「余分なキーが無い」を、
--     coalesce(jsonb_typeof(...)) = 'number' で「4キーすべてが在って数値」を保証する。
--     '^[0-5]$' は 3.0（小数表記）・6・-1・"3"（文字列）をすべて落とす。
alter table public.profiles add constraint profiles_personality_v3_check
  check (
    (answers = '[]'::jsonb and scores = '{}'::jsonb)
    or (
      case
        when coalesce(jsonb_typeof(answers), '') <> 'array' then false
        else jsonb_array_length(answers) = 20 and answers <@ '["a", "b"]'::jsonb
      end
      and case
        when coalesce(jsonb_typeof(scores), '') <> 'object' then false
        else
          scores - 'ei' - 'sn' - 'tf' - 'jp' = '{}'::jsonb
          and coalesce(jsonb_typeof(scores -> 'ei'), '') = 'number'
          and coalesce(jsonb_typeof(scores -> 'sn'), '') = 'number'
          and coalesce(jsonb_typeof(scores -> 'tf'), '') = 'number'
          and coalesce(jsonb_typeof(scores -> 'jp'), '') = 'number'
          and (scores ->> 'ei') ~ '^[0-5]$'
          and (scores ->> 'sn') ~ '^[0-5]$'
          and (scores ->> 'tf') ~ '^[0-5]$'
          and (scores ->> 'jp') ~ '^[0-5]$'
      end
    )
  );

-- 3c. 記録台帳は完成した結果しか積まないので、空を許さない。
alter table public.personality_results add constraint personality_results_answers_v3_check
  check (
    case
      when coalesce(jsonb_typeof(answers), '') <> 'array' then false
      else jsonb_array_length(answers) = 20 and answers <@ '["a", "b"]'::jsonb
    end
  );

alter table public.personality_results add constraint personality_results_scores_v3_check
  check (
    case
      when coalesce(jsonb_typeof(scores), '') <> 'object' then false
      else
        scores - 'ei' - 'sn' - 'tf' - 'jp' = '{}'::jsonb
        and coalesce(jsonb_typeof(scores -> 'ei'), '') = 'number'
        and coalesce(jsonb_typeof(scores -> 'sn'), '') = 'number'
        and coalesce(jsonb_typeof(scores -> 'tf'), '') = 'number'
        and coalesce(jsonb_typeof(scores -> 'jp'), '') = 'number'
        and (scores ->> 'ei') ~ '^[0-5]$'
        and (scores ->> 'sn') ~ '^[0-5]$'
        and (scores ->> 'tf') ~ '^[0-5]$'
        and (scores ->> 'jp') ~ '^[0-5]$'
    end
  );

-- 4. 版を持たせる。
--    07 §8.1 のとおり **default に頼らず、アプリの insert / upsert が明示的に 3 を書く**。
--    default を残すと、version を省略した INSERT が黙って通り、移行中に旧クライアントが
--    送った v2 データまで v3 として記録されてしまう。
--    列追加時だけ default を使い（既存行を埋めるため）、直後に外して省略を許さなくする。
alter table public.profiles
  add column if not exists personality_version integer not null default 3;
alter table public.personality_results
  add column if not exists personality_version integer not null default 3;

alter table public.profiles alter column personality_version drop default;
alter table public.personality_results alter column personality_version drop default;

alter table public.profiles add constraint profiles_personality_version_check
  check (personality_version >= 3);

alter table public.personality_results add constraint personality_results_version_check
  check (personality_version >= 3);

commit;
