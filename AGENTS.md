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
| `docs/skills/browser_e2e_verification.md`  | ブラウザ自動操作で実機検証をする前（本番データ事故の再発防止）             |

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
npm run handoff              # 現在地レポート（セッション開始時・ツール切替直後に実行）

npm run cf:preview           # ローカルの workerd で本番相当の確認
npm run cf:deploy            # 本番へデプロイ（秘密ガード＋ビルド＋deploy）
npm run cf:branch            # 今のブランチ専用の確認URLを更新（作業中はこれ）
npm run cf:staging           # staging を更新。main でのみ実行できる
```

コミット時は husky + lint-staged が整形・eslint --fix・secretlint・lint:content を自動実行する。
フックを回避するコミット（--no-verify）はしない。

## デプロイ先は Cloudflare Workers（Vercel から移行済み・2026-08-03）

|            | URL                                               | 更新コマンド                      |
| ---------- | ------------------------------------------------- | --------------------------------- |
| 本番       | `https://academy.nexmax.workers.dev`              | `npm run cf:deploy`               |
| staging    | `https://staging-academy.nexmax.workers.dev`      | `npm run cf:staging`（main のみ） |
| ブランチ用 | `https://<ブランチ名>-academy.nexmax.workers.dev` | `npm run cf:branch`               |

OpenNext（`@opennextjs/cloudflare`）経由。旧 `@cloudflare/next-on-pages` は使わない。
Supabase（DB・認証）は移していない。手順の詳細は `docs/deploy.md` §0。

**踏むと痛い罠が4つある。触る前に読むこと。**

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
4. **`staging` へ上げてよいのは main の中身だけ。** `versions upload` は**ブランチの中身を
   確認URL全体に載せる**ので、作業ブランチから上げると他の作業が確認URLから消える
   （2026-08-04 に実際に起きた）。作業中の確認は `npm run cf:branch` で
   自分専用のURLへ上げる。`scripts/preview_alias.mjs` が止める。**このガードを外さない。**
   判定は**ブランチ名ではなく中身**（HEAD が origin/main と同一か）。worktree では main を
   1か所でしか checkout できず、名前で縛ると「他セッションの未コミット変更ごと
   staging に載せる」しか手が無くなるため。

**このリポジトリは public。** ドキュメントにアカウントIDなどの内部識別子を直書きしない。

## 実機検証で本番の学習者データを書き換えない

ブラウザ自動操作でフローを通すとき、**保存を伴う操作は検証専用アカウントで行う**。
2026-08-04 に、20問の自動入力が全問「Ⓐ」で完走してユーザー本人の診断結果を
書き換える事故を起こしている。本人アカウントで通すしかない場合は、**先に SQL で
現在値を退避**してから始める。作法とハマりどころは
`docs/skills/browser_e2e_verification.md`（実マウスクリックのみ有効・アニメーション中は
クリックが吸われる・撤退条件）。

## レビュー時の役割分担（複数エージェント検収）

- Claude: 理解設計・言語設計・シナリオ品質（ルーブリック準拠・証拠引用必須）
- Codex: コード品質・認証/DB/セキュリティ・E2Eの穴
- Gemini: Liveペルソナの実機挙動検証（`.gemini/rules.md` 参照）

指摘には必ず該当箇所の引用を付ける。引用できない指摘は出さない。

## 多スレッド運用ルール（2026-08-05 導入・Claude / Codex / Gemini 共通）

複数セッション並行開発で起きた事故（staging相互上書き・スコープ逸脱・把握不能）の再発防止。
背景と全文はローカルの「多スレッド開発運用提案.html」（v1.1）。

**このファイルはどのツールでも読まれる**（Claude は CLAUDE.md 経由、Codex は AGENTS.md を直接、
Gemini は `.gemini/rules.md` 冒頭の指示で）。ツールを乗り換えても規律は変わらない。

### 作業を始めるとき（ツール切替直後は必須）

```
npm run handoff
```

Claude がリミットで途中終了すると引き継ぎメモを書く時間はない。だから**渡す側ではなく
受け取った側が現在地を引き出す**方式にする。このコマンドが git と台帳から
「今どのブランチか・origin/main とどれだけズレているか・やりかけの変更・他の並行ブランチ・
未完了の台帳」を復元して表示する。前のツールの記憶がなくても再開できる。

### クライアント・モデル

- ユーザーはクライアント。**多論点メッセージは番号を振って全件を願いの台帳
  （GitHub Issues・ラベル `願い`）に記録し、受領確認を返す**。勝手に一部だけ拾わない。
- ユーザーが口にした制約・好みは、その場で `docs/constraints.md` に追記する（同ファイルは作業前に必読）。
- スコープは**ファイルパスでなく画面の言葉でAIが宣言**し、OKを得てから着手する。
  ファイルパスの指定をユーザーに求めない。
- **「閉じて」**と言われたら: 検証 → PR → 未完了項目を台帳へ戻す → 残項目を3行で報告して終了。
  進捗を消さずに畳む。
- 毎ターン冒頭に現在地を1行示す（例: 台帳#12・5歩中3歩目）。長時間処理は途中経過を届ける。

### 統合とデプロイ

- **staging・本番の更新は main からのみ**。作業中の確認は `npm run cf:branch`（自分専用URL）。
- **作業開始時と PR 作成前に `origin/main` を取り込む。** ローカルの main は古いことがある
  （2026-08-05、push されていないローカル main と別スレッドの成果が衝突した）。
  比較対象は必ず `origin/main`。ブランチは48時間以内に PR にして閉じる。
- 横断変更（リネーム・docs/design・スキーマ・共有コンポーネント・テーマ・package.json）は
  自スレッドで行わず、専用タスクとして提案する。検問が2重にある:
  - `.claude/settings.json` の PreToolUse フック … Claude が編集した瞬間に止まる
  - `scripts/check_protected_paths.mjs` … **pre-commit。Codex でも手作業でも止まる**
  - 承認を得た変更を通すとき: `touch .claude/allow-shared`（作業後に消す）または
    `ALLOW_SHARED=1 git commit -m "..."`

### 検証（引き算まで）と報告

- 「変えた所が動く証拠」に加えて**「変えていない所が変わっていない証拠」**を示す
  （UIは before/after スクショ、デプロイは主要ページの生存確認、diff の全ファイル一覧）。
- 不具合を指摘されたら、まず**自分の変更が原因である可能性**から調べる。
- ターン末尾の報告テンプレ（10行以内・リスト5項目まで・前置きなし）:
  `✅結果 / 📁範囲 / 🧪証拠([URL]を開く→操作→期待) / ⏭次の一手(1つ) / ❓判断(0-1個・A/B択)`
- 確認依頼に「URL＋操作＋見るポイント」が無いのは不合格。
  「URLと手順ください」と言われたら、直前の依頼をこの形式に直して再提示する。
