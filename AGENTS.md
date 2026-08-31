# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# NexmaxAcademy — Japanese IT Pathway 新アプリ

カンボジアのIT専攻学生（日本語学習歴1年・N5〜N3挑戦）向けeラーニング。
旧アプリ（tomy1031/nextmake_onbording）のリニューアル。Next.js + TypeScript + Tailwind。

## 必読ドキュメント（該当する作業の前に必ず読む）

| ファイル                                   | 読むべきとき                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `docs/constraints.md`                      | **すべての作業の前**（ユーザーが伝えた制約・好みの永続台帳）               |
| `docs/design/01_理解設計ガイド.md`         | 教材・UI文言・シナリオ・フィードバックを書く前（13原則＋アンチパターン集） |
| `docs/design/02_拡張カリキュラム設計書.md` | 新モジュール（M1〜M12）を実装する前                                        |
| `docs/design/03_リニューアル設計方針.md`   | アーキテクチャ・DB・検収・移行に関わる作業の前                             |
| `docs/design/review_rubric.md`             | 検収・レビューを行うとき（証拠必須ルーブリック）                           |
| `docs/design/04_ビジュアルテーマ.md`       | UI・画面・キャラクターに触る前（あおぞらパスウェイ／ネクマックス）         |
| `docs/skills/codex_image_generation.md`    | 画像アセットを作るとき（image-gen-2・一貫性ルール）                        |
| `docs/skills/manga_generation.md`          | まんが教材（コマ割り・セリフ・ふりがな）を作る・直すとき                   |
| `docs/codex-backend.md`                    | 生成バックエンド（Codex／Gemini）に触る前                                  |
| `docs/skills/browser_e2e_verification.md`  | ブラウザ自動操作で実機検証をする前（本番データ事故の再発防止）             |

## 絶対規律（1・2・5・6・9 は `lint:content` が機械検査。**3・7・8 は検査が無い＝文章だけが頼り**）

1. 学習者向け文言に「不正解」「間違いです」「ダメ」を使わない。フィードバックは励まし＋次の行動。
   **「〜できなくても だいじょうぶ」「〜でなくて OK」も同じく使わない**（2026-08-27 の指定
   「こういう後ろ向きを許容する表現は一切いらない」）。やさしさのつもりでも、読む前に
   「あなたはできないだろう」と先回りしている。**同じゆるさは _動き_ で出す**——判定をゆるく
   する・欄を optional にする・時間を区切らない。ことばで予防線を張らない。
   禁止語の一覧は `FORBIDDEN_LEARNER_WORDS`（`src/content/schema.ts`）にあり、
   `lint:content` が**コンテンツと src の文字列を両方**走査する。
2. コンテンツはプレーンテキスト＋読み辞書で持つ。**ルビHTMLを手書きしない**（表示時にエンジンが合成する）。
   学習者が読む文の漢字は、読み辞書で**全部**覆う。難しい語を**ひらがなに開かない**
   （漢字＋ふりがなを保ち、N5を超える語は英語で意味を添える。docs/constraints.md 製品の制約）。
3. 選択式UIは読解確認（research）のみ。産出フェーズは自由入力・音声のみ。
4. APIキー・シークレットをクライアントコードに置かない。Gemini呼び出しはサーバプロキシ経由。
5. コンテンツデータは `src/content/schema.ts` のzodスキーマに準拠（`npm run lint:content` で検証）。
6. シナリオの秘匿情報（予算等、質問で引き出すべき事実）を調査用模擬ページに書かない。
7. キャラクター画像を手描きSVGで自作しない。ネクマックスは Codex image-gen-2 で生成する
   （正典 reference.png を参照入力・マスター記述を逐語使用。docs/skills/codex_image_generation.md）。
8. **`src/middleware.ts` を `proxy.ts` に改名しない**（`npx @next/codemod middleware-to-proxy` も実行しない）。
   `next build` の "middleware is deprecated" 警告は**意図して無視する**。OpenNext が Node middleware を
   拒否してビルドを止めるため、Cloudflare Workers で動かす限り恒久の制約（docs/design/09 §2.3）。
9. **「タイ」という国名を使わない**（文言・画像・画像生成プロンプトのいずれでも）。国際情勢を踏まえた運用判断。
   まなびマップのエリアは**画面に国名を出さず景色の名前で呼ぶ**（`src/content/areas.ts`。ゴールの日本だけは例外）。
   **これ以外の国名は、教材の本文に自由に書いてよい**（事前の確認は要らない）。2026-08-23 の是正 —
   ここにあった「新しい国名は事前にユーザーへ確認する」は指示の読み違いで、**まなびマップの
   見せかたの話**を本文の検査にまで広げていた。そのせいで会社の海外拠点すら説明できなくなっていた。

## アーキテクチャ原則

- **エンジン＋データ分離**: 学習エンジン（再利用コンポーネント）とコンテンツ（スキーマ準拠データ）を分ける。教材追加＝データ追加。
- クライアントコンポーネント中心（学習エンジンはインタラクティブなため）。サーバ側はAPI Route（Geminiプロキシ・DB操作）に限定。RSCの高度な機能は使わない。
- 表記ゆれ正規化・ルビ合成・フィードバック表示は共有ユーティリティ/コンポーネントを使う。再実装しない。

## ディレクトリ規約

```
src/app/          # ルーティング・ページ（App Router）。サーバ処理は API Route に限定
src/components/   # 学習エンジンの再利用UI部品（クライアントコンポーネント中心）
src/lib/          # 横断ユーティリティ（env アクセサ・正規化・ルビ合成など）。再実装しない
src/content/      # zodスキーマ（schema.ts）とTS台帳（personality / glossary / areas 等）
content/          # スキーマ準拠のコンテンツデータ（*.json）。DBと同一IDならDBが勝つ（先生の直し反映）
scripts/          # 検収・運用スクリプト（lint_content / handoff / ガード類）
docs/design/      # 設計ドキュメント（唯一の知識ソース）
docs/skills/      # 作業手順書（ツール共通の本体。.claude/skills/ は薄い発火ラッパー）
```

- 環境変数は `process.env` を直接読まず `src/lib/env.ts` を通す。
- 秘密鍵（`getServerEnv()`）はクライアントコンポーネントから import しない。

## URLの決まり（学習者向け）

学習者のURLは「どのステージの何か」がURLだけで分かる形にする。

```
/houkoku                 ステージのトップ（ステージIDがURLの1段目）
/houkoku/manga           その中の教材（同じ種別が1つなら ID を付けない）
/houkoku/listening-<ID>  同じ種別が2つ以上あるときだけ ID を足す
/arcade/<ID>             ことばアーケードは独立したアプリなので別（ステージから直行できる）
/dictionary              辞書＝ことばの正（content/vocab）を term で畳んだもの（保存先は増やさない）
```

- 組み立てと読み取りは `src/lib/stage-routes.ts` だけで行う（画面が独自に文字列を組まない）。
- **ステージIDはURLの1段目を占める**ので、アプリのルートと同じ名前は使えない。
  `stageSchema` の `RESERVED_STAGE_IDS` が保存の時点で弾く。
  **`src/app/` に1段目のルートを足したら、この一覧にも足す**（足し忘れると、その名前の
  ステージに永久にたどり着けない。静的ルートが必ず勝つため）。
- 古いURL（`/stage/<id>`・`/manga/<id>` など）は消さず、本来のURLへリダイレクトする。
- **`/[stage]` は ISR なので 404 もキャッシュされる。** 新ルート追加直後の 404/200 の揺れは
  `revalidate` 待ちで直る。焦って別の原因を探さない（2026-08-06 実発生）。
- 先生向けの画面は `/admin` に集約（サイドバー）。`/studio` は `/admin/stages` へ送る。

## コマンド

```
npm run dev                  # 開発サーバ（※検証目的では立てない。constraints.md 運用の制約）
npm run build                # ビルド
npm run lint                 # ESLint（品質）
npm run format               # Prettier で整形（整形はESLintでなくPrettierが担当）
npm run format:check         # 整形崩れの検査（CIで実行）
npm run typecheck            # tsc --noEmit
npm run lint:content         # コンテンツ検収（スキーマ＋禁止語＋国名＋ふりがな覆い＋焼き込みずれ 他）
npm run lint:secrets         # 秘密情報（キー・トークン）混入検査
npm test                     # 単体テスト（Vitest）
npm run measure:readability  # 文長・漢字密度の計測レポート
npm run handoff              # 現在地レポート（セッション開始時・ツール切替直後に実行）

npm run cf:preview           # ローカルの workerd で本番相当の確認
npm run cf:deploy            # 本番へデプロイ（秘密ガード＋ビルド＋deploy）
npm run cf:branch            # 今のブランチ専用の確認URLを更新（作業中はこれ）
npm run cf:staging           # STG を更新。integration の中身でのみ実行できる（ふだんは自動）
```

コミット時は husky + lint-staged が整形・eslint --fix・secretlint・lint:content を自動実行する。
フックを回避するコミット（--no-verify）はしない。

## デプロイ先は Cloudflare Workers（Vercel から移行済み・2026-08-03）

|            | URL                                               | 載るもの      | いつ更新されるか                                                                                       |
| ---------- | ------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| 本番       | `https://academy.nexmax.workers.dev`              | `main`        | **火・水・金 16:12〜17:12 ICT に自動**（授業は 17:30。5回 起きて 必要なときだけ 1回 出る）。緊急は手動 |
| STG        | `https://staging-academy.nexmax.workers.dev`      | `integration` | `integration` へマージするたび**自動**                                                                 |
| ブランチ用 | `https://<ブランチ名>-academy.nexmax.workers.dev` | 作業ブランチ  | `npm run cf:branch`                                                                                    |

**STG は門番、本番は届け先**（2026-08-27 から）。作業ブランチは `integration` へ PR し、
STG で確かめてから `main` へ昇格する。それまでは STG に載るのが main だけで、
「STG で確かめてから」が成り立っていなかった（もう戻せないものを あとから 見る場所だった）。
昇格と本番デプロイは「デプロイ」ワークフローが授業の前に自動でやる（`.github/workflows/deploy.yml`）。

OpenNext（`@opennextjs/cloudflare`）経由。手順の詳細は `docs/deploy.md` §0。**罠は6つ**:

1. **秘密鍵をビルド環境に置かない**。OpenNext は `.env*` をバンドルへ焼き込む。
   `scripts/check_build_env.mjs` が検査して止める — **ガードを外さない**。
2. **`NEXT_PUBLIC_*` は逆にビルド時必須**（バンドルへ literal で埋まる。`wrangler secret` では手遅れ）。
3. **Supabase の Redirect URLs は `https://<host>/**` 形式で登録**（完全一致では動かない。
   機械検査なし — `docs/deploy.md` §0.3 必読。検証は `?code=` を付けて行う）。
4. **STG へ上げてよいのは `integration` の中身だけ**（ブランチの中身を上げると他の作業が消える。
   `scripts/preview_alias.mjs` が止める — **ガードを外さない**。作業中は `npm run cf:branch`）。
   2026-08-27 に基準を main → `integration` へ **移した**（**外したのではない**）。
   ガードの仕組み（ブランチ名ではなく**中身**で判定する）はそのまま、比べる相手だけを
   差し替えてある。**これは「正当な緩和の前例」ではない。** 他のガード
   （`check_build_env.mjs`・`preview_alias.mjs`・`check_protected_paths.mjs`）を
   外してよい理由には**まったくならない**。
5. **Worker の大きさは無料枠 gzip 3MiB が上限**（超えると `code:10027` で deploy が止まる）。
   これは**コードの大きさ**の上限で、通信量・保存量・アクセス数とは別。D1/KV/R2 に
   データを逃がしても効かない。効くのは**重複をなくす・圧縮する・サーバで動かないコードを載せない**。
   `npm run check:size` で確認（2.8MiB 警告・3.0MiB で失敗。CI にも同じ見張りがある）。
   2026-08-16 に 3066→1822 KiB へ削減した経緯と内訳は `docs/deploy.md` §0.5。
6. **鍵は GitHub の Environment Secrets（環境名 `Preview`）に置く**。ジョブに
   `environment: Preview` を書かないと**見えない**（リポジトリ直下の Secrets とは別物）。
   検証用の `GEMINI_API_KEY` も同じ場所。**ビルドのステップには渡さない**（罠1と同じ理由）。

**このリポジトリは public。** ドキュメントにアカウントIDなどの内部識別子を直書きしない。

## 実機検証で本番の学習者データを書き換えない

ブラウザ自動操作で**保存を伴う操作は検証専用アカウントで行う**（2026-08-04 に本人の診断結果を
上書きする事故が実発生。やむを得ず本人アカウントを使うときは先に SQL で現在値を退避）。
作法とハマりどころは `docs/skills/browser_e2e_verification.md` 必読。

## レビュー時の役割分担（複数エージェント検収）

- Claude: 理解設計・言語設計・シナリオ品質（ルーブリック準拠・証拠引用必須）
- Codex: コード品質・認証/DB/セキュリティ・E2Eの穴
- Gemini: Liveペルソナの実機挙動検証（`.gemini/rules.md` 参照）

指摘には必ず該当箇所の引用を付ける。引用できない指摘は出さない。

## 多スレッド運用ルール（2026-08-05 導入・Claude / Codex / Gemini 共通）

複数セッション並行開発の事故（staging相互上書き・スコープ逸脱・把握不能）の再発防止。
このファイルはどのツールでも読まれる（Claude は CLAUDE.md 経由、Codex は AGENTS.md を直接、
Gemini は `.gemini/rules.md` 冒頭の指示で）。ツールを乗り換えても規律は変わらない。

### 作業を始めるとき（ツール切替直後は必須）

```
npm run handoff
```

git と台帳から現在地（ブランチ・origin/integration との差・本番と main の差・やりかけの変更・
並行スレッド・未完了の台帳）を復元して表示する。前のツールの記憶がなくても再開できる。

### 現在地の罠（必ず知っておく）

- **worktree のフォルダ名はブランチ名と一致しない**ことがある（worktree の転用の歴史があるため）。
  現在地とスレッド全体像は `npm run handoff` で確認する。
- **リポジトリ本体のチェックアウトは作業ブランチに置かれていることがある**。本体で新しい
  セッションを開かない。作業は必ず worktree で。
- **ローカルの `integration` / `main` は古いことがある**。比較・統合の基準は必ず
  `origin/integration`（作業ブランチのベース・STG の配信元）と `origin/main`（本番の配信元）。

### クライアント・モデル

- ユーザーはクライアント。**多論点メッセージは番号を振って全件を願いの台帳
  （GitHub Issues・ラベル `願い`）に記録し、受領確認を返す**。勝手に一部だけ拾わない。
- ユーザーが口にした制約・好みは、その場で `docs/constraints.md` に追記する（同ファイルは作業前に必読）。
- スコープは**ファイルパスでなく画面の言葉でAIが宣言**し、OKを得てから着手する。
  ファイルパスの指定をユーザーに求めない。
- **ユーザーは PR・マージをしない（クライアント方式）**。AI が検証 → PR → `integration` 統合 →
  STG更新まで進める。ユーザーは STG のURLで**中身**（教材の良し悪し）を見るだけでよい。
  本番へは**授業の前に自動で出る**ので、「本番OK」を求めない（2026-08-21 の決定）。
- ユーザー確認を求める前に、**ユーザーが見られる形（ブランチURL/STG）まで進め、AI同士の
  チェック（fable/Codex）を先に通す**。ユーザーが確認できない中間物で承認待ちしない。
- **「閉じて」**と言われたら: 検証 → PR → `integration` 統合 → STG更新 → 未完了項目を台帳へ戻す →
  残項目を3行で報告して終了。進捗を消さずに畳む。
- 毎ターン冒頭に現在地を1行示す（例: 台帳#12・5歩中3歩目）。長時間処理は途中経過を届ける。

### 統合とデプロイ

- **STG の更新は `integration` から、本番の更新は `main` から**（どちらも自動。手で叩かない）。
  作業中の確認は `npm run cf:branch`（自分専用URL）。
- **STG へ出すのに ユーザーの許可を取らない**（2026-08-31 の指定）。検査（vitest・e2e・lint）が
  緑なら、PR 作成 → `integration` へマージ → STG 反映まで**そのまま進める**。
  **Cloudflare の枠は理由にならない**——STG のデプロイは KV へ 1件も書かないので、
  何回出しても本番の書き込み枠（1000件/日）を減らさない（docs/deploy.md §0.6）。
  止めてよいのは**本番の手動 dispatch** だけ（ふだんは授業前の自動デプロイに任せる）。
- **作業開始時と PR 作成前に `origin/integration` を取り込む。** PR の宛先も `integration`。
  ブランチは48時間以内に PR にして閉じる。
- **緊急の直しだけ `main` へ直接**（バグ・授業当日の事故）。`main` から切って `main` へ PR し、
  CI green でマージ → Actions「デプロイ」→ Run workflow → production で即時に出す →
  **`main` を `integration` へ戻しマージする**。戻し忘れると、次の昇格が
  「早送りできません」で止まる（ワークフローがそう作ってある。取り残しを作らないため）。
- **DBの移行SQLをダッシュボードに手で貼らない**（2026-08-26 の事故）。`supabase/migrations/` へ
  置いて **`integration`** へ入れれば「デプロイ（DB）」ワークフローが自動で流す（docs/deploy.md §0.8）。
  DBは全環境で1つを共有するので、統合の時点で流せば**DBが常にコードより先**になる（安全な向き）。
  移行SQLは **いま本番で動いているコードを壊さない変更だけ**にする（列を足す・not null を外す）。
  **DBに依存する直しを「これで直った」と報告する前に、DBに実際に入っているか確かめる。**
  `npm run handoff` の「■ DB（移行SQL）」を見る。鍵の無い環境ではそこが
  「確かめていない」と出るので、その場合は Supabase コネクタで直に照会する
  （`select version from supabase_migrations.schema_migrations order by version;`）。
  テストもCIも緑のまま**DBだけが遅れる**——2日間 誰も気づかず、7人が名簿から消えていた。
- 横断変更（リネーム・docs/design・スキーマ・共有コンポーネント・テーマ・package.json）は
  自スレッドで行わず、専用タスクとして提案する。検問は2重（Claude の PreToolUse フックと
  pre-commit の `scripts/check_protected_paths.mjs` — Codex でも手作業でも止まる）。
  検問が止めるのは AGENTS.md／CLAUDE.md／docs/design/／schema.ts／globals.css／
  characters画像／package.json／.github/／.claude/settings.json。
  **`src/components/` は検問が無い＝文章ルールだけが頼り**なので特に注意。
  承認済みの変更が止まったら、検問が表示する解除手順に従う（作業後は必ず元に戻す）。

### 検証（引き算まで）と報告

- **ユーザーは動作確認をしない。通しの確認は機械がやる**（2026-08-16 の指定）。
  アプリは **Supabase 未設定なら鍵ゼロのデモモードで起動する**（`src/middleware.ts`）ので、
  AI もCIも**いつでもアプリを立てて通しプレイできる**。ユーザーに見てもらうのは
  **STG の中身（教材の良し悪し）だけ**で、「動くかどうか」を確かめさせない。
  - `npm run e2e` … 通しの自動検証（Playwright。開発コンテナでは
    `E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を付ける）
  - `npm run check:size` … Worker の大きさの見張り（デプロイ §罠5）
  - CI では PR ごとに `check` / `e2e` / `size` の3つが走り、**画面の写真が成果物として残る**
  - 何が自動で確かめられ、**何がまだ人に残るか**は `docs/自動でたしかめる1枚.md`
- **AI自身も手で確認しない**。画面を見たいときは、このコンテナでアプリを立てて
  Playwright で撮る（390px の実機幅で撮ると、実際に文字の折返しの崩れが見つかった）。
- 「変えた所が動く証拠」に加えて**「変えていない所が変わっていない証拠」**を示す
  （UIは before/after スクショ、デプロイは主要ページの生存確認、diff の全ファイル一覧）。
- 不具合を指摘されたら、まず**自分の変更が原因である可能性**から調べる。
- ターン末尾の報告テンプレ（10行以内・リスト5項目まで・前置きなし）:
  `✅結果 / 📁範囲 / 🧪証拠([URL]を開く→操作→期待) / ⏭次の一手(1つ) / ❓判断(0-1個・A/B択)`
  「⏭次の一手」には**ユーザーがすべきこと**をシンプルに書く（ユーザーのワーキングメモリーを疲れさせない）。
- 確認依頼に「URL＋操作＋見るポイント」が無いのは不合格。
  「URLと手順ください」と言われたら、直前の依頼をこの形式に直して再提示する。
