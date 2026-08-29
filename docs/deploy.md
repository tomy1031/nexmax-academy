# デプロイ / 環境構成

> **移行済み（2026-08-03）**: ホスティングは **Cloudflare Workers** が本番。手順は §0。
> Supabase（DB・認証）は移していない。移したのはホスティングだけ。
>
> **切り離し済み（2026-08-04）**: Supabase の **Site URL は Cloudflare に切替**、
> Vercel の **Git 連携は解除**した（push しても再デプロイされない）。
> プロジェクトと `nexmax-academy.vercel.app` は残置してある（削除は不可逆なため保留）。
>
> **§1〜§3 は Vercel 時代の記述（旧）。** もう手順としては使わない。Vercel プロジェクトを
> 消したら削除してよい。**§4「同一 Supabase を共有する上での運用注意」はホストに
> 依存しないので残す**（ローカル・staging・本番が同じ DB を見る話）。

## 0. Cloudflare Workers（新・移行先）

OpenNext（`@opennextjs/cloudflare`）で Workers 上に載せる。旧 `@cloudflare/next-on-pages` は使わない。

### 0.1 コマンド

```bash
npm run cf:preview   # ローカルの workerd で確認（ビルド＋プレビュー）
npm run cf:deploy    # 本番へデプロイ（秘密ガード＋ビルド＋deploy）
npm run cf:branch    # 今のブランチ専用の確認URLを更新（作業中はこれを使う）
npm run cf:staging   # STG を更新。**`integration` の中身のときだけ実行できる**（ふだんは自動）
npm run cf:upload    # バージョンだけ上げる（エイリアスは付けない）
```

| | URL | 載るもの | いつ更新されるか |
|---|---|---|---|
| 本番 | `https://academy.nexmax.workers.dev` | `main` | **火・水・金 16:12〜17:12 ICT に自動**（授業は 17:30。5回 起きて 必要なときだけ 1回 出る）。緊急は手動 dispatch |
| STG（統合版） | `https://staging-academy.nexmax.workers.dev` | `integration` | `integration` へマージするたび**自動** |
| ブランチ確認用 | `https://<ブランチ名>-academy.nexmax.workers.dev` | 作業ブランチ | `npm run cf:branch` |

**STG は門番、本番は届け先**（2026-08-27 から。§0.6）。作業ブランチは `integration` へ
PR し、STG で確かめてから `main` へ昇格する。

**`cf:upload` では staging は更新されない。** `--preview-alias` を渡していないため、
新しいバージョンが上がるだけで `staging-` のURLは古い版を指したまま。

#### なぜ確認URLをブランチごとに分けるのか

**`versions upload` はブランチの中身を確認URL全体に載せる。** 部分デプロイという
概念が無いので、複数のセッションが同じ `staging` へ上げると、
**最後に上げた者以外の作業が確認URLから消える。**

2026-08-04、性格診断の文言だけを上げたつもりで main 未取り込みのブランチを
`staging` へ上げたところ、main にあったマップの7コミット（7エリア構成・雲海・
蛇行の修正）が staging から巻き戻る事故が実際に起きた。
バンドルに自分の文字列があることの確認では、**消えたものは検出できない。**

そこで `scripts/preview_alias.mjs` が次を強制する。

- ~~`staging` は main からしか上げられない~~
  → **2026-08-27: `staging` は `integration` からしか上げられない**（作業ブランチからは
  exit 1 で止まる）。**ガードを外したのではなく、比べる相手を移した。**
  判定の仕組み（ブランチ名ではなく**中身**が `origin/integration` と同一か）は
  そのままで、`MAIN_BRANCHES` に名前を足すだけの方式は**採っていない**——
  それだと名前さえ合えば中身が何でも通り、上の巻き戻し事故が再び開く
  （`tests/preview_alias.test.ts`「中身が違う作業ブランチからは上げられない」が守っている）
- 作業ブランチは `npm run cf:branch` で自分専用のURLへ上げる
- ブランチ名は Cloudflare の制約（英小文字・数字・ダッシュ、先頭は英小文字、
  Worker名込みで63文字）に合わせて自動変換される

**確認URLが分かれてもデータは分かれない。** Worker のバインディングは同じなので
Supabase は全ブランチで同一プロジェクトを見る。壊れはしないが「別環境」ではない。

### 0.2 環境変数の渡し方 — ここが最大の罠

**`NEXT_PUBLIC_*` はビルド時に必要**。バンドルへ literal として埋め込まれるので、
`wrangler secret` で後から入れても手遅れ（クライアントチャンクに焼き込まれた値は変わらない）。

**逆に、秘密鍵はビルド環境に置いてはいけない。**
OpenNext の `compileEnvFiles` は `.env` / `.env.<mode>` / `.env.local` /
`.env.<mode>.local` の**中身を丸ごと** `.open-next/cloudflare/next-env.mjs` に書き出し、
それが Worker のバンドルに入る。`.env.local` に `SUPABASE_SERVICE_ROLE_KEY` を
置いたままビルドすると、**service_role key がデプロイ成果物へ同梱される**
（ブラウザには出ないが、ダッシュボードでコードを読める相手には見え、
再ビルドなしに失効させられない）。

`npm run cf:build` は `scripts/check_build_env.mjs` でこれを検査して止める。
`cf:deploy` / `cf:upload` はこのガードを必ず通る。

| 変数 | 渡し方 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **ビルド時**（シェル環境変数 or 公開値だけの `.env.production`） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **ビルド時**（同上） |
| `SUPABASE_SERVICE_ROLE_KEY` | ビルド時に渡さない。実行時に必要になったら `wrangler secret put` |
| `GEMINI_API_KEY` | 置かない（BYOK方式。§3 の注記と同じ） |

ローカルの `.env.local` に秘密が入っている場合は、ビルド中だけ退避する:

```bash
mv .env.local .env.local.holdaside
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run cf:deploy
mv .env.local.holdaside .env.local
```

> なお `SUPABASE_SERVICE_ROLE_KEY` は現在**コードから参照されていない**
> （`src/lib/env.ts` に optional で宣言があるだけ）。実際に使い始めるまでは
> ビルド環境にもランタイムにも不要。

### 0.3 Redirect URLs（workers.dev はワイルドカードが効かない）

workers.dev のホストは `academy.nexmax.workers.dev` のように
**ラベルが2つ**入る。Supabase の `*` は1ラベルしか食わないため
`https://*.workers.dev/auth/callback` では一致しない。逐語で登録する。

```
https://academy.nexmax.workers.dev/**
https://*-academy.nexmax.workers.dev/**
```

2行目が**ブランチごとの確認URLを全部まとめて許可する行**。`staging-academy…` も
`claude-xxx-academy…` も、将来増えるエイリアスもこれ1行で通るので、
**エイリアスを増やすたびに登録し直す必要はない。**

#### 効かないのは `*.workers.dev` の形だけ — ホスト名の一部なら効く

見出しの「ワイルドカードが効かない」は**ラベルを跨ぐ場合の話**。
区切り文字は `.` と `/` で、`*` はそれを跨がない。

| パターン | 判定 | 理由 |
|---|---|---|
| `https://*.workers.dev/**` | ✗ | `*` が `academy.nexmax` の `.` を跨げない |
| `https://*-academy.nexmax.workers.dev/**` | ✓ | `*` が食うのは `staging` など**1ラベル内の一部**だけ |

プレビューURLは既定では `<version>-<worker>.<subdomain>.workers.dev` とバージョンごとに
変わる。versioned のほうも同じラベル内で変わるだけなので、この1行に含まれる。

#### 末尾の `/**` が必須。`/auth/callback` の完全一致では動かない（実測）

**戻り先は `?code=...` が付いた状態で照合される。** そのため
`https://academy.nexmax.workers.dev/auth/callback` を完全一致で登録しても、
実際のログインでは一致せず Site URL へフォールバックする。

実測した対照結果:

| 渡した `redirect_to` | 判定 |
|---|---|
| `workers.dev/auth/callback`（クエリなし） | 受理 |
| `workers.dev/auth/callback?code=...` | **拒否** ← 実フローはこれ |
| `vercel.app/auth/callback?code=...` | 受理 |
| `vercel.app/anything/deep/path` | 受理 |

**Vercel が常に動いていたのは登録が正しかったからではなく、Site URL 配下が
暗黙にすべて許可されるため。** 移行先を Site URL 以外に置くときは、この暗黙の
許可が効かないことを前提に `/**` を明示する。

`**` は区切り文字（`.` と `/`）を含む任意の文字列に一致する
（[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) の
ワイルドカード表）。`*` は区切りを跨がないので `/auth/callback` に届かない。

#### 登録できているかを、ログインせずに確かめる方法

Supabase の auth ログは**実際に採用した戻り先**を `referer` として記録する。
これを使うと、Google の認証情報なしに登録の成否を判定できる。

**必ず `?code=` を付けて試すこと。** クエリなしで試すと、完全一致登録でも
通ってしまい**誤って「登録できている」と判定する**（実際にこの誤判定をやらかした）。

```bash
SB=https://ytlmwhovgvpdmmxyfmuz.supabase.co
R="https://academy.nexmax.workers.dev/auth/callback?code=testvalue"
enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$R")
curl -s -o /dev/null "$SB/auth/v1/authorize?provider=google&redirect_to=$enc"
```

叩いたあと Supabase の auth ログ（MCP なら `get_logs(service:"auth")`）で
`path` が `/authorize` の最新エントリを見る。

- `referer` が**渡したURLそのもの** → **登録できている**
- `referer` が **Site URL**（例 `https://nexmax-academy.vercel.app`）→ **未登録**。
  フォールバックが起きている

`/authorize` の `Location` ヘッダには渡した `redirect_to` がそのまま載るだけで
判定には使えない（未登録でも同じに見える）。**ログを見ること。**

#### Redirect URLs の全量（2026-08-05 時点・ダッシュボードで実物を確認）

```
http://localhost:3000/**
https://academy.nexmax.workers.dev/**
https://staging-academy.nexmax.workers.dev/**
https://*-academy.nexmax.workers.dev/**    ← 2026-08-05 追加。ブランチ確認URL用
```

4行目が**ブランチごとの確認URLを一括で許可する行**。3行目はこれに含まれるので
消してよい（残しても害はない）。**エイリアスを増やしても追加登録は要らない。**

Vercel の2本（`nexmax-academy.vercel.app` / `*.vercel.app`）は移行完了に伴い削除済み。

登録直後に実測した対照（§0.3 の手順そのまま）:

| 叩いた `redirect_to` のホスト | auth ログの `referer` | 判定 |
|---|---|---|
| `claude-…-academy.nexmax.workers.dev` | **渡したURLそのもの** | 登録できている |
| `not-registered-host.example.com` | **Site URL へフォールバック** | 未登録（＝検査が判別できている証拠） |

**旧リスト（`/auth/callback` 完全一致）は5本とも機能していなかった。** 実測で
`http://localhost:3000/auth/callback?code=...` も
`https://some-branch.vercel.app/auth/callback?code=...` も拒否されることを確認した。
つまり**ローカル開発のログインもブランチプレビューのログインも、元から
本番へ飛ばされていた**（§4-1 が「症状」として書いていた現象そのもの）。
`https://nexmax-academy.vercel.app` だけが動いていたのは Site URL の暗黙許可のため。

### 0.5 Worker の大きさ（無料枠 gzip 3MiB）— 2026-08-16 に一度これで止まった

**この上限は「サーバで動くコードを zip した大きさ」**で、通信量・保存量・アクセス数とは別。
超えると deploy が `code: 10027 / Your Worker exceeded the size limit of 3 MiB` で止まる。
**D1・KV・R2 にデータを逃がしても効かない**（コードは実行時にストレージから読めない）。
静的アセット（`.open-next/assets/` の画像・クライアントJS・フォント）は**この上限に含まれない**。

見張り: `npm run check:size`（**2.8MiB 警告・3.0MiB で失敗**）。CI の `size` ジョブが同じものを走らせる。
資格情報は要らない（`wrangler deploy --dry-run` で測る）。

**2026-08-16 の実例**: 上限まで残り 5 KiB（3066/3072）まで来ていたことに誰も気づかず、
教材追加の PR をマージした瞬間に STG が止まった。原因は機能の量ではなく**ビルドの無駄3つ**:

| 直したこと | 削減（gzip・実測） | どこ |
| ---------- | ------------------ | ---- |
| Wrangler が OpenNext の出力を**束ね直すときに圧縮していなかった** | ▲333 KiB | `wrangler.jsonc` の `minify: true` |
| ビルド道具（Turbopack）が**同じ塊を何度も出していた**（zod 6コピー・supabase-js 3コピー） | ▲892 KiB | `package.json` の `build: next build --webpack` |
| 和文フォントの `preload` で**358分割のファイル一覧**が全ページぶん焼き込まれていた | ▲19 KiB（raw ▲607 KiB） | `src/app/layout.tsx` の `preload: false` |

結果 **3066 → 1822 KiB（59%）**。フォントの方は副次効果が大きく、**各HTMLから preload タグが
310本（1ページ約31KB）消えた**——学習者の回線にも効く。

> **`--webpack` を外さないこと。** Turbopack に戻すと zod が6コピーに戻り、また上限に近づく。
> ビルドは webpack のぶん遅いが、それは意図した取引。

まだ残っている無駄（次に効く順）: Live の SDK がサーバ側にも入っている（gzip ~130 KiB。
クライアント専用にすれば消える）／焼き込みコンテンツが2コピー（~78 KiB）／
先生向け `/admin`・`/studio` の SSR（~50〜100 KiB）。

### 0.4 恒久の制約

- **`src/middleware.ts` を `proxy.ts` に改名しない。** `next build` の
  "middleware is deprecated" 警告は意図して無視する。Next.js 16 の proxy は
  Node ランタイム固定で、OpenNext は Node middleware を検出してビルドを止める
  （AGENTS.md 絶対規律 8・計画書 §2.3）
- `compatibility_date` は `2025-05-05` 以降が必須（`FinalizationRegistry` 対策）
- **`public/_headers` を消さない。** `/_next/static/*` に
  `Cache-Control: public,max-age=31536000,immutable` を付けている。Workers の静的アセットは
  既定が `max-age=0, must-revalidate` で、①画面を開くたび全部品をサーバへ問い合わせる
  （回線の細い学習者に効く）②デプロイ直後はその問い合わせが 404 になり、**手元に持っている
  部品まで使えなくなる**。`/_next/static/` の名前には中身のハッシュが入るので immutable で安全
  （2026-08-18「This page couldn't load が頻発する」で導入）
- **デプロイ直後の `ChunkLoadError` は 0 にはできない。** Workers の静的アセットは
  **いま出ているデプロイのぶんしか置かれない**ので、開きっぱなしのタブが次のページへ進むと
  古い名前（`app/map/page-<ハッシュ>.js`）が 404 になる。受け止めは
  `src/app/global-error.tsx` — 部品の取りこぼしと分かったときだけ**自動で1回だけ読み直す**
  （`src/lib/stale-asset.ts`。二度目からは学習者が押すボタンに落とす）
- `incrementalCache` は **KV**（2026-08-13 導入）。学習者ページ14ルートが
  `revalidate = 60` の ISR なのにキャッシュが無く、全アクセス＋全プリフェッチが
  フルSSRになって CPU 上限超過（Error 1102）が多発したため。KV は無料枠内
  （読み 10万/日・書き 1000/日。書きは60秒経過後の再生成時のみ）。R2 は
  アカウント未有効（有効化に課金設定が必要）なので使わない。
  ネームスペース: `academy-next-inc-cache-v2`（wrangler.jsonc に ID 直書き）。
  旧 `academy-next-inc-cache` は 2026-08-27 に**中身ごと**片づけた（14,334件・約1.24GB が
  残っており、無料枠 1GB を超えていた。鍵ごとの削除は1日1000件で14日かかるので
  **namespace ごと消す**——管理操作なので鍵単位の枠とは別枠）。
  裏側の再生成は `WORKER_SELF_REFERENCE`（自分自身へのサービスバインディング）
  経由。**ブランチ確認URLでは再生成が本番 Worker に飛ぶため、ブランチURLの
  ISR ページは古いままになることがある**（本番・STG は正常）。設定本体は
  `open-next.config.ts`

### 0.6 リリースの輪 — `integration` で門番、`main` で届ける

ユーザーはクライアント。**AI が PR → `integration` へマージ → STG（自動）まで進める。**
ユーザーは PR もマージもデプロイもしない。**本番へは授業の前に時刻で自動で出る。**

> **2026-08-27 に STG の配信元を `integration` へ移した。**
> それまで STG は **main の中身しか載せられなかった**ので、「STG で確認する」には
> 先に main へ統合するしかなく、**STG が門番になっていなかった**
> （もう戻せないものを、あとから見る場所になっていた）。ユーザーの言葉:
> 「mainと同じブランチで動くSTGには価値がないと思います。各ブランチの変更が全て
> mainに統合しないとSTG確認できない状態のため、STG環境は別な統合ブランチにして、
> OKならmainに統合したい」。
>
> **これは「本番OK 待ち」の復活ではない。** 待つ相手は人ではなく**時刻**である
> （下の 2026-08-21 の決定と矛盾しない）。

> **2026-08-21 に「本番OK 待ち」をやめた。**（この決定は今も生きている）
> それまでは「STG で確認 →『本番OK』が出たものだけ本番へ」だったが、
> 「これチェックする時間がないため、対応終わったら速攻でデプロイしてください」の指定で
> 反転した。**待っているあいだ本番が古いままになるほうの害が大きい**——2026-08-18 の実測で
> STG は1日14回更新されたのに本番リリースは2回、3件が本番待ちのまま忘れられていた。
> **ユーザーに「本番OK と返してください」と求めてはならない。**
> 台帳の正は `docs/constraints.md`（打ち消し線つきで経緯も残してある）。

#### ふだんの道

1. **`origin/integration` を取り込む** — 作業開始時と PR 作成前に。
2. **機械の検査を通す** — `npm test` / `npm run e2e` / `typecheck` / `lint` /
   `lint:content` / `check:size`。PR の CI（`check` / `e2e` / `size`）が緑になること。
   **人の確認はリリースの条件にしない。**
3. **`integration` へマージ** — AI がマージする。PR の宛先も `integration`。
   **STG は `integration` への push で自動更新**（deploy.yml）。
   STG の `/api/version` が `origin/integration` の SHA になったことを確認する。
4. **本番は待つ（何もしない）** — 授業のある **火・水・金の 16:12 / 16:26 / 16:38 /
   16:51 / 17:12 ICT**（＝09:12〜10:12 UTC）にワークフローが起き、
   **出す必要があるときだけ 1回**、`integration` → `main` を早送りして本番へ出す。
   ビルドから検証まで6〜10分なので、最後の 17:12 でも**授業（17:30 ICT）の前に完了する**。
   起こす回数を 1本から 5本に増やしたのは 2026-08-29（§0.11）。
5. **報告** — 「URL＋操作＋見るポイント」は添えるが、**OKを求めない**。
   見るのはユーザーの都合のよいときでよい。

`npm run handoff` の「■ 本番待ち」は、**出し忘れの見張り**として残っている
（本番 `/api/version` と `origin/integration` の差分）。ここに出ているのは
「次の授業前に届くもの」である。何日も居座るなら自動デプロイが落ちているので、
Actions を見る。

#### 緊急の道（バグ・授業当日の事故）

1. `main` から切って `main` へ PR する（`integration` を経由しない）。
2. CI green でマージ。
3. **すぐ本番へ出す**:

   ```bash
   gh workflow run deploy.yml -f target=production
   ```

   `gh` が無いセッション（Claude Code on the web 等）では GitHub MCP の
   `actions_run_trigger` を使う（`run_workflow` / `deploy.yml` / ref=main /
   inputs `{target: production}`）。**ユーザーにコマンドを叩かせない**
   （「デプロイ作業をユーザーにやらせない」— constraints.md 2026-08-14）。
4. **`main` を `integration` へ戻しマージする。** 忘れると次の昇格が
   「早送りできません」で止まる（ワークフローがそう作ってある。取り残しを作らないため）。
5. **載ったことを確かめる** — ワークフロー自身が `/api/version` を突き合わせて、
   一致しなければ落ちる。完走を見届け、
   `https://academy.nexmax.workers.dev/api/version` の `sha` が origin/main と
   同じであることを自分でも確かめてから報告する。

#### 「変わってない」と言われたら、まずURLを確かめる

2026-08-22 に実際に起きた: STG だけ更新し、本番を「本番OK 待ち」で止めていたため、
ユーザーがふだん開く本番URLでは何も変わっていなかった。

|            | URL                                          | 載るもの      | 更新のされかた                                    |
| ---------- | -------------------------------------------- | ------------- | ------------------------------------------------- |
| 本番       | `academy.nexmax.workers.dev`                 | `main`        | **火・水・金 16:12〜17:12 ICT に自動**（5回 起きて 必要なときだけ 1回）。緊急は手動 dispatch |
| STG        | `staging-academy.nexmax.workers.dev`         | `integration` | `integration` への push で自動                    |
| ブランチ用 | `<ブランチ名>-academy.nexmax.workers.dev`    | 作業ブランチ  | `npm run cf:branch`                               |

#### STG は「作りおきゼロ」で出る — 遅くても仕様（2026-08-27）

STG のデプロイは **KV へ1件も書かない**（`scripts/preview_alias.mjs` の
`shouldPopulateRemoteCache`）。統合ブランチ運用で STG の更新が頻繁になるため、
1回 約70件 × 1日十数回で無料枠（書き込み 1000件/日）を食い潰し、
**その日の本番が作りおきゼロで出る**——という 2026-08-26 の事故を構造から断つ。

- 代償は**各ページ初回の 1〜2秒のフルSSR**。開いたページから後追いで温まる。
  STG を見るのは基本ひとりなので許容する（Error 1102 は30人同時の話）。
- **`scripts/loadcheck.mjs` を STG に向けると悪い数字が出るが、仕様どおり。**
  負荷の確認は**本番に向けて**行うこと。
- 置き場は **KV のまま**にしてある。assets モードにすると先生の直し（DB）が
  STG に出なくなり、管理画面での確認が壊れるため（open-next.config.ts）。
- **本番は従来どおり全ページ温める**（`cf:deploy` が中で `populateCache` を呼ぶ）。
  `scripts/lib/cache_populated.mjs` の見張りは本番側で使い続ける（§0.9）。

どこが何を載せているかは `/api/version` の `sha`（ビルド時のコミット）で分かる。
**ログインなしで中身まで見たいときは `/api/<でたらめな名前>` を開く**——
middleware は `/api/` を素通しするので、404 の画面がそのまま見える
（ふつうのパスは未ログインだとタイトル画面へ 307 されて、中身が見えない）。

### 0.7 同時アクセス（授業）と無料枠 — 2026-08-25 に 20人同時プレイで上限超過

単語ゲーム（ことばアーケード）を授業で 20人が同時に開いたとき、Cloudflare の
上限超過エラーが出た。ゲーム自体はプレイ中にサーバへ何も送らない（進捗は端末保存）。
重かったのは**入室の瞬間**のリクエストで、内訳は次の3種類だった。

| 消費源 | 仕組み | 対策（実施済み） |
| --- | --- | --- |
| Link の先読み | マップ・一覧の Link は「見えた瞬間」全ページを先読みする（1人あたり数十リクエスト） | 学習者画面の Link を全部 `prefetch={false}` に。クリック時に1回だけ取りに行く |
| 画像が Worker 経由 | `/_next/image` は変換バインディング（有料）が無いと**素通しなのに Worker を1回消費** | `images.unoptimized: true` で静的アセット直配信（カウント外・無制限）に |
| ISR の作り直し | 見られているページは revalidate ごとに 裏で再SSR＋KV書き込み（無料枠 書き1000/日をデプロイと取り合う） | `revalidate` 60→300秒。読みは `withRegionalCache` で拠点キャッシュに吸収 |

**無料枠の数字**（超えたときのエラー）:

- リクエスト **10万/日**（超えると Error 1027・日付が変わる UTC 0時 = 日本朝9時まで全員止まる）
- CPU **10ms/リクエスト**・メモリ 128MB（超えると Error 1102。フルSSRの多発が引き金）
- KV **書き 1000/日**（超えるとデプロイの `populateCache` も落ちる。§0.6 の「まとめて出す」の理由）
- 静的アセット（画像・JS・音）は**無制限・カウント外**。「Worker を通る回数を減らして
  アセットに逃がす」が無料枠での基本方針

**授業の前に確かめる**: `node scripts/loadcheck.mjs <URL>` で主要ページに 20並列を
当てて、全部 200 で返るかを見る（総リクエスト数は小さく抑えてある。本番の無料枠を
食うので、回数を増やして連打しない）。

**当日の様子を見る**: [Workers ダッシュボード](https://dash.cloudflare.com/) →
Workers & Pages → academy → Metrics でリクエスト数とエラー（1027/1102）が分かる。
Logs（observability 有効）には各リクエストの記録が7日残る。

**それでも超えるなら**: Workers 有料プラン（$5/月）でリクエスト 1000万/月・
CPU 30秒に上がり、この種の上限は事実上消える。クラス人数を増やす・毎日授業で
使うなら移行が確実（ユーザーのタスクボードに判断待ちで登録済み）。

### 0.9 作りおき（KV）は放っておくと溜まりつづける — 2026-08-26 に 1 GB 直前だった

**いちばん見えにくい上限がここ。** リクエスト数でも CPU でもなく、**KV の保存量 1 GB**。

キャッシュのキーは `incremental-cache/<buildId>/<hash>.cache` で、**buildId は版を
上げるたびに変わる**。OpenNext は期限を付けずに置く（実装に
「TODO: Figure out how to best leverage KV's TTL.」が残っている）ので、
**前の版のぶんは二度と読まれないのに消えない**。

実測（2026-08-26・`wrangler kv key list` と `kv bulk get` で全数を数えた）:

| 見たもの | 実測値 |
| --- | --- |
| KV のキー総数 | **14,334件** |
| buildId の種類 | **222** |
| 1ビルドあたり | 66件 / **5.71 MB** |
| 222ビルドぶんの推定 | **1 GB 前後**（無料枠ちょうど） |
| デプロイ回数 | 1日 13回（直近7日で93回） |
| 増えかた | **1日 76 MB** |

**枠を超えると書き込みが失敗する。** 作りおきが置けなくなると全アクセスが
フルSSRに戻り、Error 1102 が再発する（それを避けるために KV を入れたので本末転倒）。

書き込み**回数**も際どい。デプロイだけで **1日877件**（上限1000件/日の88%）。
授業中の ISR 再生成が10〜20ページで240〜480件上乗せされるので、**授業がある日は
上限を超える**。2026-08-22 に本番デプロイが `code: 10048` で落ちたのはこれ。

**やったこと（2026-08-26）**:

1. **置くときに期限を付けた**（7日）。`src/lib/cache/kv-expiring-cache.ts`。
   見られているページは再生成のたびに期限が延びるので消えない。消えるのは
   「7日だれも見なかったページ」と「前の版の置き土産」だけ。
   日数の根拠（`1日あたりの MB × 日数` を 1 GB の半分に収める）は同ファイル。
2. **溜まった14,334件は置き場ごと入れ替えた**（`academy-next-inc-cache` →
   `-v2`）。消す手段が「1日1000件まで」しかなく全部消すのに14日かかるため。
   中身は作り直せるキャッシュなので空から始めてよい。

**触るときの注意**: `kv-expiring-cache.ts` は**鍵の作り方を OpenNext から借りている**
（`getKVKey`）。ここを自前で組み直すと、書く鍵と読む鍵がずれて**キャッシュが永久に
当たらない**——しかも画面は正しく出るので目では気づけない。`tests/kv_expiring_cache.test.ts`
が見張っている。

**様子を見るには**（読み取りだけ。KV読みの枠を少し使う）:

```bash
npx wrangler kv key list --namespace-id <wrangler.jsonc の id> --remote | python3 -c "import sys,json;print(len(json.load(sys.stdin)),'件')"
```

#### 「デプロイ成功」は「作りおきが入った」ではない — 2026-08-26 に実発生

**この日いちばん危なかった罠。** 書き込み枠（1000件/日）を使い切ると
`populateCache` が落ちるが、**ワークフローは警告を出すだけで成功のまま終わる**:

```
Populating remote KV incremental cache...
Inserting 73 assets to remote KV in chunks of 25
（スタックトレース）
⚠ KVキャッシュの投入に失敗（アップロード自体は完了）。
```

この状態で出した版は **作りおきが1件も無いまま公開される**。全アクセスが
フルSSRになり、授業の人数が来れば Error 1102。しかも枠が戻るまで
（UTC 0時＝日本朝9時）**自分で埋め直すこともできない**。

**2026-08-26 に 機械が 止めるように した。** `npm run cf:staging` は
`Successfully populated cache with N entries`（かつ N > 0）を 確かめて、
出て いなければ **その場で 失敗に する**（`scripts/preview_alias.mjs` の
`cachePopulated`・検査は `tests/preview_alias.test.ts`）。終了コードだけを
信じないのは、0件のまま「成功」で 終わった 実例が あるため。

**本番（`npm run cf:deploy`）も 同じ 見張りで 止まる**（2026-08-26 夜に 追加）。
こちらは `opennextjs-cloudflare deploy` が **中で** 投入するので 戻り値を 掴めない。
そこで デプロイの ステップで 出力を `tee` して `scripts/check_cache_populated.mjs`
に 読ませる（`.github/workflows/deploy.yml`）。**見分ける 規則は STG と 同じ もの**
（`scripts/lib/cache_populated.mjs`）——2か所に 別々の 判定を 置くと、
片方だけ 素通りする。

止めても **本番は 戻らない**（アップロードは もう 済んでいる）。これは
「気づかないまま 授業を 迎える」ことを 防ぐ ための 赤である。赤が 出たら
枠が 戻ってから 出し直す。手で 見たい ときは:

```bash
gh run view <run-id> --log | grep -E "Successfully populated|投入に失敗"
```

`Successfully populated cache with N entries` が出ていれば安全。
`投入に失敗` が出ていたら **その日は本番へ出さない**。本番は前の版のまま
置いておくほうが安全である（前の版の作りおきは生きている）。枠が戻ってから出す。

実際 2026-08-26 は、08:27 の本番デプロイは 73件の投入に成功したが、
09:21 の STG デプロイは枠切れで 0件だった。**この間に本番へ出していたら、
本番が作りおきゼロになっていた。**

### 0.10 なぜ 20人で 入れなく なるのか — 犯人は **冷えた Worker の フルSSR**（2026-08-26 に 特定）

§0.7 で 先読み・画像・ISR を 削っても、20人同時で 入れない 人が 出続けた。
束ねた ものを 読んで、**どこで CPU を 使っているか**が 分かった。

#### 仕組み: Next のサーバは「必要になった時」に 読み込まれる

`.open-next/worker.js` は 2つの 入口を こう 持っている:

| 読み込み | 何 | いつ 払うか |
| --- | --- | --- |
| `import { handler } from "./middleware/handler.mjs"` | 道案内・ミドルウェア・**作りおきの 横取り** | Worker が 立ち上がる とき（1回） |
| `await import("./server-functions/default/handler.mjs")` | **Next のサーバ本体**（React を 描く ところ） | **それが 要る リクエストの 中で** |

つまり:

- **作りおきに 載っている ページ** … 横取り（`enableCacheInterception`）で 返るので
  Next のサーバは **一度も 起きない**。冷えていても 軽い。
- **`dynamic` な ページ** … 作りおきが 無いので、**リクエストのたび** Next の
  サーバ本体を 読み込んで 描く。冷えた Worker では この 読み込みが まるごと
  その リクエストの CPU に のる。

Cloudflare 自身が こう 書いている——「**サーバside描画や 認証を 行う 重い 処理は
たいてい 10〜20ms 使う**」（[Limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)）。
無料枠の 上限は **1リクエスト 10ms**。**構造的に はみ出す**ということである。

#### 実測（本番・2026-08-26）

| 見たもの | 結果 |
| --- | --- |
| `/`（タイトル・当時 dynamic）を 温まった 状態で 6回 | 0.20〜0.35秒 |
| 同じ `/` を 冷えた 状態で | **1.16〜2.09秒** |
| `/` に 20並列（`scripts/loadcheck.mjs`） | p95 **1806ms** |
| 静的アセット（画像）を 3回 | 0.25〜0.51秒（ぶれない） |
| Worker の 立ち上がり そのもの（`wrangler check startup`） | 実質 **50ms 未満**（1秒の枠に 余裕） |

立ち上がりは 軽い。**重いのは 冷えた 1回目の リクエスト**で、そこで Next の
サーバ本体を 読み込んでいる。20人が 一斉に 入ると 拠点は 何本も 新しい Worker を
起こすので、**その 何人かが かならず 1回目を 引く**。「全員 落ちる」ではなく
「**何人か だけ 入れない**」という 見えかたに なるのは これが 理由。

#### やったこと: タイトル画面を 作りおきに 載せた

`/` は **全員が いちばん 最初に 開く 画面**なのに `dynamic` だった
（ヘッダとクッキーを 読んで いたため）。`force-static` に して、
ログインずみかの 判定を **ブラウザ**へ 移した
（`src/app/page.tsx`・`src/components/title-screen.tsx` の `useTitleEntry`）。

- 判定に 使う ものは 前と 同じ（クッキーと、印が 無い ときだけ 1回の DB 照会）。
  変わったのは **見に行くのが Worker から ブラウザに なった**ことだけ。
- ミドルウェアは これまでどおり 手前で 走る。未ログインを `/` へ 返すのも、
  OAuth の `?code=` を 拾うのも 変わらない。
- 引きかえに、開いた 直後の ひと呼吸だけ 場所取り（「よみこんで います…」）が 出る。

#### これから 守る 決まり

> **学習者が 通る 画面を `dynamic` に しない。**

`next build` の 表で `ƒ`（Dynamic）が 付いた ものは、**リクエストのたび Next の
サーバ本体を 起こす**。学習者の 道に それが あると、授業の 人数で 必ず 詰まる。
`○`（Static）か `●`（SSG／ISR）に 寄せる。人ごとに 変わる ところは
**ブラウザで 決める**（サーバに 決めさせない）。

いま 残っている `ƒ` と、その 扱い:

| ルート | 誰が 通るか | どうするか |
| --- | --- | --- |
| ~~`/welcome`~~ | — | **2026-08-26 に 静的化ずみ**（`src/components/welcome-entry.tsx`） |
| `/map/settings` | ときどき | 急がない |
| `/admin/*` | 先生だけ（数人） | そのままでよい |
| `/auth/callback` | ログインの 戻り（1人1回） | 仕組み上 必要 |

**学習者の 道からは `ƒ` が 無くなった。** タイトル画面（`/`）・はじめの案内
（`/welcome`）・マップ・教材の どれも、Next の サーバを 起こさずに 返る。
残る `ƒ` は 先生の 画面と ログインの 戻り道 だけである。

#### あわせて 減らした もの: ブラウザからの 認証の 往復

`auth.getUser()` は **呼ぶたびに Supabase の 認証サーバへ 1往復する**。
マップを 開くだけで 2回 飛んで いた（`map-shell` 自身と、その 中の
`fetchOwnProfile`）。20人なら 40往復が 教室の **1つの IP** から 出る。

学習者の 道の `getUser()` を すべて `getClaims()`（その場の 署名検証・往復ゼロ）
に 替えた（`src/lib/supabase/claims.ts`）。`tests/own_claims.test.ts` が
**`getUser()` に 戻したら 赤く なる**ように 見張って いる。

#### 実地で 分かった こと: **デプロイ回数も 原因だった**（2026-08-26 夜）

この 直しを STG へ 出した とき、足したばかりの 見張りが **1回目で 捕まえた**:

```
Inserting 75 assets to remote KV in chunks of 25
 33%|███████ 1/3
Error: Wrangler kv bulk put command failed:
  your account has reached the free usage limit for this operation for today [code: 10048]
✗ 作りおき（KVキャッシュ）が入りませんでした。**この版を使ってはいけません。**
```

**KV の 書き込み枠（1000件/日）が すでに 尽きて いた。** 75件の うち
25件しか 入らず、残り 50ページは 作りおきの 無いまま 公開された。

ここが 大事な ところ:

> **1回の デプロイが KV へ 約75件 書く。枠は 1000件/日。つまり 1日13回で 尽きる。**
> 尽きた あとの デプロイは **作りおきゼロの 版を 公開する**。その版は 全アクセスが
> フルSSR に なり、授業の 人数で かならず Error 1102 に なる。

つまり **デプロイ回数は 同時アクセス障害の 原因の ひとつ**である
（リクエスト数の 上限では なく、**作りおきを 支える 書き込み枠**を 通して）。
「デプロイは ただ」だと 思って 1日に 何度も 出すと、その日の 夕方には
**出せば 出すほど 壊れる**状態に なる。

**授業の ある日の 決まり**（2026-08-27 に 大半が 自動化された）:

1. ~~朝いちばんに 1回だけ 出す~~ → ~~授業の 前（火・水・金 17:05 ICT）に 自動で 1回 出る~~
   → **授業の 前に 5回 起きて、必要な ときだけ 1回 出る**（16:12 / 16:26 / 16:38 /
   16:51 / 17:12 ICT。2026-08-29 から。§0.11）。**空振りの ランは KV を 1件も 使わない**
   ので、起こす 回数を 増やしても 枠は 減らない。
   人が 時刻を 気に する 必要は もう ない。枠が 戻るのは UTC 0時 ＝ カンボジア 朝7時。
2. **STG の デプロイは KV を 1件も 使わない**（§0.6 末尾）。何回 出しても 枠は 減らない。
   ——これが 「1日13回で 使い切る」問題の 本体だった。
3. 出したら **ログの `Successfully populated cache with N entries` を 見る**（§0.9）。
   本番は `scripts/check_cache_populated.mjs` が deploy.yml の 中で 自動で 見る
   （schedule で 出す ときも 同じ）。
4. 出せなかった 日は **前の版の まま 置いておく**。前の版の 作りおきは 生きている。
   自動デプロイが 黙って 落ちても、本番は 前の版の まま（安全側）。
5. 作業中の 確認は `npm run cf:branch`（静的アセットに 写すので **KV 書き込み 0件**）。

#### 罠: **ワークフローを 直した 直後の デプロイは「承認待ち」で 止まる**（2026-08-26）

`.github/workflows/` を **AI（GitHub App の 資格）が 触った コミット**が main に
入ると、その あとの デプロイは ジョブが **1つも 動かないまま** 終わる:

```
conclusion: action_required   （jobs: 0件）
```

これは 失敗では なく **承認待ち**である。GitHub の 画面（Actions → その ラン）で
**「Approve and run」を 押すまで 動かない**。`workflow_dispatch` で 出し直しても
同じ（ラン は main の HEAD ＝ その コミットの ワークフローを 使う ため）。

**気づきにくい。** 赤い ✗ では なく 灰色で 終わるので、ログを 見ないと
「出したつもりで 出て いない」に なる。2026-08-26 17:01 の push ラン
（32991749710）と 17:12 の dispatch（32992747089）が 実際に これだった。

**抜けかたは 1つだけ——画面で 1回 Approve and run を 押す。**

> **試して 分かった こと（同日 追記）**: 「`.github/` を 触らない コミットを
> もう 1つ 入れれば 抜けられる」と 一度 書いたが、**それでは 抜けられない**。
> ワークフローを 触って いない `f8361659` の push も、同じく
> `action_required` / ジョブ0件で 止まった。**いちど 掛かると 居座る。**
> AI の 資格では 承認できない（承認の API が 手元の 道具に 無い）ので、
> **人が 画面で 押すしか ない**。

観測の 並び（2026-08-26）:

| 時刻 | コミット | `.github/` を 触ったか | 結果 |
| --- | --- | --- | --- |
| 16:18 | `fb79141` | 触って いない | ジョブは 動いた（作りおきで 失敗） |
| 16:27 | `b5c11ad` | 触って いない | ジョブは 動いた（作りおきで 失敗） |
| 17:01 | `626847c` | **触った** | **承認待ち・ジョブ0件** |
| 17:12 | `626847c`（dispatch） | — | **承認待ち・ジョブ0件** |
| 17:16 | `f8361659` | 触って いない | **承認待ち・ジョブ0件** |

**授業の 前に ワークフローを 直さない。** どうしても 直すなら、そのあと
**必ず デプロイを 1回 通して**（人が 承認を 済ませて）から 終わること。
承認を 残したまま 帰ると、翌朝 誰も 本番を 出せない。

> **2026-08-27 の 統合ブランチ切替も これに 掛かる。** `.github/workflows/` を 3本
> （deploy.yml・migrate.yml・ci.yml）触ったので、切替の あと **人が 画面で 1回
> Approve and run を 押すまで、STG も 本番も 出ない**。押されるまで 本番は
> 前の版の まま（作りおきも 生きている）なので、授業は それで 動く。
> **押されて いない ことを 最優先で 報告する**のが 切替した セッションの 責任である。

#### もう ひとつの 天井: Supabase の **IP ごと**の 上限

教室は ふつう **1本の 回線（1つの IP）**から 出る。Supabase の 認証は
**IP ごと**に 数えるので、人数が 増えると ここが 先に 詰まる:

| 相手 | 上限（既定・変えられない） |
| --- | --- |
| `/auth/v1/token`（ログインの 引きかえ・更新） | 1時間 1800回、ただし **一度に 30回まで** |
| `/auth/v1/verify` | 1時間 360回、一度に 30回まで |

**「一度に 30回まで」が 効く。** 授業の 始まりに 全員が 一斉に ログインすると、
1人1回の 引きかえで 人数ぶんの `/auth/v1/token` が **同じ IP から** 飛ぶ。
20人なら まだ 余裕が あるが、**30人を 超える クラスでは ここで 弾かれる**——
Cloudflare を いくら 直しても 効かない、別の 天井である。

だから **認証の 往復は ブラウザからも 減らす**のが 正しい
（`getClaims()` が その場で 署名を 確かめるのは、この 天井にも 効く）。
一方で `/rest/v1/*`（データの 読み書き）には この 上限が 無いので、
そちらは ブラウザから 直に 叩いてよい。

出典: [Supabase — Rate limits](https://supabase.com/docs/guides/auth/rate-limits)

#### それでも 残る 壁

上の 通り、**無料枠の 10ms は「SSR を するな」と 言っているのと 同じ**である。
作りおきで 逃げられる ぶんは 逃がしたが、逃がせない ところ（ログインの 戻り・
新しい 学習者の `/welcome`・先生の 画面）は 残る。

**Workers 有料（$5/月）に すると CPU は 10ms → 30秒**（最大5分まで 上げられる）に なり、
リクエスト数の 1日上限も 無くなる。この 種の 事故は 事実上 消える。
無料枠で 続けるなら「学習者の 道に `dynamic` を 置かない」を **規律として 守り続ける**
必要が ある——ページを 1枚 足すたびに 気を つける、という 意味である。

### 0.8 DBの移行SQL — `integration` へ入れば自動で流れる（2026-08-26 に自動化・2026-08-27 に配信元を移動）

**移行SQLをダッシュボードに貼らない。** `supabase/migrations/*.sql` を
**`integration`** へ入れれば「デプロイ（DB）」ワークフロー（`.github/workflows/migrate.yml`）が
自動で流す。手で流し直したいときは Actions → デプロイ（DB） → Run workflow。

> **なぜ main ではなく `integration` か**（2026-08-27）。DB は ローカル・STG・本番で
> **1つを共有する**（§4）。トリガーが main のままだと、STG には新しいコードが載っているのに
> DB が古い、という時間が生まれる——**2026-08-26 の事故と同じ型**（テストも CI も緑のまま
> DB だけが遅れ、先生の名簿から7人が消えた）。`integration` で流せば
> **DB が常にコードより先**になる。移行SQLは「いま動いているコードを壊さない変更だけ」なので、
> 先に流れて困るものが無い。

必要な Secret は1つだけ。**Environment「Preview」**（デプロイと同じ場所）に置く:

| 名前 | 取りかた |
| --- | --- |
| `SUPABASE_DB_URL` | ダッシュボード上部 **Connect** → Connection string → **URI**（パスワード入り） |

`NEXT_PUBLIC_SUPABASE_URL` **では代用できない**。あれはブラウザに埋め込む公開の
API窓口で、SQL は流せない（2026-08-26 に実際に取りちがえかけた）。
**この鍵はビルドのステップに渡さない**（罠1と同じ理由。migrate.yml はビルドをしない）。

#### なぜ自動化したか — コードだけ先に載って、2日間 誰も気づかなかった

`20260824090000_register_profile_on_login.sql` が流されないまま、それに依存する直しを
2本（#187・#204）本番へ出した。**単体テストも e2e も CI も全部 緑**で、画面にも
何の印も出なかった。DB 側だけが `gender not null` のままで、「ログインした人を登録する」が
黙って弾かれ続けていた。気づいたのは、たまたま DB を覗いたときである
——**30人がログインしていたのに、先生の名簿には23人しか出ていなかった**（7人が消えていた）。

DBを見る道（Supabase コネクタ）は**前から繋がっていた**。足りなかったのは権限ではなく
**確かめる仕組み**だった。だから見張りを3か所に置いた:

| どこ | いつ | 何をする |
| --- | --- | --- |
| `npm run handoff` | 作業を始めるたび | 流し忘れを出す。鍵が無い環境では**「確かめていない」と正直に言う**（黙って「問題なし」と言わない） |
| デプロイ（DB） | **`integration`** に移行SQLが入ったとき | 自動で流し、流れたことをDBに聞いて確かめる |
| デプロイ | **本番へ出す直前**（授業前の自動デプロイでも同じ） | DBが遅れていたら本番を**止める**（STG では止めない。同じ push で走る DB 側とどちらが先に終わるか決まらないため） |

判定は `scripts/check_migrations.mjs`（`npm run check:migrations`）。
リポジトリのファイル名の版と、DBの `supabase_migrations.schema_migrations` を突き合わせる。

#### 移行SQLの書きかた — 前のコードを壊さない変更だけ

コードとDBのどちらが先に載るかは、その日の詰まり具合で変わる。だから
**いま本番で動いているコードを壊さない変更だけ**を書く（列を足す・not null を外す・
制約をゆるめる）。列を消す・型を変えるといった後戻りできない変更は、
コードから使われなくなったことを確かめた**次の回に分けて**出す。

#### 台帳の突き合わせ（2026-08-26 に一度だけやった）

それまで DB の移行記録はリポジトリのファイル名と**別系統**だった（DB 側は
`20260727013141 academy_core_schema` のように、手で流したときの時刻で記録されていた）。
名前は似ているのに版が違うので、機械が突き合わせられなかった。
リポジトリの11本すべてが実際にDBへ入っていることを実物で確認したうえで、
同じ版を `schema_migrations` に記録した（`created_by = baseline_2026-08-26`）。
**以後はファイル名の版とDBの版が1対1**なので、差分がそのまま流し忘れである。

### 0.11 cron 1本は 起動役として 信用できない — 2026-08-28 に 11時間 遅れた

**症状**: 金曜 17:05 ICT の 自動デプロイが 動かず、手で 出したが 授業（17:30）に
間に合わなかった。

**調べた こと**（`gh api repos/tomy1031/nexmax-academy/actions/runs?event=schedule`）:

| 見たもの | 実測 |
| --- | --- |
| cron の 書きかた | `5 10 * * 2,3,5` ＝ 10:05 UTC ＝ **17:05 ICT**。main にも 正しく 入っていた |
| 10:05 UTC の ラン | **1本も 作られていない**（リポジトリ全体で 10:08 の 次は 10:33 まで 空白） |
| schedule が 届いた 時刻 | **21:10:05 UTC**（＝土 04:10 ICT）。**11時間5分 遅れ** |
| そのランの 結果 | ラン `33211372267` は **成功**。中身も 正しく 出た |
| 手で 出した 時刻 | 10:34:41 と 10:40:49 UTC ＝ **17:34 / 17:40 ICT**（授業開始後） |

**つまり 設定ミスでも 失敗でも ない。GitHub が 時刻に 配らなかった。**
GitHub 自身が こう 書いている（[Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)）:

> The schedule event can be delayed during periods of high loads of GitHub Actions
> workflow runs. ... If the load is sufficiently high enough, some queued jobs may be
> dropped. High load times include the start of every hour.

しかも cron を main に 入れたのは 2026-08-27。**8/28 が 史上初の 発火予定日**で、
1回目から 外している。

**遅れが「間に合わない」に なった 理由は 3つ**（cron の 時刻の 問題では ない）:

1. 起動役が **cron 1本だけ**。それが 黙ると 誰も 出さない。
2. 授業の **25分前**に 出す 設計。遅れを 吸収する 余地が ゼロ。
3. 落ちても **鳴る ものが ない**。人が 気づいて 手で 叩くまで 誰も 知らない。

**直した かた（2026-08-29）**: cron を **5本**に 増やし、出すのは **必要な ときだけ 1回**に した。

- 16:12 / 16:26 / 16:38 / 16:51 / 17:12 ICT（＝`12 9` / `26 9` / `38 9` / `51 9` / `12 10` UTC）。
  **どの 分も :12 以降**——GitHub が「混むのは 毎時の 頭」と 言っている 帯を 避ける。
- 起きた ランは まず **本番の `/api/version` に 聞く**（ビルド時の SHA と 時刻を 返す。
  next.config.ts）。状態を どこにも 保存せずに 判断できる。
  - 中身が 同じ → **出さない**
  - 前の ビルドから **30分 未満** → **出さない**（次の cron が 拾う）
  - それ以外 → 出す
- **空振りの ランは KV を 1件も 使わない**（`npm ci` も テストも とばす。1分ほどで 終わる）。
  1回の 本番デプロイは KV へ 約75件 書き、枠は 1000件/日（§0.6・§0.9）ので、
  **「5本 起こす」と「1日 何回 出すか」を 切り離す**のが この 設計の 要。
  30分の 間隔が あるので、授業前の 60分間に 出るのは **最大 2回**（約150件）。
- 読めない ときは **出す 側に 倒す**（fail-open）。本番が 落ちて いるのに
  黙って 出さなく なる ほうが 害が 大きい。
- **手動の dispatch には この 判定を かけない**。緊急の 道で
  「30分 たって いないので 出しません」と 言われては 困る。

**5本 ぜんぶが 落ちない かぎり 授業には 間に合う。** それでも 落ちる 日が 来たら、
次の 手は **GitHub の cron を 経路から 外す**こと——本番 Worker の Cron Trigger から
`workflow_dispatch` を 叩く（GitHub の アクセストークンを Worker の secret に 1つ 置く）。
リポジトリは public なので、**読むほう**（integration の SHA を 見て ずれを 鳴らす）は
鍵なしで できる。

## 1. 環境の位置づけ

現行（Cloudflare 移行後）:

| 環境 | ホスト | 載るもの | 目的 | Supabase |
|---|---|---|---|---|
| ローカル | `npm run dev` | 手もと | 開発 | 同一プロジェクト |
| STG | `staging-academy.nexmax.workers.dev` | `integration` | 本番前の確認（マージのたび自動） | 同一プロジェクト |
| 本番 | `academy.nexmax.workers.dev` | `main` | エンドユーザー提供（授業前に自動） | 同一プロジェクト |

DB・認証は3環境とも**同じ Supabase プロジェクト**を使う（ユーザー方針）。データと認証ユーザーが環境をまたいで共有される点に注意（§4）。
**保存を伴う実機検証は検証専用アカウントで**行うこと（`docs/skills/browser_e2e_verification.md`）。

以下は旧構成の記録。

| 環境 | ホスト | 目的 | Supabase |
|---|---|---|---|
| 旧・検証 | Vercel Hobby（無料） | 常時の動作確認・PRごとのプレビュー | 本番と同一プロジェクト |

## 2. なぜ Vercel Hobby だったか（旧）

- Next.js 16 の App Router・ミドルウェア・Server Actions・画像最適化を**アダプタ無しでそのまま**動かせる（Next.js 純正ホスト）
- 無料の Hobby プラン（クレジットカード不要）
- **push / PR ごとに自動でプレビューURLが発行される** → 「いつでも動作確認できる」を満たす中心機能
- 環境変数はダッシュボードで管理（秘密鍵をリポジトリに置かない方針と両立）

> 本番を Vercel にするか他ホストにするかは 03 の正式運用の判断に従う。検証環境の選定が本番を縛るものではない。

## 3. セットアップ手順（旧・Vercel。もう使わない）

1. [vercel.com](https://vercel.com) に GitHub アカウントでログイン
2. **Add New → Project** → `tomy1031/nexmax-academy` を Import
3. Framework は Next.js が自動検出される（Build/Output はデフォルトのまま）
4. **Environment Variables** に以下を登録（Production / Preview 両方に付与）:

   | 変数 | 値 | 公開範囲 |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL | 公開（クライアントに出る） |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の anon key | 公開（RLSで保護） |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase の service_role key | **秘密**（サーバのみ） |

   > `GEMINI_API_KEY` はここには登録しない。Geminiは単一の共有サーバーキーを持たず、生徒・教師が各自で発行した自分のAPIキーを設定画面から登録するBYOK方式（`docs/design/03_リニューアル設計方針.md` §2）。登録キーはDBに保存し、サーバプロキシが本人のキーとしてのみ使用する。

5. Deploy。以後は `git push` で本番URL、PR作成でプレビューURLが自動生成される

環境変数が未設定でもビルドは通り、画面は「たいけんモード」で閲覧できる（ログインだけ無効）。

## 4. 同一 Supabase を共有する上での運用注意

DBを本番と共有するため、検証操作が本番データ・本番ユーザーに影響する。以下を守る。

1. **Google OAuth のリダイレクトURL登録**（Supabase → Authentication → URL Configuration）
   - **現行の登録内容は §0.3 が正**（Site URL は本番 `https://academy.nexmax.workers.dev`、
     Additional Redirect URLs は `https://*-academy.nexmax.workers.dev/**` がブランチ確認URLを一括許可）。

   > **末尾は `/**` にすること。** 以前ここには `/auth/callback` 完全一致で書いてあったが、
   > **それでは動かない**。戻り先は `?code=...` が付いた状態で照合されるため一致しない。
   > 実測で localhost もブランチプレビューも拒否されることを確認済み（§0.3）。
   > `https://nexmax-academy.vercel.app` だけが動いていたのは Site URL の暗黙許可のため。
   - **未登録のURLに戻そうとすると、Supabase は拒否ではなく Site URL（＝本番）へ
     `?code=` 付きでフォールバックする**。「検証環境でログインしたのに本番に飛ぶ」は
     この症状。ドメインをまたぐためアプリ側では救えず、登録するしかない。
   - アプリが渡す `redirectTo` は**クエリなしの `<origin>/auth/callback`** に固定している
     （クエリ付きだと許可リストのパターンに一致しないことがあるため）。遷移先は
     コールバック側の既定値 `/welcome` で決める。
   - 保険として、`?code=` がどのページに落ちても `src/middleware.ts` が
     `/auth/callback` へ回送する（同一オリジン内のみ有効）。
2. **破壊的な検証は本番データに直撃する**。テーブル追加・RLS変更・大量データ投入は、まず Supabase の別プロジェクト（無料でもう1つ作れる）か、本番に影響しない専用テーブル/スキーマで行うことを推奨。「同一で大丈夫」の範囲は日常の閲覧・ログイン確認・少量の学習データまで、と運用で線引きする
3. **service_role key はどの環境にも置かない**（現在コードから参照されていない）。
   `.env*` に置くと OpenNext がバンドルへ焼き込む（§0.1 罠①・`check_build_env.mjs` が止める）。
   実行時に必要になったら `wrangler secret put` を使い、露出したら Supabase ダッシュボードで即ローテーション
4. RLS を有効化し、学生ロールは自分の行のみ・教師は自クラスのみ（03 §3.3）。検証と本番でユーザーが混ざっても、権限は RLS が守る
5. **DBマイグレーション**: `supabase/migrations/*.sql` を Supabase SQL Editor で実行する

## 5. デプロイ前チェック（CIと同じ）

```bash
npm run format:check && npm run lint && npm run typecheck \
  && npm run lint:secrets && npm run lint:content && npm test && npm run build
```

GitHub Actions（`.github/workflows/ci.yml`）が push/PR で同じ検査を実行する。デプロイ（`cf:*`）前に CI で落とす二重化。
