-- 性格診断 v3 — MBTI 4軸 / 16タイプへの移行
-- 仕様: docs/design/07_性格タイプ設計_MBTI16.md §8

delete from public.profiles
where personality_type not in (
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTP', 'ISFP', 'ESTP', 'ESFP'
);

delete from public.personality_results
where personality_type not in (
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTP', 'ISFP', 'ESTP', 'ESFP'
);

alter table public.profiles drop constraint if exists profiles_personality_type_check;
alter table public.personality_results
  drop constraint if exists personality_results_personality_type_check;

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
