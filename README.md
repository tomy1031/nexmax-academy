# NexmaxAcademy — Japanese IT Pathway 新アプリ

カンボジアのIT専攻学生（日本語学習歴1年・N5〜N3挑戦）が、日本のIT企業で働くための知識と日本語を、リアルな現場の追体験で学ぶeラーニングアプリ。

旧アプリ [tomy1031/nextmake_onbording](https://github.com/tomy1031/nextmake_onbording) のリニューアル版。設計思想・カリキュラム・移行計画は `docs/design/` を参照。

## 技術スタック

- Next.js (App Router) + TypeScript + Tailwind CSS
- デプロイ先は **Cloudflare Workers**（OpenNext 経由。2026-08-03 に Vercel から移行）
- DB・認証は Supabase（Google ログイン）。Gemini 呼び出しはサーバプロキシ経由
- コンテンツは zod スキーマ準拠の JSON（`content/`）。学習エンジンとコンテンツを分離する（`docs/design/03` §1）

## 開発

Node は `.nvmrc` に合わせる（Node 22）。

```bash
npm install
cp .env.example .env.local   # 環境変数を用意（実値は各自）
npm run dev                  # 開発サーバ http://localhost:3000
npm run lint                 # ESLint（品質）
npm run format               # Prettier で整形
npm run typecheck            # tsc --noEmit
npm run lint:content         # コンテンツ検収（スキーマ＋禁止語＋ふりがな覆い 他）
npm run lint:secrets         # 秘密情報混入検査（secretlint）
npm test                     # 単体テスト（Vitest）
npm run measure:readability  # 文長・漢字密度レポート
```

コミット時に pre-commit フック（husky + lint-staged）が整形と検収を自動実行します。

## Google ログインの設定（Supabase）

1. Supabase プロジェクトを作成し、`.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定
2. Google Cloud Console で OAuth クライアントを作成し、リダイレクトURIに
   `https://<プロジェクトID>.supabase.co/auth/v1/callback` を登録
3. Supabase ダッシュボード → Authentication → Providers → Google を有効化し、クライアントID/シークレットを入力
4. アプリ側のコールバックは `/auth/callback`（実装済み）。Redirect URLs は `https://<host>/**` 形式で登録する（`docs/deploy.md` §0.3）

ログインが最初の画面です（ログインするまで学習画面は開けません）。

## デプロイ（Cloudflare Workers）

| 環境       | URL                                               | 載るもの      | いつ更新されるか                                            |
| ---------- | ------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| 本番       | `https://academy.nexmax.workers.dev`              | `main`        | **火・水・金 17:05 ICT に自動**（授業は 17:30）。緊急は手動 |
| STG        | `https://staging-academy.nexmax.workers.dev`      | `integration` | `integration` へマージするたび**自動**                      |
| ブランチ用 | `https://<ブランチ名>-academy.nexmax.workers.dev` | 作業ブランチ  | `npm run cf:branch`                                         |

作業ブランチは `integration` へ PR する。STG で確かめたものが、授業の前に本番へ昇格する。
手順・環境変数・踏みやすい罠は `docs/deploy.md` §0 を参照。

## キャラクター画像（ネクマックス）

ナビゲーターのネクマックスは Codex の image-gen-2 で生成します（手描きSVG禁止）。
正典 `public/img/characters/nexmax/reference.png` を参照入力にして、
`docs/skills/codex_image_generation.md` の手順でバリアントを生成してください。

## ドキュメント

| ファイル                                   | 内容                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `AGENTS.md`                                | AIエージェント向けの規律（CLAUDE.md / .gemini からも参照される単一ソース） |
| `docs/design/01_理解設計ガイド.md`         | 教材設計の13原則・アンチパターン・制作レシピ（教材を書く前に必読）         |
| `docs/design/02_拡張カリキュラム設計書.md` | 「ネクストメイク1年目」12モジュールのカリキュラム計画                      |
| `docs/design/03_リニューアル設計方針.md`   | アーキテクチャ・DB要件・検収パイプライン・移行手順                         |
| `docs/design/04_ビジュアルテーマ.md`       | ビジュアル・文言トーン・ネクマックスの規律（UIに触る前に必読）             |
| `docs/design/09_Cloudflare移行実行計画.md` | Vercel → Cloudflare Workers 移行の計画と制約                               |
| `docs/design/review_rubric.md`             | 検収ルーブリック（証拠必須）                                               |
| `docs/deploy.md`                           | デプロイ／環境構成（Cloudflare Workers・Supabase 共有の運用）              |
| `docs/システム構成とレート制限.html`       | 天井マップ（構成図と、無料枠がどの作業にどう効くか。ブラウザで開く）      |
| `docs/constraints.md`                      | ユーザーが伝えた制約・好みの永続台帳（作業前に必読）                       |
| `docs/codex-backend.md`                    | 生成バックエンド（Codex／Gemini）の構成                                    |
