-- 修了証（しゅうりょうしょう）— 教材を 終えた 証明を **DB が 押す**（2026-10-06 の 指定・願い #562）
-- 適用: integration へ入れば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。手で貼らない
--
-- ## なぜ 要るか
-- 終わった ことの 確認に **画面の スクリーンショット**を 出させて いたが、それを 横見して、
-- 答えを 見ながら タイピングする などの 不正が 見られた（同日の 指定）。修了証には
--   * 終了時刻 … あとで こっそり やるのを 防ぐ
--   * 名前     … 人の ものを 写すのを 防ぐ
--   * 成績     … パーフェクトか どうかが 一目で 分かる
-- を 入れる。どれも **学習者の 端末に 決めさせない**:
--   * 時刻 は DB の now()（端末の 時計は 戻せる）
--   * 名前 は profiles から その 時点の ものを 写す（学習者は 設定で 名前を 直せる ので、
--     出した 時の 名前を 凍らせる。あとで 名前を 変えても 古い 証は 変わらない）
--   * 照合番号（8桁） は DB が 作る。番号は DB にしか 無いので、画像を 加工しても
--     先生の 画面の 番号と 合わない
-- 何回目か（attempt） も DB が 数える（同日の 決定「やり直したら 毎回 出す。◯回目と 入れる」）。
--
-- 点そのものは 端末が 送る（quiz_results と 同じ 水準。開発者ツールで 偽る ことは 範囲外）。
--
-- ## 成績は あとから 直せない
-- update の きまりを 置かない。1行 = 1回の 証明で、出した あとに 変わったら 証明に ならない。
-- 消せるのは 先生だけ（まちがって 出た ものの 後始末）。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- 表を 1つ 足し、見取り図（record_index）に 枝を 1本 足すだけ。いまの 本番の 先生の 画面は
-- 知らない 種類（'certificate'）を 無視する（src/lib/records/table.ts の kindsWithRecords）。

begin;

create table if not exists public.completion_certificates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- 教材ID（content_progress.content_id と 同じ 値。種別を またいで 一意）
  content_id text not null,
  -- 'listening' / 'typing' / …（ステージの contents[].type と 同じ 名前）。
  -- check は 置かない（quiz_results.question_type と 同じ 流儀。種類を 足した 日に
  -- この 表だけが 黙って 証明を 落とすほうが 痛い）。
  kind text not null,
  -- 何回目か（同じ 人・同じ 教材で 1から）。DB が 数える（下の トリガー）。
  attempt integer not null default 0,
  perfect boolean not null default false,
  -- 点の ある 教材だけ（null = 点の 無い 教材）。数え方は 教材ごとに ちがうので、
  -- 画面に 出す 内訳は detail に 置く（src/lib/certificate/model.ts）。
  score integer,
  max_score integer,
  misses integer,
  detail jsonb not null default '{}'::jsonb,
  -- 出した 時の 名前（profiles の 苗字＋名前）。DB が 写す。
  learner_name text not null default '',
  -- 照合番号（8桁）。DB が 作る。
  code text not null default '',
  -- 終えた 時刻（＝ 出した 時刻）。DB が 打つ。
  issued_at timestamptz not null default now()
);

comment on table public.completion_certificates is
  '修了証。1行 = 1回の 証明。時刻・名前・照合番号・何回目かは DB が 押す（端末の 申告を 使わない）。';

create unique index if not exists completion_certificates_code_key
  on public.completion_certificates (code);
-- 「この 人の この 教材の 何回目か」を 数える・最新の 1枚を 読む
create index if not exists completion_certificates_learner_idx
  on public.completion_certificates (profile_id, content_id, issued_at desc);
-- 先生の 画面（教材ごとに 誰が いつ 出したか）
create index if not exists completion_certificates_content_idx
  on public.completion_certificates (content_id, issued_at desc);

-- =====================================================================
-- DB が 押す もの（insert の 前に 必ず 上書きする）
-- =====================================================================
create or replace function app.stamp_completion_certificate()
returns trigger
language plpgsql
-- 検索パスを 固定する（app.stamp_content_completed と 同じ 流儀）。
set search_path = ''
as $$
declare
  -- 読み違えやすい 字（0/O・1/I/L）を 抜いた 31字
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  tries integer := 0;
begin
  new.issued_at := now();
  new.learner_name := coalesce(
    (
      select coalesce(
        nullif(btrim(p.family_name || ' ' || p.given_name), ''),
        nullif(btrim(p.display_name), ''),
        ''
      )
      from public.profiles p
      where p.id = new.profile_id
    ),
    ''
  );
  new.attempt := (
    select count(*) + 1
    from public.completion_certificates c
    where c.profile_id = new.profile_id and c.content_id = new.content_id
  );
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (
      select 1 from public.completion_certificates c where c.code = candidate
    );
    tries := tries + 1;
    if tries > 20 then
      raise exception 'completion certificate code collision';
    end if;
  end loop;
  new.code := candidate;
  return new;
end;
$$;

drop trigger if exists completion_certificates_stamp on public.completion_certificates;
create trigger completion_certificates_stamp
  before insert on public.completion_certificates
  for each row execute function app.stamp_completion_certificate();

-- =====================================================================
-- 読めるのは 本人と 先生・書けるのは 本人・消せるのは 先生
-- =====================================================================
alter table public.completion_certificates enable row level security;

drop policy if exists completion_certificates_select_own_or_admin on public.completion_certificates;
create policy completion_certificates_select_own_or_admin on public.completion_certificates
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists completion_certificates_insert_own on public.completion_certificates;
create policy completion_certificates_insert_own on public.completion_certificates
  for insert with check (auth.uid() = profile_id);

-- update は 置かない（出した 証明は あとから 変わらない）

drop policy if exists completion_certificates_delete_admin on public.completion_certificates;
create policy completion_certificates_delete_admin on public.completion_certificates
  for delete using (public.is_admin());

-- =====================================================================
-- 見取り図（record_index）に 枝を 1本 足す
-- =====================================================================
-- 列は 前と 同じ（kind, profile_id, unit_id, n）。create or replace で 置きかえる。
create or replace view public.record_index
with (security_invoker = true) as
select
  kind,
  profile_id,
  unit_id,
  sum(n)::bigint as n
from (
  select 'progress'::text as kind, profile_id, content_id as unit_id, count(*) as n
    from public.content_progress group by profile_id, content_id
  union all
  select 'quiz'::text, profile_id, quiz_set_id, count(*)
    from public.quiz_results group by profile_id, quiz_set_id
  union all
  select 'word'::text, profile_id, stage_id, count(*)
    from public.word_test_answers group by profile_id, stage_id
  union all
  select 'word'::text, profile_id, stage_id, count(*)
    from public.word_test_results group by profile_id, stage_id
  union all
  select 'talk'::text, profile_id, meeting_id, count(*)
    from public.meeting_turn_logs group by profile_id, meeting_id
  union all
  select 'talk'::text, profile_id, talk_id, count(*)
    from public.talk_turn_logs group by profile_id, talk_id
  union all
  select 'listening'::text, profile_id, listening_id, count(*)
    from public.listening_results group by profile_id, listening_id
  union all
  select 'certificate'::text, profile_id, content_id, count(*)
    from public.completion_certificates group by profile_id, content_id
) counted
group by kind, profile_id, unit_id;

revoke all on public.record_index from anon;
grant select on public.record_index to authenticated;

commit;
