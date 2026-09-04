-- 学習の きろく — **端末にしか 残って いなかった もの**を 台帳に 出す
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- ## 何が 抜けて いたか
-- 保存の 穴を 数えたら、先生が 見たい ものの 半分が **その端末の localStorage に
-- しか 無かった**。端末を 変えれば 消え、先生からは はじめから 見えない。
--
--   1. 教材の 進み具合（全11種別）… 誰が どこまで 終えたかが **一度も** 見えなかった。
--      学習者の 画面は 数えて いるのに（ステージの「4つ中2つ おわった」）、
--      その 数は 端末の 中だけに あった。
--   2. ことばの テストの 成績   … `TestResult` は **成績**なのに 端末だけ。もんだい
--      （quizset）の 点は `quiz_results` に 残るのに、ことばの 点だけ 消えて いた。
--   3. たいわ（Gemini Live）の 会話 … `transcript` を 画面に 出すだけで **1行も**
--      残して いなかった。ミーティングと 松井社長は `meeting_turn_logs` に 残るのに、
--      おなじ 対話の 教材で ここだけ 空白だった。
--   4. リスニングで 当てた ことば … 学習者が 打った 言葉そのもの。
--
-- ## 書く 回数を 先に 決める（Cloudflare $5 / Supabase の 枠）
-- 教室は ふつう **1本の 回線＝1つの IP** から 出る ので、書き込みは 人数ぶん 同じ 枠を
-- 削り合う（docs/deploy.md §0.10）。だから 先に 上限を 決めてから 表を 作った。
--
--   * 進み具合・リスニング … 端末が 正。**変わったぶんだけ 10秒 ためて 1回**
--     upsert する（`src/lib/records/sync.ts`）。1人 1教材 あたり 2〜3回。
--   * ことばの テスト       … けっか画面で **1回だけ**（summary 1行＋語の数だけ 1回の insert）。
--   * たいわ               … 退出の ときに **1回だけ**（`src/lib/records/talk-log.ts`）。
--
-- どれも `meeting_turn_logs` の「ためて、おわりに 1回」と `quest_saves` の
-- 「節目だけ」に そろえて ある。1手ごと・1文字ごとには 書かない。
--
-- ## 読めるのは 本人と 先生だけ
-- こたえの 文にも 発話にも 名前や 気持ちが 入りうる＝個人情報なので、
-- `quiz_results` と 同じ 4つの きまりに そろえる。

begin;

-- =====================================================================
-- 1. content_progress — 教材ごとの 進み具合（全11種別）
-- =====================================================================
--
-- 1人 1教材 **1行**（上書き）。1回ごとの 履歴は 残さない——ここで 知りたいのは
-- 「いま どこまで 進んで いるか」で、それは 最新の 1行で 足りる。
-- 何回 挑戦したかは、成績の 表（quiz_results / word_test_results）が 持つ。
--
-- `content_id` だけで 鍵に する のは、アプリが すでに **教材IDを 種別を またいで
-- 一意**として 扱って いる ため（端末の 鍵も `content:<id>` の 1本）。ここで 種別を
-- 足すと、端末と DBで 別の ものを 指す ことに なる。
-- 種別と ステージは 先生の 画面が 教材の 台帳から 引く（教材は ステージを 移れるので、
-- 記録に 焼き込むと 移した 日に 過去の 記録が 迷子に なる）。
create table if not exists public.content_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  content_id text not null,
  -- 'started' = 開いた / 'completed' = おわりまで 行った。
  -- **completed は started に 戻らない**（アプリ側 `recordContentProgress` と 同じ）。
  status text not null check (status in ('started', 'completed')),
  -- しおり（例: まんがなら `{"page":3,"panel":2}`）。**中身の 形は 教材ごとに ちがう**ので
  -- 列に 開かない。先生の 画面は「3ページ目」のように そのまま 読むだけ。
  position jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  -- おわった 時こく。null = まだ 途中。**status から 導かない**——「いつ 終えたか」は
  -- 授業の あとで 追いつけたかを 見る ときに、いちばん 効く 一列である。
  --
  -- 打つのは **DB**（下の `app.stamp_content_completed`）。ブラウザに 打たせると
  --   1. 時計の 狂った 1台で 並びが 崩れる
  --   2. **読み直すたびに 上書きされる**——まんがを もう一度 開いて しおりが 動くと、
  --      同じ 行を もう一度 送る ことに なり、はじめて 終えた 日が 消える
  -- の 2つが 起きる。2 は 実際に 効く——先生が 見たいのは「いつ 終えたか」であって
  -- 「さいごに いつ 開いたか」では ない（それは updated_at が 持って いる）。
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, content_id)
);

comment on table public.content_progress is
  '教材ごとの 進み具合（started / completed ＋ しおり）。端末が 正で、ここは その 写し。';

-- 教材ごとに「何人が 終えたか」を 数える。先生の 画面が いちばん 上に 出す 表がこれを 引く
create index if not exists content_progress_content_idx
  on public.content_progress (content_id, status);

alter table public.content_progress enable row level security;

drop policy if exists content_progress_select_own_or_admin on public.content_progress;
create policy content_progress_select_own_or_admin on public.content_progress
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists content_progress_insert_own on public.content_progress;
create policy content_progress_insert_own on public.content_progress
  for insert with check (auth.uid() = profile_id);

-- ここは 成績では なく **いまの すがた**なので update を 置く（quest_saves と 同じ）。
drop policy if exists content_progress_update_own on public.content_progress;
create policy content_progress_update_own on public.content_progress
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists content_progress_delete_admin on public.content_progress;
create policy content_progress_delete_admin on public.content_progress
  for delete using (public.is_admin());

-- =====================================================================
-- 2. word_test_results — ことばの テストの 成績（1行 = 1回の 挑戦）
-- =====================================================================
--
-- 端末の `TestResult` は **初回だけを 正式**として 上書きを 捨てて いた。ここは 逆に
-- **ぜんぶ 残す**——2回目・3回目で 上がったかが、学習が 起きた いちばん はっきりした
-- 証拠に なる（quiz_results の attempt と 同じ 考え方）。「初回が 正式」は
-- 先生の 画面が 古い順に 番号を ふれば 出せる ので、記録の 側で 捨てる 必要が ない。
create table if not exists public.word_test_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- 単語ステージID（content/wordstages・studio_contents と 同じ 値）
  stage_id text not null,
  -- 1回の 挑戦を まとめる 鍵。答えの 明細（word_test_answers）と つなぐ。
  attempt_id uuid not null unique,
  -- 'test' = 成績に なる 本番 / 'practice' = れんしゅう / 'quiz' = いみ だけ
  -- check は 置かない（quiz_results.question_type と 同じ 流儀。4つ目の 遊び方を
  -- 足した 日に、この 表だけが 黙って 記録を 落とすほうが 痛い）。
  mode text not null default 'test',
  -- 読み1点＋いみ1点。max_points と 同じで **その日の 数え方**を 凍らせる。
  score int not null default 0,
  max_score int not null default 0,
  -- 出した 語の 数（＝もんだいの 数では ない。1語で 読み・いみの 2問）
  total int not null default 0,
  -- 読みを 聞いた 語の 数（`quiz` では 0）。**0 と「聞いて いない」を 見分ける**ために 残す。
  reading_asked int not null default 0,
  reading_correct int not null default 0,
  meaning_correct int not null default 0,
  passed boolean not null default false,
  -- ゲームの 点と 連続。**合否には 使わない**（P11）。学習者を 励ますための 数。
  game_score int not null default 0,
  best_combo int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.word_test_results is
  'ことばの テストの 成績。1行 = 1回の 挑戦。合否に 使うのは mode = ''test'' の 行だけ。';

create index if not exists word_test_results_stage_created_idx
  on public.word_test_results (stage_id, created_at desc);
create index if not exists word_test_results_profile_created_idx
  on public.word_test_results (profile_id, created_at desc);

alter table public.word_test_results enable row level security;

drop policy if exists word_test_results_select_own_or_admin on public.word_test_results;
create policy word_test_results_select_own_or_admin on public.word_test_results
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists word_test_results_insert_own on public.word_test_results;
create policy word_test_results_insert_own on public.word_test_results
  for insert with check (auth.uid() = profile_id);

-- update は **わざと 置かない**（quiz_results と 同じ。成績は あとから 直せない）。
drop policy if exists word_test_results_delete_admin on public.word_test_results;
create policy word_test_results_delete_admin on public.word_test_results
  for delete using (public.is_admin());

-- =====================================================================
-- 3. word_test_answers — ことばの テストで **学習者が 打った もの**（1行 = 1語）
-- =====================================================================
--
-- 点だけでは「どの ことばで 止まるか」が 分からない。もんだい（quiz_results）で
-- いちばん 効いたのが **書いた 文そのもの**だったので、ことばの 側にも 同じ ものを 置く。
-- 「けんしゅう」を「けんしゅ」と 打つ 人が 何人も いるなら、疑うのは 学生では なく
-- **その語の 読みの 教え方**である。
create table if not exists public.word_test_answers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  stage_id text not null,
  attempt_id uuid not null,
  word_id text not null,
  -- 出た ことばと 正解。**その日の 教材の すがた**を 凍らせる（あとで 語を 直しても
  -- 去年の 記録が そのまま 読める。quiz_results の max_points と 同じ 考え方）。
  term text not null default '',
  reading text not null default '',
  meaning text not null default '',
  -- 学習者が **打った 読み**。空 = 読みを 聞かない 遊び方（quiz）だった。
  reading_input text not null default '',
  -- null = 読みを 聞いて いない。false = 打ったが ちがった。
  reading_ok boolean,
  -- 学習者が **えらんだ いみ**の 文そのもの（番号では ない——選択肢を 1行 入れ替えると
  -- 番号の 意味が 変わり、去年の 記録が 読めなく なる）。空 = 時間ぎれで えらべなかった。
  meaning_input text not null default '',
  meaning_ok boolean not null default false,
  -- 教材の 中で 何語目か（0始まり）。先生の 画面が 教材を 読まずに 並べられる。
  word_index int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.word_test_answers is
  'ことばの テストの 明細。1行 = 1語。学習者が 打った 読み・えらんだ いみを そのまま 残す。';

-- 同じ 挑戦の 同じ 語は 1行だけ（送り直しで 二重に 数えない）。書く側は
-- on conflict do nothing で 送る こと。
create unique index if not exists word_test_answers_attempt_word_key
  on public.word_test_answers (attempt_id, word_id);

-- 語ごとの 集計（どの ことばが むずかしいか）。先生の 画面が 上から 読む 表
create index if not exists word_test_answers_stage_word_idx
  on public.word_test_answers (stage_id, word_id, created_at desc);
create index if not exists word_test_answers_profile_created_idx
  on public.word_test_answers (profile_id, created_at desc);

alter table public.word_test_answers enable row level security;

drop policy if exists word_test_answers_select_own_or_admin on public.word_test_answers;
create policy word_test_answers_select_own_or_admin on public.word_test_answers
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists word_test_answers_insert_own on public.word_test_answers;
create policy word_test_answers_insert_own on public.word_test_answers
  for insert with check (auth.uid() = profile_id);

drop policy if exists word_test_answers_delete_admin on public.word_test_answers;
create policy word_test_answers_delete_admin on public.word_test_answers
  for delete using (public.is_admin());

-- =====================================================================
-- 4. talk_turn_logs — たいわ（Gemini Live）の 会話（1行 = 1発言）
-- =====================================================================
--
-- ## なぜ meeting_turn_logs に 相乗りしないか
-- あちらは **学習者の 発話 1つ**が 1行で、相手の 返事は 残さない。ヘンディさんの
-- ミーティングは「しつもんに 答える」形なので それで 足りる。たいわは 逆で、
-- **学習者が 聞き出す**——相手が 何を 答えたかを 見ないと、その 質問が 効いたのかが
-- 読めない。だから 両方の 発言を 残す 別の 表に する。
-- 形の ちがう ものを 同じ 表に 押し込むと、`grade` のように **無い ものを 既定で 埋める**
-- ことに なり、先生の 画面が それを 数えて しまう（log.ts の 判断と 同じ）。
create table if not exists public.talk_turn_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- シナリオID（content/scenarios・studio_contents と 同じ 値）
  talk_id text not null,
  -- 1回の たいわ を まとめる 鍵（つないだ ときに 1つ 作る）。
  session_id uuid not null,
  -- その 会の 中で 何番目の 発言か（0始まり）。並べ直しに 使う。
  turn_index int not null default 0,
  -- 'learner' = 学習者 / 'partner' = 相手（AI）
  speaker text not null check (speaker in ('learner', 'partner')),
  -- 'text' = 書いて 送った / 'voice' = 声で 話した（文字起こし）
  mode text not null default 'text' check (mode in ('text', 'voice')),
  body text not null default '',
  -- その 発言で **開いた 要件ボードの 項目**（learner のときだけ）。空 = 何も 開かなかった。
  -- ここが 空の 発話が 続いて いたら、聞き方が 分からずに 迷って いる 合図である。
  opened_req_id text not null default '',
  -- その 時点で 聞き出せた 数 と 全部の 数。あとから 教材の 項目を 増やしても
  -- 「その日 何個中 何個 だったか」が 読める ように 一緒に 凍らせる。
  opened_count int not null default 0,
  req_total int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.talk_turn_logs is
  'たいわ（Gemini Live）の 会話。学習者と 相手の 両方の 発言を 残す。送るのは 退出の ときに 1回。';

-- 同じ 会の 同じ 番は 1行だけ（送り直しで 会話が 二重に ならない）。
create unique index if not exists talk_turn_logs_session_turn_key
  on public.talk_turn_logs (session_id, turn_index);

create index if not exists talk_turn_logs_talk_created_idx
  on public.talk_turn_logs (talk_id, created_at desc);
create index if not exists talk_turn_logs_profile_created_idx
  on public.talk_turn_logs (profile_id, created_at desc);

alter table public.talk_turn_logs enable row level security;

drop policy if exists talk_turn_logs_select_own_or_admin on public.talk_turn_logs;
create policy talk_turn_logs_select_own_or_admin on public.talk_turn_logs
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists talk_turn_logs_insert_own on public.talk_turn_logs;
create policy talk_turn_logs_insert_own on public.talk_turn_logs
  for insert with check (auth.uid() = profile_id);

drop policy if exists talk_turn_logs_delete_admin on public.talk_turn_logs;
create policy talk_turn_logs_delete_admin on public.talk_turn_logs
  for delete using (public.is_admin());

-- =====================================================================
-- 5. listening_results — リスニングで **当てた ことば**（1人 1教材 1行）
-- =====================================================================
--
-- 学習者が 打った 言葉を そのまま 残す。原稿の どこが 開いたかでは なく **言葉**を
-- 残すのは、位置は 台本を 1文字 直すだけで ずれる ため（端末側 `saveListeningFinds`
-- と 同じ 判断）。何回 挑戦したかでは なく **いま どこまで 聞き取れて いるか**を 見る
-- 表なので、1行を 上書きする。
create table if not exists public.listening_results (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  listening_id text not null,
  -- 当たった 入力を 打った 順に。**外した 言葉は 入らない**（端末が 残して いない）。
  inputs text[] not null default '{}',
  -- 原稿が どれだけ 開いたか（0〜100）と、まだ 残って いる キーワードの 数。
  reveal_percent int not null default 0,
  keywords_left int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (profile_id, listening_id)
);

comment on table public.listening_results is
  'リスニングで 学習者が 当てた ことば。1人 1教材 1行（上書き）。';

create index if not exists listening_results_listening_idx
  on public.listening_results (listening_id);

alter table public.listening_results enable row level security;

drop policy if exists listening_results_select_own_or_admin on public.listening_results;
create policy listening_results_select_own_or_admin on public.listening_results
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists listening_results_insert_own on public.listening_results;
create policy listening_results_insert_own on public.listening_results
  for insert with check (auth.uid() = profile_id);

drop policy if exists listening_results_update_own on public.listening_results;
create policy listening_results_update_own on public.listening_results
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists listening_results_delete_admin on public.listening_results;
create policy listening_results_delete_admin on public.listening_results
  for delete using (public.is_admin());

-- =====================================================================
-- おわった 時こくは DB が 1回だけ 打つ
-- =====================================================================
--
-- すでに 入って いれば 触らない（**はじめて 終えた 日**が 正）。
-- 'started' に 戻る ことは アプリ側でも 起きない（`recordContentProgress`）が、
-- 万一 戻っても 消さない——一度 終えた 事実は 消えない。
create or replace function app.stamp_content_completed()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := coalesce(old.completed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists content_progress_stamp_completed on public.content_progress;
create trigger content_progress_stamp_completed
  before insert or update on public.content_progress
  for each row execute function app.stamp_content_completed();

-- =====================================================================
-- updated_at は DB が 打つ
-- =====================================================================
--
-- 上書きする 2つの 表（content_progress / listening_results）だけ。ブラウザの 時計は
-- ずれる ので、「いつ 動いたか」を 端末の 申告に しない——授業の 記録として 読む 列を
-- 端末が 決めて よい ことに すると、時計の 狂った 1台で 並びが 崩れる。
do $$
declare
  t text;
begin
  foreach t in array array['content_progress', 'listening_results'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function app.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end
$$;

commit;
