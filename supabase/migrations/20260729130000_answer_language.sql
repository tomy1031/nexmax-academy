-- 回答言語の記録（08 §5.2 / §8）。
--
-- 20問は N4 前後の学生が第2・第3言語で答える。どの言語で答えたかが残っていないと、
-- 回答が本人の傾向なのか「設問の日本語が読めなかった」のかを、あとから誰も区別できない。
--
-- null は「記録前のデータ」を意味する。not null にしない（既存行を偽の値で埋めない）。
-- NULL が CHECK を通ることに依存せず、is null を明示して意図を残す。

alter table public.profiles
  add column if not exists answer_language text
    check (answer_language is null or answer_language in ('easy', 'japanese', 'english'));

alter table public.profiles
  add column if not exists language_switched boolean not null default false;

alter table public.personality_results
  add column if not exists answer_language text
    check (answer_language is null or answer_language in ('easy', 'japanese', 'english'));

alter table public.personality_results
  add column if not exists language_switched boolean not null default false;
