# デプロイ / 環境構成

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
   - Site URL: 本番URL
   - Additional Redirect URLs に検証・プレビューを追加:
     - `https://<vercel-project>.vercel.app/auth/callback`
     - `https://*.vercel.app/auth/callback`（プレビューは毎回サブドメインが変わるため）
     - `http://localhost:3000/auth/callback`（ローカル）
   - 未登録のURLからのログインは Supabase が拒否する
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
