# デプロイ / 環境構成

> **移行中（2026-07-30）**: ホスティングを Vercel から **Cloudflare Workers** へ移している。
> 手順は §0 を見る。§1〜§4 の Vercel 前提の記述は**移行完了までの併存**であり、
> 完了時に「旧」として畳む（計画: `docs/design/09_Cloudflare移行実行計画.md` §3 Phase C-11）。
> Supabase（DB・認証）は移さない。移すのはホスティングだけ。

## 0. Cloudflare Workers（新・移行先）

OpenNext（`@opennextjs/cloudflare`）で Workers 上に載せる。旧 `@cloudflare/next-on-pages` は使わない。

### 0.1 コマンド

```bash
npm run cf:preview   # ローカルの workerd で確認（ビルド＋プレビュー）
npm run cf:deploy    # 本番へデプロイ（秘密ガード＋ビルド＋deploy）
npm run cf:upload    # バージョンだけ上げる（本番トラフィックは切り替えない）
```

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

workers.dev のホストは `nexmax-academy.nextmake.workers.dev` のように
**ラベルが2つ**入る。Supabase の `*` は1ラベルしか食わないため
`https://*.workers.dev/auth/callback` では一致しない。逐語で登録する。

```
https://nexmax-academy.nextmake.workers.dev/**
https://staging-nexmax-academy.nextmake.workers.dev/**
```

2行目は `wrangler versions upload --preview-alias staging` で作る固定エイリアス。
プレビューURLは既定では `<version>-<worker>.<subdomain>.workers.dev` とバージョンごとに
変わるので、**エイリアスを固定してから登録する**。

#### 末尾の `/**` が必須。`/auth/callback` の完全一致では動かない（実測）

**戻り先は `?code=...` が付いた状態で照合される。** そのため
`https://nexmax-academy.nextmake.workers.dev/auth/callback` を完全一致で登録しても、
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
R="https://nexmax-academy.nextmake.workers.dev/auth/callback?code=testvalue"
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

#### Redirect URLs の全量（2026-08-03 時点）

```
https://nexmax-academy.nextmake.workers.dev/**
https://staging-nexmax-academy.nextmake.workers.dev/**
http://localhost:3000/**
https://nexmax-academy.vercel.app/**
https://*.vercel.app/**
```

下2本は移行完了まで残す。完了時に削除する。

**旧リスト（`/auth/callback` 完全一致）は5本とも機能していなかった。** 実測で
`http://localhost:3000/auth/callback?code=...` も
`https://some-branch.vercel.app/auth/callback?code=...` も拒否されることを確認した。
つまり**ローカル開発のログインもブランチプレビューのログインも、元から
本番へ飛ばされていた**（§4-1 が「症状」として書いていた現象そのもの）。
`https://nexmax-academy.vercel.app` だけが動いていたのは Site URL の暗黙許可のため。

### 0.4 恒久の制約

- **`src/middleware.ts` を `proxy.ts` に改名しない。** `next build` の
  "middleware is deprecated" 警告は意図して無視する。Next.js 16 の proxy は
  Node ランタイム固定で、OpenNext は Node middleware を検出してビルドを止める
  （AGENTS.md 絶対規律 8・計画書 §2.3）
- `compatibility_date` は `2025-05-05` 以降が必須（`FinalizationRegistry` 対策）
- `incrementalCache`（R2）は入れていない。ISR / on-demand revalidate を使っておらず、
  SSR は設定なしで動くため。**R2 を足さない = 無料枠に収まる**。ISR を使い始めたら
  ここを見直す

## 1. 環境の位置づけ

| 環境 | ホスト | 目的 | Supabase |
|---|---|---|---|
| ローカル | `npm run dev` | 開発 | 同一プロジェクト |
| **検証（本書の主対象）** | **Vercel Hobby（無料）** | 常時の動作確認・PRごとのプレビュー | **本番と同一プロジェクト** |
| 本番 | 設計方針03のとおり（正式運用先） | エンドユーザー提供 | 同一プロジェクト |

DB・認証は3環境とも**同じ Supabase プロジェクト**を使う（ユーザー方針）。データと認証ユーザーが環境をまたいで共有される点に注意（§4）。

## 2. なぜ Vercel Hobby（検証環境）か

- Next.js 16 の App Router・ミドルウェア・Server Actions・画像最適化を**アダプタ無しでそのまま**動かせる（Next.js 純正ホスト）
- 無料の Hobby プラン（クレジットカード不要）
- **push / PR ごとに自動でプレビューURLが発行される** → 「いつでも動作確認できる」を満たす中心機能
- 環境変数はダッシュボードで管理（秘密鍵をリポジトリに置かない方針と両立）

> 本番を Vercel にするか他ホストにするかは 03 の正式運用の判断に従う。検証環境の選定が本番を縛るものではない。

## 3. セットアップ手順（検証環境・一度きり）

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
   - Site URL: 本番URL（`https://nexmax-academy.vercel.app`）
   - Additional Redirect URLs に検証・プレビューを追加:
     - `https://nexmax-academy.vercel.app/**`（本番・明示）
     - `https://*.vercel.app/**`（ブランチプレビュー。サブドメインが毎回変わるため）
     - `http://localhost:3000/**`（ローカル）

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
3. **service_role key は検証環境にも置く**が、クライアントには決して出さない（`getServerEnv()` 経由・サーバ専用）。露出したら Supabase ダッシュボードで即ローテーション
4. RLS を有効化し、学生ロールは自分の行のみ・教師は自クラスのみ（03 §3.3）。検証と本番でユーザーが混ざっても、権限は RLS が守る
5. **DBマイグレーション**: `supabase/migrations/*.sql` を Supabase SQL Editor で実行する

## 5. デプロイ前チェック（CIと同じ）

```bash
npm run format:check && npm run lint && npm run typecheck \
  && npm run lint:secrets && npm run lint:content && npm test && npm run build
```

GitHub Actions（`.github/workflows/ci.yml`）が push/PR で同じ検査を実行する。Vercel のビルドが通る前に CI で落とす二重化。
