-- quiz_results: もんだい（quizset）の1問ぶんのこたえ
-- 設計: docs/design/03_リニューアル設計方針.md §3.2 の test_results を、合計点ではなく
--       1問ごとに開いたもの（P8「失敗を罰しない」— 全試行を残し、学生UIには出さない）

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- 問題セットのID（content/*.json・studio_contents と同じ値）
  quiz_set_id text not null,
  -- セットの中の設問ID。同じ値でも別セットなら別の設問なので、集計は必ず2つ組で引く
  question_id text not null,
  -- 'choose' | 'multi' | 'keyword' | 'wordbank' | 'emotion'（src/content/schema.ts の5型）
  question_type text not null,
  -- 学習者が書いた・選んだ内容を**そのままの言葉で**持つ。
  -- 空文字 = 何も書かずに「こたえを 見る」を押した
  answer_text text not null default '',
  correct boolean not null,
  earned int not null default 0,
  max_points int not null default 1,
  -- 教材ぜんぶの中で何問目か（0始まり）
  question_index int not null default 0,
  -- 教材まるごとの挑戦か（false = 「まちがえた もんだいだけ」のやり直し）
  full_set boolean not null default true,
  -- 1回の挑戦をまとめる鍵。挑戦を始めるときにクライアントが1つ作り、その回の全問に同じ値を書く
  attempt_id uuid not null,
  created_at timestamptz not null default now()
);

-- 同じ挑戦の同じ設問は1行だけ。送り直しで正答率が二重に数えられない
create unique index if not exists quiz_results_attempt_question_key
  on public.quiz_results (attempt_id, question_id);

-- 設問ごとの集計（どの問題がむずかしいか）
create index if not exists quiz_results_set_question_created_idx
  on public.quiz_results (quiz_set_id, question_id, created_at desc);

-- 生徒ごとの時系列（この子は何を、どう間違えてきたか）
create index if not exists quiz_results_profile_created_idx
  on public.quiz_results (profile_id, created_at desc);

alter table public.quiz_results enable row level security;

-- きまりは meeting_turn_logs と同じ4つ。update のポリシーはわざと置かない
-- （一度書いたこたえは誰も書き換えられない）

drop policy if exists quiz_results_select_own_or_admin on public.quiz_results;
create policy quiz_results_select_own_or_admin on public.quiz_results
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists quiz_results_insert_own on public.quiz_results;
create policy quiz_results_insert_own on public.quiz_results
  for insert with check (auth.uid() = profile_id);

drop policy if exists quiz_results_delete_admin on public.quiz_results;
create policy quiz_results_delete_admin on public.quiz_results
  for delete using (public.is_admin());
