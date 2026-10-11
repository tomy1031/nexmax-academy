# 授業ごとの回答分析（定期タスクの手順書）

要望 #599（2026-10-11）。授業のあとに毎回、Claude が生徒の回答を読んで分析し、結果を DB の表 `class_reports` に登録する。先生は学習の記録の画面（いちばん上の「授業ごとの分析」）でそれを読む。先生が知りたいのは次の4つ。

1. フォローが要る生徒（なぜ要るか・その日の答えの引用）
2. AIの疑い（N4・N3を超える言葉づかいの答え）
3. クラスでつまずいたところ（問い・初回の正答率・よくあるまちがい）
4. 次の授業でやること（1〜3個）

## 決まり（変えない）

| 決まり | 出典 |
| --- | --- |
| 定期タスクはすべて授業ごと（火・水・金）。週1にしない | 2026-10-11「定期タスクはすべて授業ごとにしたい」 |
| 結果は DB に登録し、管理画面で見る | 2026-10-11「分析結果は管理画面で表示できるようにしてほしい」「定期作業結果はDBに登録してほしい」 |
| DB に書くのは `class_reports` への登録だけ。ほかの表は読むだけで、update・delete・DDL をしない。issue・メッセージも送らない | 本番DBは全環境で1つ（AGENTS.md） |
| AIの疑いを見つけるのはこの定期タスク（画面の機械判定ではない） | 2026-10-11「定期タスク（ただし毎授業後）」 |
| `claude -p` を使わない | ~/.claude/CLAUDE.md（課金対策） |
| 書くのは日本語。生徒の名前は先生に呼んでほしい名前（`nickname`、無ければ `display_name`） | constraints（なまえ） |

## いつ走るか

Mac の定期タスク `records-analysis-after-class`（`30 21 * * 2,3,5`・Mac の時計）。Mac が ICT でも日本時間でも、授業（17:30〜19:00 ICT）のあとになる時刻を選んである。アプリが閉じていた日は、次に開いたときに走る。

対象日は ICT の今日。今日が火・水・金でなければ（遅れて走った）、直近の火・水・金。対象はその日のまる1日（ICT 00:00〜24:00）。授業の前から解き始める生徒がいる（10/6 は 16:46〜）。

## 手順

### 1. 手順書と教材を最新にする（作業ツリーには触らない）

```bash
REPO=/Users/tomy/program/claude/NexmaxAcademy
git -C "$REPO" fetch -q origin main integration
git -C "$REPO" show origin/integration:docs/skills/records_analysis.md   # この手順書の最新
git -C "$REPO" show origin/main:content/quizsets/<id>.json                # 問いの文・正解・合格ライン（本番の教材）
```

本体のチェックアウトは別のブランチに置かれていることがある（AGENTS.md）。checkout も pull もしない。`git show` で読むだけにする。DB の `studio_contents` に同じ id の行があれば、そちらが本番の正（先生の直し）。

### 2. DB を読む（Supabase コネクタ `execute_sql`）

`:since` / `:until` は対象日の `YYYY-MM-DD 00:00:00+07` と翌日の `00:00:00+07`。

**(a) その日に動いた生徒と組**

```sql
select p.id, coalesce(nullif(p.nickname, ''), p.display_name) as name, p.university, p.cohort
  from profiles p
 where not p.is_admin and coalesce(p.university, '') <> '講師・スタッフ'
   and (exists (select 1 from content_progress c where c.profile_id = p.id and c.updated_at >= :since and c.updated_at < :until)
     or exists (select 1 from quiz_results q where q.profile_id = p.id and q.created_at >= :since and q.created_at < :until)
     or exists (select 1 from meeting_turn_logs m where m.profile_id = p.id and m.created_at >= :since and m.created_at < :until))
 order by p.university, p.cohort, name;
```

**(b) フォローの印**（学習の記録の画面と同じ条件）

```sql
select * from learner_summary where profile_id = any(:ids);       -- ことばの足ぶみ・会話の miss・修了証
select * from learner_quiz_first where profile_id = any(:ids);    -- もんだいの初回（正解数と問題数）
```

- 初回の点が低い … `round(100 * first_correct / first_questions)` がそのセットの `passRate`（教材。無ければ 70）未満のセットが2つ以上。学習者の画面と同じく、点ではなく問題の数で数える。合格ラインのある「もんだい」セットだけを数える（書きこみフォームは数えない）
- ことばで足ぶみ … `word_stuck_sets >= 1`
- 会話でつまずき … `talk_graded >= 4` かつ `talk_miss / talk_graded >= 0.5`

**(c) クラスでつまずいた問い**（その日の初回の答えだけ）

```sql
with today as (select * from quiz_results where created_at >= :since and created_at < :until),
first_attempt as (
  select distinct on (profile_id, quiz_set_id) profile_id, quiz_set_id, attempt_id
    from quiz_results where full_set order by profile_id, quiz_set_id, created_at)
select t.quiz_set_id, t.question_id, t.question_type, count(*) as n,
       round(100.0 * avg(case when t.correct then 1 else 0 end)) as first_pct,
       (array_agg(t.answer_text) filter (where not t.correct))[1:5] as wrong_samples
  from today t join first_attempt f using (profile_id, quiz_set_id, attempt_id)
 group by 1, 2, 3 having count(*) >= 3
 order by first_pct asc limit 10;
```

**(d) ことばの読みのまちがい**

```sql
select term, reading, count(*) as n, (array_agg(distinct reading_input))[1:4] as typed
  from word_test_answers
 where reading_ok = false and created_at >= :since and created_at < :until
 group by term, reading order by n desc limit 10;
```

**(e) 自由に書いた・話したことば**（AIの疑いを見る材料）

```sql
select profile_id, quiz_set_id, question_id, answer_text from quiz_results
 where created_at >= :since and created_at < :until
   and question_type in ('free', 'keyword', 'list', 'ranklist', 'bugreport') and length(answer_text) >= 10;
select profile_id, meeting_id, ask, utterance, grade from meeting_turn_logs
 where created_at >= :since and created_at < :until and length(utterance) >= 10;
select profile_id, talk_id, body from talk_turn_logs
 where created_at >= :since and created_at < :until and speaker = 'learner' and length(body) >= 10;
```

### 3. AIの疑いを見る（決めつけない）

学習者は N5〜N4（N4 にとどかない人も多い）。次のどれかがそろう答えを「疑い」に挙げる。

- N2 以上の語彙・漢語が続く（例:「〜に鑑み」「〜を踏まえ」「迅速に」「齟齬」）
- 書きことばの硬い文体・長い複文・読点の打ち方が整いすぎている
- 敬語の高度な形（「〜させていただきたく存じます」など）を迷いなく使っている
- その生徒のふだんの答え（ほかの日・ほかの問い）との落差が大きい
- 問いに書いていない情報を正確に足している

多くの生徒が教材の用語（決済・支払い選択画面など）を写すので、漢字の多さだけでは疑いにしない。書くときは原文をそのまま引用し、「どこが N3 を超えるか」を1文で添える。「使った」と決めつけず、先生が本人に口頭で確かめる候補として出す。該当が無ければ空の配列にする（画面に「なし」と出る）。

### 4. DB に登録する

組（大学×期生）ごとに1件。同じ日・同じ組をもう一度分析したときは上書きする。文や JSON に `'` が入っても壊れないように、ドル記号の引用（`$q$ … $q$`）で書く。

```sql
insert into public.class_reports
  (class_date, university, cohort, students, summary, follow_up, ai_suspects, stumbles, next_steps, source)
values (
  '2026-10-07', 'AUPP', 2, 21,
  $q$フォローが要る人は5人。もんだいの初回で大きく崩れた問いは無かった。$q$,
  $q$[{"profile_id": "<uuid>", "name": "セイン", "reasons": ["初回の点が低い（2セット）"], "quotes": ["今、原因調べていますして います。"]}]$q$::jsonb,
  $q$[{"profile_id": "<uuid>", "name": "スナ", "quote": "<原文>", "reason": "受け身と「〜がないか確認する」を自然に使っている"}]$q$::jsonb,
  $q$[{"title": "ます形にさらに「します」を付ける", "detail": "6人", "quotes": ["つなぎします", "作りします"]}]$q$::jsonb,
  $q$["名詞＋します と 動詞のます形を並べて見せる"]$q$::jsonb,
  'scheduled-task'
)
on conflict (class_date, university, cohort) do update set
  students = excluded.students, summary = excluded.summary, follow_up = excluded.follow_up,
  ai_suspects = excluded.ai_suspects, stumbles = excluded.stumbles, next_steps = excluded.next_steps,
  source = excluded.source, updated_at = now();
```

- `follow_up` … `[{ "profile_id", "name", "reasons": [..], "quotes": [..] }]`。`profile_id` を入れると、画面で名前を押したときにその生徒の記録が開く
- `ai_suspects` … `[{ "profile_id", "name", "quote", "reason" }]`
- `stumbles` … `[{ "title", "detail", "quotes": [..] }]`
- `next_steps` … `["..", ".."]`
- 数は本番DBの実数だけ。推測の数を書かない。`summary` は先生が最初に読む2〜3文

登録のあと、`select class_date, university, cohort, students from class_reports order by updated_at desc limit 3;` で入ったことを確かめる。

### 5. 終わりの報告

このセッションに3行で返す。対象日、動いた生徒の数、フォローが要る人数と AIの疑いの件数。その日に1人も動いていなければ、登録せずに「授業の記録なし」とだけ返す。
