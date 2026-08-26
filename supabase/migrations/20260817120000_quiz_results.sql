-- quiz_results: もんだい（quizset）の1問ぶんのこたえ
-- 適用: main へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
-- 設計: docs/design/03_リニューアル設計方針.md §3.2 の test_results を、合計点ではなく
--       1問ごとに開いたもの（P8「失敗を罰しない」— 全試行を残し、学生UIには出さない）
--
-- なぜ要るか。もんだいの結果は**端末の localStorage にしか残っていなかった**うえ、
-- 残るのは合計点だけだった（src/lib/progress/store.ts の TestResult）。1問ごとのこたえは
-- 完走した瞬間に捨てていた（src/components/quiz/quiz-runner.tsx の clearQuizResume）ので、
-- 先生からは「点が低かった」ことしか見えず、**どの問題で止まったのか**が分からなかった。
-- 1行＝1問で残すと、
--   - 設問ごとの正答率           … 低い設問は、学生ではなく設問の作り（選択肢・言い回し）を疑う
--   - まちがえた人が何と書いたか … 自由入力の表記ゆれ・まぎらわしい選択肢が見つかる
--   - 2回目・3回目で上がったか   … やり直しで学習が起きた証拠（attempt）
--   - セット全体の合否           … 同じ挑戦の行を attempt_id でまとめて sum(earned)/sum(max_points)
-- が数えられる。会話側の meeting_turn_logs と対になる、もんだい側の学習ログである。
--
-- 合否を数えるときの注意。「まちがえた もんだいだけ」のやり直しも1回の挑戦として入るので、
-- **行数がセットの設問数に満たない attempt_id がある**。だから「その回が教材まるごとだったか」を
-- full_set に**その日の事実として**残す。今の設問数と行数を比べて後から導くのではない——
-- 教材から設問を1つ減らした日に、過去の挑戦が全部「不完全」に化けるため。
-- max_points を一緒に残すのと同じ考え方で、あとから変わるものは凍らせておく。
--
-- 学習者の画面はこの表に依存しない。書き込みに落ちても、もんだいは最後まで進む
-- （記録は送りっぱなし）。記録のために学習が止まるのが、いちばんまずい。
--
-- こたえの文には名前や気持ちが入りうる＝個人情報なので、読めるのは本人と先生だけにする。

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- 問題セットのID（content/*.json・studio_contents と同じ値）
  quiz_set_id text not null,
  -- セットの中の設問ID。同じ値でも別セットなら別の設問なので、集計は必ず2つ組で引く
  question_id text not null,
  -- 'choose' | 'multi' | 'keyword' | 'wordbank' | 'emotion'（src/content/schema.ts の5型）
  -- check は置かない。型の増減はアプリ側スキーマが唯一の正であり（studio_contents.kind と同じ流儀）、
  -- 6つ目の型を足した日に、この表だけが黙って記録を落とすほうが先生にとって痛いため。
  question_type text not null,
  -- 学習者が書いた・選んだ内容を**そのままの言葉で**持つ。
  -- 選択式でも番号ではなく選んだ文そのものを入れる——教材の選択肢を1行入れ替えると番号の
  -- 意味が変わり、去年の記録が読めなくなる。先生が読みたいのも「2」ではなく学生の言葉である。
  -- 空文字 = 何も書かずに「こたえを 見る」を押した（点は入らないが、そこで詰まった証拠になる）。
  answer_text text not null default '',
  correct boolean not null,
  -- 入った点と、その設問の満点（schema.ts の quizCommon.points）。
  -- 満点も一緒に残すのは、あとで配点を直しても**その日の点**がそのまま読めるようにするため。
  earned int not null default 0,
  max_points int not null default 1,
  -- 教材ぜんぶの中で何問目か（0始まり）。「まちがえた もんだいだけ」のやり直しでも
  -- 教材の出題順のままなので、先生の画面が教材を読まずに Q1・Q2… と並べられる。
  question_index int not null default 0,
  -- 教材まるごとの挑戦か（false = 「まちがえた もんだいだけ」のやり直し）。
  -- 合否を数えてよいのは true の回だけ。
  full_set boolean not null default true,
  -- 1回の挑戦をまとめる鍵。挑戦を始めるときにクライアントが1つ作り、その回の全問に同じ値を書く。
  -- 「何回目の挑戦か」は列に持たない——端末の申告なので localStorage を消した学生は1に戻り、
  -- 嘘をつく。先生の画面が created_at の古い順に番号をふるほうが、端末に依存せず正しい。
  -- default を置かないのは、書き忘れたときに行ごとに別のUUIDが入って**まとまりが黙って壊れる**より、
  -- その1行が入らないほうがまし（学習は止まらない）だから。
  attempt_id uuid not null,
  created_at timestamptz not null default now()
);

-- 同じ挑戦の同じ設問は1行だけ。送り直し（通信のやり直し）で正答率が二重に数えられない。
-- 1問は答えた瞬間に確定する設計（quiz-reducer.ts）なので、1回の挑戦の中で同じ設問が
-- 2度出ることはない。書き込み側は on conflict do nothing で送ること。
-- この索引は attempt_id が先頭なので、「1回の挑戦を通しで開く」引き当てもこれで足りる
-- ——そのためだけの索引は足さない（索引は書くたびに払う税金である）。
create unique index if not exists quiz_results_attempt_question_key
  on public.quiz_results (attempt_id, question_id);

-- 設問ごとの集計（どの問題がむずかしいか）。先生の画面がいちばん上に出す表がこれを引く
create index if not exists quiz_results_set_question_created_idx
  on public.quiz_results (quiz_set_id, question_id, created_at desc);

-- 生徒ごとの時系列（この子は何を、どう間違えてきたか）。meeting_turn_logs と同じ形
create index if not exists quiz_results_profile_created_idx
  on public.quiz_results (profile_id, created_at desc);

alter table public.quiz_results enable row level security;

-- きまりは meeting_turn_logs と同じ4つ。
--   1. 本人は自分の記録を読める      ┐ 1つの select ポリシーで両方を表す
--   2. 先生（is_admin）は全員ぶん読める ┘
--   3. 書けるのは本人だけ（他人の成績を作れない）
--   4. 消せるのは先生だけ
-- update のポリシーは**わざと置かない**。RLS は許可が無ければ拒否なので、これで
-- 「一度書いたこたえは誰も書き換えられない」になる。成績の台帳を後から直せると記録の意味が
-- 無くなる（直したいときは消して入れ直す＝先生の操作としてだけ起きる）。

drop policy if exists quiz_results_select_own_or_admin on public.quiz_results;
create policy quiz_results_select_own_or_admin on public.quiz_results
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists quiz_results_insert_own on public.quiz_results;
create policy quiz_results_insert_own on public.quiz_results
  for insert with check (auth.uid() = profile_id);

drop policy if exists quiz_results_delete_admin on public.quiz_results;
create policy quiz_results_delete_admin on public.quiz_results
  for delete using (public.is_admin());
