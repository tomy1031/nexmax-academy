<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# NexmaxAcademy — Japanese IT Pathway 新アプリ

カンボジアのIT専攻学生（日本語学習歴1年・N5〜N3挑戦）向けeラーニング。
旧アプリ（tomy1031/nextmake_onbording）のリニューアル。Next.js + TypeScript + Tailwind。

## 必読ドキュメント（該当する作業の前に必ず読む）

| ファイル                                   | 読むべきとき                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `docs/design/01_理解設計ガイド.md`         | 教材・UI文言・シナリオ・フィードバックを書く前（13原則＋アンチパターン集） |
| `docs/design/02_拡張カリキュラム設計書.md` | 新モジュール（M1〜M12）を実装する前                                        |
| `docs/design/03_リニューアル設計方針.md`   | アーキテクチャ・DB・検収・移行に関わる作業の前                             |
| `docs/design/review_rubric.md`             | 検収・レビューを行うとき（証拠必須ルーブリック）                           |
| `docs/design/04_ビジュアルテーマ.md`       | UI・画面・キャラクターに触る前（あおぞらパスウェイ／ネクマックス）         |
| `docs/skills/codex_image_generation.md`    | 画像アセットを作るとき（image-gen-2・一貫性ルール）                        |

## 絶対規律（機械検査の対象。違反はCIで落ちる）

1. 学習者向け文言に「不正解」「間違いです」「ダメ」を使わない。フィードバックは励まし＋次の行動。
2. コンテンツはプレーンテキスト＋読み辞書で持つ。**ルビHTMLを手書きしない**（表示時にエンジンが合成する）。
3. 選択式UIは読解確認（research）のみ。産出フェーズは自由入力・音声のみ。
4. APIキー・シークレットをクライアントコードに置かない。Gemini呼び出しはサーバプロキシ経由。
5. コンテンツデータは `src/content/schema.ts` のzodスキーマに準拠（`npm run lint:content` で検証）。
6. シナリオの秘匿情報（予算等、質問で引き出すべき事実）を調査用模擬ページに書かない。
7. キャラクター画像を手描きSVGで自作しない。ネクマックスは Codex image-gen-2 で生成する
   （正典 reference.png を参照入力・マスター記述を逐語使用。docs/skills/codex_image_generation.md）。
8. **`src/middleware.ts` を `proxy.ts` に改名しない**（`npx @next/codemod middleware-to-proxy`
   を実行しない）。`next build` が出す "middleware is deprecated" 警告は**意図して無視する**。
   Next.js 16 の proxy は Node ランタイム固定で、OpenNext は Node middleware を拒否して
   ビルドを止める（`@opennextjs/cloudflare` の `dist/cli/build/build.js`:
   `logger.error("Node.js middleware is not currently supported...")` → `process.exit(1)`。
   opennextjs-cloudflare#1277 が未解決）。Cloudflare Workers で動かす限り恒久の制約。
   詳細は docs/design/09_Cloudflare移行実行計画.md §2.3。
9. **「タイ」という国名を使わない**（文言・画像・画像生成プロンプトのいずれでも）。
   国際情勢を踏まえた運用判断。まなびマップのエリアは**画面に国名を出さず景色の名前で呼ぶ**
   （`src/content/areas.ts`。ゴールの日本だけは学習の目的地なので例外）。
   新しい国名を画面や画像に出すときは、事前にユーザーへ確認する。

## アーキテクチャ原則

- **エンジン＋データ分離**: 学習エンジン（再利用コンポーネント）とコンテンツ（スキーマ準拠データ）を分ける。教材追加＝データ追加。
- クライアントコンポーネント中心（学習エンジンはインタラクティブなため）。サーバ側はAPI Route（Geminiプロキシ・DB操作）に限定。RSCの高度な機能は使わない。
- 表記ゆれ正規化・ルビ合成・フィードバック表示は共有ユーティリティ/コンポーネントを使う。再実装しない。

## ディレクトリ規約

```
src/app/          # ルーティング・ページ（App Router）。サーバ処理は API Route に限定
src/components/   # 学習エンジンの再利用UI部品（クライアントコンポーネント中心）
src/lib/          # 横断ユーティリティ（env アクセサ・正規化・ルビ合成など）。再実装しない
src/content/      # コンテンツのzodスキーマ（schema.ts）
content/          # スキーマ準拠のコンテンツデータ（*.json）
scripts/          # 検収スクリプト（lint_content / measure_readability）
docs/design/      # 設計ドキュメント（唯一の知識ソース）
```

- 環境変数は `process.env` を直接読まず `src/lib/env.ts` を通す。
- 秘密鍵（`getServerEnv()`）はクライアントコンポーネントから import しない。

## コマンド

```
npm run dev                  # 開発サーバ
npm run build                # ビルド
npm run lint                 # ESLint（品質）
npm run format               # Prettier で整形（整形はESLintでなくPrettierが担当）
npm run format:check         # 整形崩れの検査（CIで実行）
npm run typecheck            # tsc --noEmit
npm run lint:content         # コンテンツ検収（スキーマ＋禁止語＋秘匿漏れ＋ID重複）
npm run lint:secrets         # 秘密情報（キー・トークン）混入検査
npm test                     # 単体テスト（Vitest）
npm run measure:readability  # 文長・漢字密度の計測レポート

npm run cf:preview           # ローカルの workerd で本番相当の確認
npm run cf:deploy            # 本番へデプロイ（秘密ガード＋ビルド＋deploy）
npm run cf:staging           # staging エイリアスを更新（本番は切り替えない）
```

コミット時は husky + lint-staged が整形・eslint --fix・secretlint・lint:content を自動実行する。
フックを回避するコミット（--no-verify）はしない。

## デプロイ先は Cloudflare Workers（Vercel から移行済み・2026-08-03）

|         | URL                                          | 更新コマンド         |
| ------- | -------------------------------------------- | -------------------- |
| 本番    | `https://academy.nexmax.workers.dev`         | `npm run cf:deploy`  |
| staging | `https://staging-academy.nexmax.workers.dev` | `npm run cf:staging` |

OpenNext（`@opennextjs/cloudflare`）経由。旧 `@cloudflare/next-on-pages` は使わない。
Supabase（DB・認証）は移していない。手順の詳細は `docs/deploy.md` §0。

**踏むと痛い罠が3つある。触る前に読むこと。**

1. **秘密鍵をビルド環境に置かない。** OpenNext は `.env*` の中身を丸ごと
   `.open-next/cloudflare/next-env.mjs` に書き出し Worker のバンドルに載せる。
   `.env.local` に `SUPABASE_SERVICE_ROLE_KEY` を置いたままビルドすると
   **service_role key がデプロイ成果物へ同梱される**（実測で確認済み）。
   `npm run cf:build` が `scripts/check_build_env.mjs` で検査して止める。**ガードを外さない。**
2. **`NEXT_PUBLIC_*` は逆にビルド時必須。** バンドルへ literal で埋まるので
   `wrangler secret` では手遅れ。
3. **Supabase の Redirect URLs は `https://<host>/**` で登録する。**
   `.../auth/callback` の完全一致では**動かない**（戻り先は `?code=...` 付きで照合される）。
   検証も必ず `?code=` を付けて行う（`docs/deploy.md` §0.3 に手順）。

**このリポジトリは public。** ドキュメントにアカウントIDなどの内部識別子を直書きしない。

## レビュー時の役割分担（複数エージェント検収）

- Claude: 理解設計・言語設計・シナリオ品質（ルーブリック準拠・証拠引用必須）
- Codex: コード品質・認証/DB/セキュリティ・E2Eの穴
- Gemini: Liveペルソナの実機挙動検証（`.gemini/rules.md` 参照）

指摘には必ず該当箇所の引用を付ける。引用できない指摘は出さない。
