-- AIの 時間に「日付の 例外」を 足す（願い #586・2026-10-08 の 追加）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- 2026-10-08 の 指定:「全部のクラスが同じ時間になっていますが、日によって違う可能性も
-- 0ではないので、入力に柔軟性を持たせてください」。
--
-- 曜日ごとの 時間（windows）は いまの まま 使える（曜日ごとに ちがう 時間・1日に 何回でも
-- 置ける）。足すのは **その 日だけ** の 例外:
--   [{"date":"2026-10-14"}]                                  … その 日は なし
--   [{"date":"2026-10-15","start":"15:00","end":"16:30"}]    … その 日だけ この 時間
-- その 日に 例外が 1つでも あれば、曜日の わくは 見ない（src/lib/ai/claude-gate.ts の insideSchedule）。
--
-- 足す だけ（既定は 空）。いま 動いて いる 関数・画面は この 列を 読まないので 先に 流して よい。

begin;

alter table public.ai_windows
  add column if not exists exceptions jsonb not null default '[]'::jsonb;

alter table public.ai_windows drop constraint if exists ai_windows_exceptions_array;
alter table public.ai_windows
  add constraint ai_windows_exceptions_array check (jsonb_typeof(exceptions) = 'array');

comment on column public.ai_windows.exceptions is
  '日付の 例外（カンボジア時間）。[{date, start?, end?}]。時刻が 無ければ その 日は なし。その 日は 曜日の わくを 見ない。';

commit;
