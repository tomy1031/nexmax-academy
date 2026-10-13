# DB の バックアップと 復元

本番DB（Supabase）を **毎晩 自動で 書き出し**、暗号化して Cloudflare R2 に 置く。
この 文書は「何が 守られて いて」「壊れた とき どう 戻すか」を 書いた 手順書。

- 仕組みの 本体: `.github/workflows/backup.yml`（Actions 名「DBの書き出し（毎晩）」）
- 判断の 部品: `scripts/db_backup.mjs`（テスト `tests/db_backup.test.ts`）
- 決定: 2026-10-11 tomy が A「毎晩 自動で 書き出す（無料）」を 選んだ
  （B: 月1の 手作業・C: Supabase Pro $25/月 と 比べて。`docs/constraints.md` 運用の 制約）
- 経緯: 2026-08-20 の 調査（PR #130）で「戻せる 時点が 1つも 無い」と 分かった（§7）

## 0. 結論（先に 読む）

| 問い | 答え |
| --- | --- |
| 戻せる 時点は | 直近 **35日は 毎日**（`daily/`）、それより 前は **月に 1本・400日**（`monthly/`） |
| どれだけ 失うか | 最大 **約1日ぶん**（GitHub の 定期実行は 3〜5時間 遅れるので、実際は 1日＋数時間） |
| 戻せると 言える 根拠 | **毎晩、ランナーの 中の 空の DB へ 実際に 戻して、表ごとの 件数が 1件も 違わない**ことを 確かめて いる（§2 の 4） |
| 誰が 開けられるか | **tomy の 秘密鍵だけ**（age で 暗号化。§3） |
| 入って いない もの | Storage の ファイル（画像・音声）、ログインの セッション、プロジェクトの 設定（§4） |
| 置き場 | Cloudflare R2 `nexmax-academy-db-backup`（**2026-10-11 時点で 未用意**。§2.1。用意されるまで 毎晩 赤で 止まり、どこにも 保存されない） |

## 1. 何が、どこに あるか（2026-10-11 実測）

DB 全体 24MB（無料枠 500MB）。Postgres 17.6。書き出しは 暗号化・圧縮で 数MB。

| 置き場 | 中身 | 件数 | 書き出しに |
| --- | --- | --- | --- |
| `auth.users` | ログイン（Google 連携） | 35 | **入る** |
| `auth.identities` | Google の アカウント ⇄ users.id の 結びつき | 35 | **入る**（戻した あと Google で 入り直しても 同じ id に なる） |
| `public.users` / `profiles` | 役割 ／ なまえ・学校 | 35 / 35 | 入る |
| `public.completion_certificates` | 修了証 | 136 | 入る |
| `public.word_test_answers` / `word_test_results` | 単語テストの 解答 ／ 結果 | 14,803 / 887 | 入る |
| `public.quiz_results` | もんだいの 解答 | 3,503 | 入る |
| `public.meeting_turn_logs` / `talk_turn_logs` | 会話の ログ | 1,615 / 4 | 入る |
| `public.content_progress` | 教材の 進み | 1,096 | 入る |
| `public.listening_results` / `personality_results` | リスニング ／ 性格診断 | 109 / 44 | 入る |
| `public.studio_contents` | 先生・AI が 直した 教材（**同じ ID なら git に 勝つ**） | 16 | 入る |
| `public.*` その他 | 設定・AI の 窓・旧設計の 空の 表 | 0〜1 | 入る |
| `app.*` | 関数だけ（判定・登録の トリガー関数） | — | 入る（作り） |
| `supabase_migrations.schema_migrations` | 移行の 台帳 | 53 | 入る（extras.sql） |
| `auth.users` の トリガー 2本 | ログインした 人を 名簿に 登録する | — | 入る（extras.sql） |
| `auth.sessions` ほか | セッション・更新トークン・監査ログ | — | **入れない**（§4） |
| Storage `assets` | まんが画像・音声 | 21 ファイル | **入れない**（§4） |

## 2. 毎晩の 書き出し

毎日 19:17 UTC（カンボジア 2:17）に 起きる。**既定の ブランチ（main）に 載った 版**が 動く。
手で 走らせる ときは Actions → 「DBの書き出し（毎晩）」→ Run workflow。

| 順 | すること | 失敗したら |
| --- | --- | --- |
| 1 | `supabase db dump`（**`supabase@2.120.0` に 固定**）で `roles.sql`・`schema.sql`・`data.sql`、psql で `extras.sql` を 書き出す。**本番へは 読むだけ**（pg_dump は 読み取りの スナップショット、psql も `set transaction read only`） | 赤。本番は 何も 変わって いない |
| 2 | 表ごとの 件数と ハッシュの 目録 `manifest.json` を 作り、`tar.gz` に して **age で 暗号化**（宛先は `scripts/db_backup_recipients.txt`） | 赤 |
| 3 | R2 の `daily/nexmax-db-<UTC時刻>.tar.gz.age` に 置く | 赤 |
| 4 | **ランナーの 中に 空の Supabase の DB を 立て**（`supabase db start`）、Supabase 公式の 手順と 同じ 並びで 戻し、**表ごとの 件数を 突き合わせる**。要る 表（auth.users・修了証 など）が 0件でも 落とす | 赤。3 で 置いた ものは **残す**（消さない） |
| 5 | 4 が 通った 夜だけ: その 月の 最初の 1本を `monthly/` にも 置き、古い ものを 消す | 赤 |

**ログは 公開。** 行の 中身は 出さない。4 が 落ちた ときも ERROR の 行だけを、
値を 伏せて 出す（`scripts/db_backup.mjs` の `redactLog`。部品の 名前は 残す）。

**消す きまり**: `daily/` は 35日、`monthly/` は 400日。ただし **新しい 順に daily 7本・
monthly 3本は、どれだけ 古くても 消さない**。書き出しが 何週間も 止まった とき、
日数だけで 消すと **いちばん 大事な 最後の 1本**を 消して しまうため。
名前の 形が 違う もの（人が 手で 置いた もの）も 消さない。

**落ちた とき**: GitHub から ワークフローを 最後に 触った 人へ メールが 届く。
よく ある 原因:

| ログ | 原因と 直し |
| --- | --- |
| 「置き場（R2）の 鍵が ありません」 | §2.1 が まだ。書き出しと 4 は 通って いるが、**保存されて いない** |
| 4 で `column "…" of relation "users" does not exist` | 本番の 認証（GoTrue）が 新しく なり、固定した CLI の 認証より 列が 多い。`SUPABASE_CLI` を 上げて、4 が 通るのを 見る |
| 4 で 件数が 合わない | 本当に 戻せて いない。**放置しない**。ログの 表名から 調べる |
| 「要る 表が 1件も 入って いない」 | 鍵が 別の DB を 指して いる／本番が 空に なった。**すぐ 本番を 見る** |
| ラン が 灰色で ジョブ 0件（`action_required`） | GitHub が「怪しい ワークフロー」と して 止めた（docs/deploy.md §0.16）。画面で Approve and run |

### 2.1 置き場の 用意（1回だけ・tomy の 手作業）

R2 は このアカウントで **まだ 有効に なって いない**（2026-10-11 に `wrangler r2 bucket list` が
`Please enable R2 through the Cloudflare Dashboard. [code: 10042]` を 返した）。
Cloudflare は Workers の $5 プランなので、支払い方法は 登録ずみの はず。R2 は 保存 10GB／月までは
追加の 請求が 無く、この 書き出しは 35本＋13本 × 数MB で 1GB にも 届かない。

1. Cloudflare ダッシュボード → **R2** → 有効化（R2 の プランを 足す 確認が 出る。0円）
2. **Create bucket** → 名前 `nexmax-academy-db-backup`（場所は 自動で よい・公開は しない）
3. R2 → **Manage API tokens** → Create → 権限 **Object Read & Write**・対象は
   **この バケットだけ**・期限なし → 作成後の 画面に 出る 3つを 控える
4. GitHub → Settings → Environments → **Preview** → Environment secrets に 3つ 登録:
   - `R2_ENDPOINT` … `https://<アカウントID>.r2.cloudflarestorage.com`（画面に 出る 形の まま）
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
5. Actions →「DBの書き出し（毎晩）」→ Run workflow → 緑で 終わり、最後の ステップに
   `✓ 今夜の 書き出し: daily/…` が 出れば 完了

アカウントIDは 内部識別子なので、**ドキュメントや コードに 直書きしない**（Secret に だけ 置く）。

## 3. 鍵（暗号化）

| | 置き場 | 公開して よいか |
| --- | --- | --- |
| 公開鍵（宛先） | `scripts/db_backup_recipients.txt` | よい（暗号化 しか できない） |
| 秘密鍵 | tomy の Mac `~/.config/nexmax-academy/db-backup-age-key.txt`（権限 600） | **だめ**。リポジトリ・GitHub・Cloudflare の どこにも 置かない |

- **秘密鍵を 失くすと、それまでの 書き出しは 全部 開けなく なる。** Mac が 壊れても
  困らない ように、**パスワードマネージャ等に 写しを 1つ 置く**（中身は 1行の 文字列）。
- 秘密鍵を 誰かに 見られたら: 新しい 鍵を 作って 宛先を 差し替える（下）。古い
  書き出しは 古い 鍵で しか 開かないので、**古い 鍵も 35〜400日は 消さない**。
- 宛先は 複数 書ける（1行 1つ）。紙に 印刷した 予備の 鍵を 足す、なども できる。

```bash
# 鍵を 作る（作り直す ときも 同じ。表示される Public key を 宛先の ファイルへ）
age-keygen -o ~/.config/nexmax-academy/db-backup-age-key.txt
```

```bash
# 宛先と 秘密鍵が 合って いるかの 突き合わせ（平文は 出ない）
echo ok | age -R scripts/db_backup_recipients.txt | age -d -i ~/.config/nexmax-academy/db-backup-age-key.txt
```

## 4. 入って いない もの・既知の 穴

| もの | なぜ 入れないか | 失った ときの 戻しかた |
| --- | --- | --- |
| **Storage の ファイル**（`assets` の 画像・音声 21個） | Supabase の 書き出しは DB だけ。有料プランの バックアップでも 対象外 | 作り直し。バケットと 権限は `supabase/migrations/20260805001747_studio_assets_bucket.sql` の 中身を 流す |
| `auth.sessions`・`refresh_tokens`・`flow_state`・監査ログ など | 戻しても 使えない うえ、**ログインの 合鍵に 近い** | 戻した あと 全員が Google で 入り直す（**同じ id の まま**） |
| プロジェクトの 設定（Google の ログイン設定・Redirect URLs・Site URL） | DB の 外 | ダッシュボードで 入れ直す（docs/deploy.md §0.3） |
| API の 鍵（anon・service_role）・JWT の 秘密 | DB の 外。新しい プロジェクトでは 変わる | アプリの 環境変数を 差し替える（§5.3） |
| Edge Function（`supabase/functions/`）と その 秘密 | コードは git、秘密は Supabase の 設定 | デプロイし直し、秘密を 入れ直す（docs/deploy.md §0.18） |

ほかの 穴:

- **認証（GoTrue）の 版ずれ。** 戻して みる（§2 の 4）は 固定した CLI の 認証を 使う。
  本番の 認証が 列を 足すと 4 が 赤に なる——そう なったら `SUPABASE_CLI` を 上げる。
  書き出し そのもの（1〜3）は 通って いるので、その 夜の ぶんは 保存されて いる。
- **GitHub が ワークフローを 止める ことが ある**（docs/deploy.md §0.16）。止まると
  書き出しも 止まる。週に 1回 Actions の 一覧で 緑が 並んで いるかを 見る。
- **2026-08-20 の 調査に あった「git に 無い SQL」**（`academy_core_schema` ほか）は、
  その後 `supabase/migrations/` に 入った。いずれに しても 書き出しは **DB の 今の 姿**を 写す。

## 5. 戻しかた

**本番DBへ 書くのは、tomy の 承認を 得てから。** 戻す 作業の 前半（取り出す・
別の 場所で 確かめる）は 承認なしで 進めて よいが、本番へ 書く SQL は 見せて から 流す。
作業は **リポジトリの 外の 自分専用の フォルダ**で 行い、終わったら 平文を 消す。

### 5.1 取り出す（どの 場合も 共通）

```bash
mkdir -m 700 ~/nexmax-restore && cd ~/nexmax-restore
```

1. 取ってくる: Cloudflare ダッシュボード → R2 → `nexmax-academy-db-backup` →
   `daily/`（古い ものは `monthly/`）→ 欲しい 日の ファイル → Download
2. 開ける（tomy の 秘密鍵が 要る）:

```bash
age -d -i ~/.config/nexmax-academy/db-backup-age-key.txt -o backup.tar.gz nexmax-db-2026-10-11T1917Z.tar.gz.age
```

```bash
tar xzf backup.tar.gz && ls nexmax-db-*/
```

3. 壊れて いないか: `manifest.json` の `files.*.sha256` と 比べる

```bash
cd nexmax-db-*/ && shasum -a 256 *.sql && cat manifest.json
```

中身は `roles.sql`（役割の 設定。Supabase が 付ける 設定値の 権限 `GRANT SET ON PARAMETER` は
戻すと 止まるので、`-- [db_backup]` の 注記つきで 無効に して ある）・`schema.sql`（表・関数・RLS）・`data.sql`（中身）・
`extras.sql`（移行の 台帳と auth.users の トリガー）・`manifest.json`（件数と ハッシュ）。

### 5.2 一部だけ 戻す（いちばん 多い: まちがえて 消した・上書きした）

1. 5.1 で 取り出す
2. **本番では ない 空の 場所**に 戻す（§5.4 の どれか）
3. そこで 要る 行を 探し、本番へ 戻す SQL を 書く（`insert … on conflict do nothing` など、
   **今の 行を 壊さない 形**）
4. tomy に SQL と 件数を 見せて 承認を 得て から、本番へ 流す
5. 流した あと、件数を 本番で 数えて 確かめる

### 5.3 まるごと 戻す（プロジェクトが 消えた・使えない）

1. Supabase で 新しい プロジェクトを 作る（Postgres 17・同じ 地域）。
   Connect → **Session pooler** の 接続文字列を 控える（docs/deploy.md §0.8）
2. 新しい プロジェクトの 既定の 権限を 外す（書き出しの 権限を そのまま 効かせる ため。
   Supabase CLI の 文書に ある 手順）:

```bash
psql "$NEW_DB_URL" -c 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;'
```

3. 戻す（Supabase 公式「Backup and restore using the CLI」と 同じ 並び。1つの トランザクション）:

```bash
psql "$NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data.sql -f extras.sql
```

4. Storage: `supabase/migrations/20260805001747_studio_assets_bucket.sql` の 中身を 流し、
   ファイルは 作り直す（§4）
5. プロジェクトの 設定: Authentication → Google の 設定・URL Configuration（docs/deploy.md §0.3）
6. アプリの 向き先を 変える: Environment「Preview」の `NEXT_PUBLIC_SUPABASE_URL`・
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`（**ビルド時に 焼き込まれる**ので、差し替えて から デプロイ）・
   `SUPABASE_DB_URL`（`node scripts/register_db_secret.mjs <project-ref>`）・
   `SUPABASE_SERVICE_ROLE_KEY`、Edge Function（docs/deploy.md §0.18）
7. 確かめる:
   - 件数: `manifest.json` の `rows` と 新しい DB の 件数が 同じ
   - `node scripts/check_migrations.mjs --strict`（台帳が そろって いる）
   - `node scripts/check_rls.mjs --strict`（他人の データが 読めない）
   - STG で ログインして 名簿・修了証が 出る

### 5.4 戻せるかの 確かめ（空の 場所へ。本番には 書かない）

**毎晩、機械が やって いる。** ワークフローの 4 が、その 夜の 書き出しを ランナーの 中の
空の DB へ 戻し、件数を 突き合わせる。ログに こう 出て いれば その 夜の ぶんは 戻せる:

```
✓ 32表・22357件、すべて 空の DB へ 戻せました      ← 2026-10-11 の 試し走り（ラン 38131020215）
```

残る のは **「暗号化した ものを、tomy の 鍵で 開けられるか」**だけ。ランナーが 戻せたのは
`manifest.json` に ハッシュが 書いて ある その ファイル そのもの なので、**手元で 開けて
ハッシュが 合えば、鎖が 最後まで つながる**。3か月に 1回と、鍵を 替えた とき に やる:

1. §5.1 の 1〜3 を 行い、`shasum` が `manifest.json` と 全部 一致する ことを 見る
2. 平文を 消す（`rm -rf ~/nexmax-restore`）

**自分の 手で 空の DB へ 戻して みたい とき**（CLI の 版を 上げる 前・大きな 移行の 前など）は、
次の どちらかに 戻す。**本番の 接続文字列は 使わない。**

- **A. 2つめの 無料プロジェクト**（Supabase の 無料枠は 2つまで）: §5.3 の 1〜3 を その
  プロジェクトに 対して 行い、件数を 比べる。終わったら プロジェクトを 消す
- **B. 手元の Docker**（Docker Desktop が 要る）:

```bash
mkdir -p /tmp/nexmax-drill && cd /tmp/nexmax-drill && npx --yes supabase@2.120.0 init && npx --yes supabase@2.120.0 db start
```

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres --single-transaction -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data.sql -f extras.sql
```

```bash
cd /tmp/nexmax-drill && npx --yes supabase@2.120.0 stop --no-backup
```

## 6. 更新の きまり

- **表を 足した**: 何も しなくて よい（新しい 表は 自動で 書き出しに 入り、毎晩 戻して 確かめる）
- **auth から 残す 表を 変える**: `scripts/db_backup.mjs` の `AUTH_TABLES_TO_KEEP` と その 理由
- **守る 表を 足す**（0件なら 落とす 一覧）: 同じ ファイルの `REQUIRED_TABLES`
- **CLI の 版を 上げる**: `backup.yml` の `SUPABASE_CLI`。上げた あと 手で 1回 走らせ、4 が 緑で 終わるのを 見る
- **残す 日数**: `backup.yml` の `KEEP_DAILY_DAYS`・`KEEP_MONTHLY_DAYS`
- §1 の 件数は 大きく 変わったら 直す（毎晩の ログにも 出る）

## 7. 経緯 —— 2026-08-20 の 調査（PR #130）

当時の 結論は「**バックアップは 動いて いない。戻せる 時点が 1つも 無い**」。

- Supabase の 自動バックアップは Pro 以上（$25/月〜）の 機能で、無料プランは
  「自分で 書き出して 外に 置く」前提（[Database Backups](https://supabase.com/docs/guides/platform/backups)）
- リポジトリにも 端末にも 定期の 書き出しは 無かった
- 壊れかたは 2種類: **上書き・消し込み**（2026-08-04 に 本人の 診断結果を 上書きする 事故が
  実発生）と **プロジェクトごと 消失**（削除・無料枠の 停止）。どちらも 書き出しで しか 戻せない
- 当時は「事前に SQL で 退避してから 触る」という **手作業の ルール**だけで 防いで いた
  （docs/skills/browser_e2e_verification.md）。**この ルールは 今も 有効**——毎晩の 書き出しは
  最大 1日ぶんを 失うので、検証で 本番の 行を 触る ときは 引き続き 先に 退避する

当時の 案（A 毎晩・B 月1手作業・C Pro）から、2026-10-11 に A を 選んだ。
当時の 案では 書き出し先を Actions の artifact と して いたが、**このリポジトリは public**
なので 採らなかった（artifact は ログインした 誰でも 取れる）。
