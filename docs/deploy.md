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
npm run cf:staging   # staging を更新。**main でのみ実行できる**
npm run cf:upload    # バージョンだけ上げる（エイリアスは付けない）
```

| | URL | 更新コマンド |
|---|---|---|
| 本番 | `https://academy.nexmax.workers.dev` | `npm run cf:deploy` |
| staging（統合版） | `https://staging-academy.nexmax.workers.dev` | `npm run cf:staging`（main のみ） |
| ブランチ確認用 | `https://<ブランチ名>-academy.nexmax.workers.dev` | `npm run cf:branch` |

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

- `staging` は main からしか上げられない（作業ブランチからは exit 1 で止まる）
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
- `incrementalCache` は **KV**（2026-08-13 導入）。学習者ページ14ルートが
  `revalidate = 60` の ISR なのにキャッシュが無く、全アクセス＋全プリフェッチが
  フルSSRになって CPU 上限超過（Error 1102）が多発したため。KV は無料枠内
  （読み 10万/日・書き 1000/日。書きは60秒経過後の再生成時のみ）。R2 は
  アカウント未有効（有効化に課金設定が必要）なので使わない。
  ネームスペース: `academy-next-inc-cache`（wrangler.jsonc に ID 直書き）。
  裏側の再生成は `WORKER_SELF_REFERENCE`（自分自身へのサービスバインディング）
  経由。**ブランチ確認URLでは再生成が本番 Worker に飛ぶため、ブランチURLの
  ISR ページは古いままになることがある**（本番・STG は正常）。設定本体は
  `open-next.config.ts`

## 1. 環境の位置づけ

現行（Cloudflare 移行後）:

| 環境 | ホスト | 目的 | Supabase |
|---|---|---|---|
| ローカル | `npm run dev` | 開発 | 同一プロジェクト |
| staging | `staging-academy.nexmax.workers.dev` | 本番前の確認（`npm run cf:staging`） | 同一プロジェクト |
| 本番 | `academy.nexmax.workers.dev` | エンドユーザー提供 | 同一プロジェクト |

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
