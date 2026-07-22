# nextmake_kenshu — Japanese IT Pathway 新アプリ

カンボジアのIT専攻学生（日本語学習歴1年・N5〜N3挑戦）が、日本のIT企業で働くための知識と日本語を、リアルな現場の追体験で学ぶeラーニングアプリ。

旧アプリ [tomy1031/nextmake_onbording](https://github.com/tomy1031/nextmake_onbording) のリニューアル版。設計思想・カリキュラム・移行計画は `docs/design/` を参照。

## 技術スタック

- Next.js (App Router) + TypeScript + Tailwind CSS
- コンテンツは zod スキーマ準拠の JSON（`content/`）。学習エンジンとコンテンツを分離する（`docs/design/03` §1）
- DB/認証・Gemini プロキシはフェーズ1で導入予定

## 開発

Node は `.nvmrc` に合わせる（Node 22）。

```bash
npm install
cp .env.example .env.local   # 環境変数を用意（実値は各自）
npm run dev                  # 開発サーバ http://localhost:3000
npm run lint                 # ESLint（品質）
npm run format               # Prettier で整形
npm run typecheck            # tsc --noEmit
npm run lint:content         # コンテンツ検収（スキーマ＋禁止語＋秘匿漏れ＋ID重複）
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
4. アプリ側のコールバックは `/auth/callback`（実装済み）

環境変数が未設定の間は「たいけんモード」で全ページを閲覧できます。

## デプロイ（検証環境）

常時の動作確認用に **Vercel Hobby（無料）** を検証環境として使う。`git push` で本番URL、PRごとにプレビューURLが自動発行される。DB・認証は本番と同じ Supabase を共有する。

セットアップと運用注意（OAuthリダイレクトURL登録・同一DB共有の線引き）は `docs/deploy.md` を参照。本番環境は `docs/design/03` の正式運用に従う。

## キャラクター画像（ネクマックス）

ナビゲーターのネクマックスは Codex の image-gen-2 で生成します（手描きSVG禁止）。
正典 `public/img/characters/nekumax/reference.png` を置いたうえで、
`docs/skills/codex_image_generation.md` の手順でバリアントを生成してください。

## ドキュメント

| ファイル                                   | 内容                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `docs/design/01_理解設計ガイド.md`         | 教材設計の13原則・アンチパターン・制作レシピ（教材を書く前に必読）         |
| `docs/design/02_拡張カリキュラム設計書.md` | 「ネクストメイク1年目」12モジュールのカリキュラム計画                      |
| `docs/design/03_リニューアル設計方針.md`   | アーキテクチャ・DB要件・検収パイプライン・移行手順                         |
| `docs/design/review_rubric.md`             | 検収ルーブリック（証拠必須）                                               |
| `docs/design/04_ビジュアルテーマ.md`       | ビジュアル・文言トーン・ネクマックスの規律（UIに触る前に必読）             |
| `docs/deploy.md`                           | 検証環境（Vercel）と Supabase 共有の運用                                   |
| `AGENTS.md`                                | AIエージェント向けの規律（CLAUDE.md / .gemini からも参照される単一ソース） |
