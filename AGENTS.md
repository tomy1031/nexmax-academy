<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# nextmake_kenshu — Japanese IT Pathway 新アプリ

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
```

コミット時は husky + lint-staged が整形・eslint --fix・secretlint・lint:content を自動実行する。
フックを回避するコミット（--no-verify）はしない。

## レビュー時の役割分担（複数エージェント検収）

- Claude: 理解設計・言語設計・シナリオ品質（ルーブリック準拠・証拠引用必須）
- Codex: コード品質・認証/DB/セキュリティ・E2Eの穴
- Gemini: Liveペルソナの実機挙動検証（`.gemini/rules.md` 参照）

指摘には必ず該当箇所の引用を付ける。引用できない指摘は出さない。
