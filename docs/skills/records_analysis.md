# 授業ごとの 回答分析（定期タスクの 手順書）

願い #599（2026-10-11）。**授業の あとに 毎回**、Claude が 生徒の 回答を 読んで、
先生が 読む 1枚の ページを 書き直す。先生が 知りたいのは 次の 4つ。

1. **フォローが 要る 生徒**（なぜ 要るか・その日の こたえの 引用）
2. **AI の 疑い**（N4・N3 を 超える 言葉づかいの こたえ）
3. **クラスで つまずいた ところ**（問い・初回の 正答率・よく ある まちがい）
4. **次の 授業で やる こと**（1〜3個）

## 決まり（変えない）

| 決まり | 出典 |
| --- | --- |
| 定期タスクは **すべて 授業ごと**（火・水・金）。週1に しない | 2026-10-11「定期タスクはすべて授業ごとにしたい」 |
| AI の 疑いを 見つけるのは **この 定期タスク**（画面の 機械判定では ない） | 2026-10-11「定期タスク（ただし毎授業後）」 |
| DB は **読むだけ**。insert・update・delete・DDL を しない。issue・メッセージも 送らない | 本番DBは 全環境で 1つ（AGENTS.md） |
| `claude -p` を 使わない | ~/.claude/CLAUDE.md（課金対策） |
| ページは **明るい 地に 濃い 文字だけ**。黒・濃い色の 塗りつぶしを 作らない | 2026-10-11「黒塗りつぶしのところに黒文字は読めない」 |
| 書くのは **日本語**。生徒の 名前は 先生に 呼んで ほしい 名前（`nickname`、無ければ `display_name`） | constraints（なまえ） |

## いつ 走るか

Mac の 定期タスク `records-analysis-after-class`（`30 21 * * 2,3,5`・Mac の 時計）。
Mac が ICT でも 日本時間でも、授業（17:30〜19:00 ICT）の **あと**に なる 時刻を えらんで ある。
アプリが 閉じて いた 日は、次に 開いた ときに 走る。

**対象日** = ICT の 今日。今日が 火・水・金で なければ（遅れて 走った）、直近の 火・水・金。
対象は その 日の **まる1日（ICT 00:00〜24:00）**——授業の 前から 解き始める 生徒が いる（10/6 は 16:46〜）。

## 手順

### 1. 手順書と 教材を 最新に する（作業ツリーには 触らない）

```bash
REPO=/Users/tomy/program/claude/NexmaxAcademy
git -C "$REPO" fetch -q origin main integration
git -C "$REPO" show origin/integration:docs/skills/records_analysis.md   # この 手順書の 最新
git -C "$REPO" show origin/main:content/quizsets/<id>.json                # 問いの 文と 正解（本番の 教材）
```

本体の チェックアウトは 別の ブランチに 置かれて いる ことが ある（AGENTS.md）。**checkout も pull も しない**。
`git show` で 読むだけに する。DB の `studio_contents` に 同じ id の 行が あれば、そちらが 本番の 正（先生の 直し）。

### 2. DB を 読む（Supabase コネクタ `execute_sql`・読むだけ）

`:since` / `:until` は 対象日の `YYYY-MM-DD 00:00:00+07` と 翌日 `00:00:00+07`。

**(a) その 日に 動いた 生徒と 組**

```sql
select p.id, coalesce(nullif(p.nickname, ''), p.display_name) as name, p.university, p.cohort
  from profiles p
 where not p.is_admin and coalesce(p.university, '') <> '講師・スタッフ'
   and (exists (select 1 from content_progress c where c.profile_id = p.id and c.updated_at >= :since and c.updated_at < :until)
     or exists (select 1 from quiz_results q where q.profile_id = p.id and q.created_at >= :since and q.created_at < :until)
     or exists (select 1 from meeting_turn_logs m where m.profile_id = p.id and m.created_at >= :since and m.created_at < :until))
 order by p.university, p.cohort, name;
```

**(b) フォローの 印**（学習の きろくの 画面と 同じ 条件。`src/lib/records/roster.ts`）

```sql
select * from learner_summary where profile_id = any(:ids);       -- ことばの 足ぶみ・会話の miss・修了証
select * from learner_quiz_first where profile_id = any(:ids);    -- もんだいの 初回の 点
```

- 初回の 点が 低い … `first_score / first_max` が その セットの `passRate`（教材。無ければ 70）未満の セットが **2つ 以上**
- ことばで 足ぶみ … `word_stuck_sets >= 1`
- 会話で つまずき … `talk_graded >= 4` かつ `talk_miss / talk_graded >= 0.5`

**(c) クラスで つまずいた 問い**（その 日の、**初回**の こたえだけ）

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

**(d) ことばの 読みの まちがい**

```sql
select term, reading, count(*) as n, (array_agg(distinct reading_input))[1:4] as typed
  from word_test_answers
 where reading_ok = false and created_at >= :since and created_at < :until
 group by term, reading order by n desc limit 10;
```

**(e) 自由に 書いた・話した ことば**（AI の 疑いを 見る 材料）

```sql
select profile_id, quiz_set_id, question_id, answer_text from quiz_results
 where created_at >= :since and created_at < :until
   and question_type in ('free', 'keyword', 'list', 'ranklist', 'bugreport') and length(answer_text) >= 10;
select profile_id, meeting_id, ask, utterance, grade from meeting_turn_logs
 where created_at >= :since and created_at < :until and length(utterance) >= 10;
select profile_id, talk_id, body from talk_turn_logs
 where created_at >= :since and created_at < :until and speaker = 'learner' and length(body) >= 10;
```

### 3. AI の 疑いを 見る（決めつけない）

学習者は N5〜N4（N4 に とどかない 人も 多い）。次の どれかが そろう こたえを「疑い」に 挙げる。

- N2 以上の 語彙・漢語が 続く（例: 「〜に 鑑み」「〜を 踏まえ」「迅速に」「齟齬」）
- 書きことばの 硬い 文体・長い 複文・読点の 打ち方が 整いすぎて いる
- 敬語の 高度な 形（「〜させて いただきたく 存じます」など）を 迷いなく 使って いる
- **その 生徒の ふだんの こたえ**（ほかの 日・ほかの 問い）との 落差が 大きい
- 問いに 書いて いない 情報を 正確に 足して いる

書く ときは **原文を そのまま 引用**し、「どこが N3 を 超えるか」を 1行で 添える。
「使った」と 決めつけず、「先生が 本人に 口頭で 確かめる 候補」として 出す。
該当が 無ければ「なし」と はっきり 書く（ぼかさない。AGENTS.md 規律1）。

### 4. ページを 書き直す

- ページ: https://claude.ai/artifact/6NG8Nmj3EyXXdNizbwvoJR （非公開。**毎回 同じ URL を 更新**する）
- Artifact ツールで `action: "read"` → 中身を 書き直して、同じ `url` で publish する
- 組（大学 × 期生）ごとに 節を 分ける。上から ① フォローが 要る 人 ② AI の 疑い ③ つまずいた ところ ④ 次の 授業で
- 数は 本番DBの 実数だけ。推測の 数を 書かない
- 明るい 地に 濃い 文字だけ。`<title>` は「授業ごとの 回答分析」の まま

### 5. 終わりの 報告

この セッションに 3行で 返す: 対象日・生徒数・フォローが 要る 人数（と AI の 疑い 件数）。
その 日に 1人も 動いて いなければ、ページは 書き直さず「授業の 記録なし」と だけ 返す。
