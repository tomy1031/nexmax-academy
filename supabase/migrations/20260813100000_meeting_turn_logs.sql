-- meeting_turn_logs: ミーティング（Zoomの練習）で交わした1往復ぶんの記録
-- 適用: main へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- なぜ要るか。会話の練習は**その場で消える**ので、先生には「できたのか」が
-- 一度も見えなかった。判定をAIに通すようにしたので、
--   - 質問ごとの「もう いちど」率  … 高い質問は 教材（ヒント）の作りが悪い
--   - 言い直したあとに よくなったか … 学習が起きた証拠
--   - 母語（英語・クメール語）で答えた回数 … 日本語で出せない学生の早期発見
-- が数えられる。判定JSONは丸ごと残す（あとから見かたを変えても読み直せる）。
--
-- 発話には名前・出身が入る＝個人情報なので、読めるのは本人と先生だけにする。

create table if not exists public.meeting_turn_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  meeting_id text not null,
  question_id text not null,
  -- 同じ質問への何回目の発話か（1始まり）。言い直しの効果はこれで追う
  attempt int not null default 1,
  -- 'text' = 書いて送った / 'voice' = 声で話した（文字起こし）
  mode text not null default 'text' check (mode in ('text', 'voice')),
  utterance text not null,
  -- 判定の生JSON（版・軸・返事・語釈まで全部）。null = AIに通せなかったとき
  judge jsonb,
  -- よく絞り込む値だけ列に出す（集計をJSONの中に潜らせない）
  grade text check (grade in ('veryGood', 'good', 'miss')),
  -- 'none' = AIの判定を使えた / それ以外は落ちた理由（noKey・quota・kanaRetryFailed…）
  fallback text not null default 'none',
  model text not null default '',
  latency_ms int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists meeting_turn_logs_meeting_created_idx
  on public.meeting_turn_logs (meeting_id, created_at desc);
create index if not exists meeting_turn_logs_profile_created_idx
  on public.meeting_turn_logs (profile_id, created_at desc);

alter table public.meeting_turn_logs enable row level security;

drop policy if exists meeting_turn_logs_select_own_or_admin on public.meeting_turn_logs;
create policy meeting_turn_logs_select_own_or_admin on public.meeting_turn_logs
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists meeting_turn_logs_insert_own on public.meeting_turn_logs;
create policy meeting_turn_logs_insert_own on public.meeting_turn_logs
  for insert with check (auth.uid() = profile_id);

drop policy if exists meeting_turn_logs_delete_admin on public.meeting_turn_logs;
create policy meeting_turn_logs_delete_admin on public.meeting_turn_logs
  for delete using (public.is_admin());
