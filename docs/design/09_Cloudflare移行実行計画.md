# 09. Cloudflare 移行 実行計画（次セッション用）

検証・本番とも Vercel から **Cloudflare Workers** へ移す。あわせて **Cloudflare Tunnel + Access** で、管理画面の「AI指示出し」（`/admin/ai`・実装済み）を本番からローカルの Codex に届かせる。**完全無料の範囲で行う**（Workers 無料枠・Tunnel 無料・Access 50人まで無料）。

このセッションで済んでいるもの / 次セッションでやるものを分けて書く。**次セッションは §4 のプロンプトをそのまま使って開始できる。**

---

## 1. このセッションで完了済み（前提）

| 項目 | 状態 |
|---|---|
| codex ブリッジ（`scripts/codex_bridge.mjs`・`npm run codex:bridge`） | **実機検証済み**。WSハンドシェイク・`initialize`・実ターン1回（`turn/completed`）まで通した |
| ブラウザ側トランスポート（`src/lib/codex-transport.ts`） | kotoba-tensei から移植。**ターンのタイムアウト（3分）を追加**（原典は永久に未解決になり得た） |
| 管理画面 `/admin/ai` | 実装済み。接続先URLは編集可能（localStorage `nexmax.codexUrl`、既定 `ws://127.0.0.1:8790/codex`）。**Tunnel 経由に切り替えるときは、この欄に `wss://<ホスト>/codex` を入れるだけ** |
| プロンプトの匿名化境界（`src/lib/codex-prompt.ts`） | 名前・メール・性別を送らない。ガードレール（08 §5・§6）逐語同梱 |
| 回答言語の記録（08 フェーズ2） | DB適用済み（`answer_language`・`language_switched`）。ウィザードが保存する |
| 設計書 05・06 の v3 追随 | 完了（07への移管注記） |

## 2. 移行の技術的な前提（調査済み・裏取りあり）

1. **OpenNext（`@opennextjs/cloudflare`）が唯一の推奨経路。** 旧 `@cloudflare/next-on-pages` は非推奨（入っていたら削除する側）。
2. **Next.js は `16.2.11` 以上が必要。** 現在の pin `16.2.10` は peerDependencies `>=15.5.21 <16 || >=16.2.11` の**穴にちょうど嵌っている**。最初に `16.2.12`（またはそれ以降）へ上げる。
3. **`middleware.ts` を `proxy.ts` に改名してはならない（恒久の制約）。** Next.js 16 の proxy は Node ランタイム固定で、OpenNext は Node middleware を拒否する（opennextjs-cloudflare #1277 が未解決。Supabase セッション更新というこのプロジェクトと同一の用途の報告つき）。現在の `middleware.ts`（edge 出力）はビルドを通る。**`npx @next/codemod middleware-to-proxy` を実行した瞬間に壊れる**ので、CLAUDE.md/AGENTS.md に禁止事項として書き足すこと。
4. `nodejs_compat` フラグ＋`compatibility_date` は `2025-05-05` 以降（`FinalizationRegistry` 対策）。このプロジェクトは `node:` import ゼロ・Server Actions ゼロ・API Route 1本で、非互換の芽は少ない。
5. **画像は追加設定不要。** `<Image unoptimized>` なので `IMAGES` バインディング（課金）不要。静的アセット配信は無料・無制限。`public/` は 11MB / 約100ファイルで制限に余裕。
6. **OAuth コールバック**（`src/app/auth/callback/route.ts`）は `x-forwarded-host` 優先のコードだが、Workers では `request.url` が公開URLになるためフォールバック側で動く見込み。**実機確認が必須**。
7. **Supabase の Redirect URLs**: `workers.dev` のプレビューURLは `<version>-<worker>.<subdomain>.workers.dev` の3階層で、Supabase のワイルドカード（1階層）が効かない。**`wrangler versions upload --preview-alias` で固定エイリアスを作って登録**する。未登録URLは拒否ではなく Site URL へ `?code=` 付きフォールバックする（`docs/deploy.md` §4 と同じ罠）。
8. **無料枠の注意**: Workers Free の CPU 制限（1リクエスト 10ms）は SSR で足りない場面がありうる。このアプリはほぼ全ページがクライアントコンポーネント＋静的アセットなので通る見込みだが、**計測してから判断**する。足りなければ本番だけ Workers Paid（$5/月）に上げる判断材料を出す（それでも AI は無料のまま）。

## 3. 次セッションの作業（順番どおり）

### Phase A — Next.js 更新と OpenNext 導入（ローカルで完結）→ **完了（2026-07-30）**

1. ✅ `next`・`eslint-config-next` を 16.2.12 へ更新 → `npm test / lint / typecheck / build` 全通し
2. ✅ `@opennextjs/cloudflare` 1.20.2 と `wrangler` 4.115.0 を導入、`wrangler.jsonc` 作成
3. ✅ `opennextjs-cloudflare build && preview` でローカル検証（全11ルート 200・404・middleware の `?code=` 転送・ブラウザ描画・console エラー0）
4. ✅ AGENTS.md 絶対規律 8 に「`middleware.ts` を `proxy.ts` に改名しない」を追記

Phase A で判明した追加事項（計画時点では未把握）:

- **ESLint が `.open-next/` を走査してヒープを食い潰し `npm run lint` が OOM で落ちる。**
  `eslint.config.mjs` の `globalIgnores` と `.prettierignore` に `.open-next/` を追加した。
- **`turbopack.root` の明示が必要。** ホーム側に `~/package-lock.json` があると
  Turbopack がそこをワークスペース root と誤認し、standalone 出力の依存トレースがずれる。
- **秘密鍵がバンドルに同梱される経路がある（重要）。** OpenNext の `compileEnvFiles` は
  `.env*` の中身を丸ごと `.open-next/cloudflare/next-env.mjs` に書き出し、それが Worker の
  バンドルに入る。`.env.local` に `SUPABASE_SERVICE_ROLE_KEY` を置いたままビルドすると
  service_role key がデプロイ成果物に入る（実測で確認）。
  `scripts/check_build_env.mjs` を作ってビルド前に止めるようにし、`cf:deploy` / `cf:upload`
  に接続した。詳細は `docs/deploy.md` §0.2。
- **§2.6 の懸念は解消。** `auth/callback` の `x-forwarded-host` 分岐は workerd では効かず、
  フォールバック（`request.url` の origin）が走る。Workers では `request.url` が公開URLなので
  正しく動く。ただし独自ドメインでの実機確認は Phase B-7 で行う。

### Phase B — デプロイと認証（ユーザーの Cloudflare アカウントが必要）→ **未完了**

5. デプロイ。`NEXT_PUBLIC_*` は**ビルド変数**（`wrangler secret` では手遅れ。バンドルに埋まるため）
   - `wrangler` の認証は**済み**（`tomy1031@gmail.com` / account `<CLOUDFLARE_ACCOUNT_ID>`）。
     `wrangler login` は不要
   - workers.dev subdomain = **`nextmake`** → 本番URLは
     `https://nexmax-academy.nextmake.workers.dev`
   - 秘密を除いたビルドは検証済み（`next-env.mjs` が空・バンドルに service_role key なし・
     `NEXT_PUBLIC_*` はクライアント/middleware/server に inline 済み）。**deploy 実行のみ残り**
6. プレビューエイリアスを作成し、Supabase の Redirect URLs に登録
   - **ワイルドカードは効かない**（§2.7）。登録する2本は `docs/deploy.md` §0.3 に逐語で記載
   - タスクボードに登録済み
7. Google ログイン → 20問 → 保存 → `/admin` の実機確認（deploy.md §4 の再現）

### Phase C — Tunnel + Access（AI指示出しを本番から使う）

8. `cloudflared` インストール → Tunnel 作成 → `codex.<ドメイン>` を `http://127.0.0.1:8790` に向ける
9. Zero Trust Access でアプリを作成し、**Google 認証＋管理者2メール**（`supabase/migrations/20260725090000_profiles.sql:46` と同じ2つ）だけ許可
10. `/admin/ai` の接続先に `wss://codex.<ドメイン>/codex` を入れて実機確認
11. `docs/deploy.md` を Cloudflare 前提に書き換え（Vercel の節は「旧」として残す）

### 決めごと（ユーザー確認が必要なもの → タスクボード登録済み）

- Cloudflare アカウントと**ドメイン**（Tunnel のホスト名に必要。ゾーンは無料プランで可）
- 本番ドメインを何にするか（workers.dev のままか、独自ドメインか）

## 4. 次セッションの開始プロンプト（そのまま貼る）

### Phase A+B 用

```
NexmaxAcademy を Vercel から Cloudflare Workers へ移行してください。
計画は docs/design/09_Cloudflare移行実行計画.md にあり、この順で進めてください。

前提（計画書 §2 に裏取りあり）:
- OpenNext (@opennextjs/cloudflare) を使う。next-on-pages は使わない
- 最初に next を 16.2.12 以上へ更新する（16.2.10 は OpenNext の対応範囲外）
- middleware.ts を proxy.ts に改名しない（OpenNext が Node middleware を拒否する。恒久の制約として AGENTS.md にも追記する）
- nodejs_compat + compatibility_date >= 2025-05-05
- NEXT_PUBLIC_* はビルド時に埋まるので、wrangler secret ではなくビルド変数で渡す

進め方の規律:
- 各段階で npm test / lint / typecheck / build を通し、証拠を示してから次へ
- opennextjs-cloudflare preview でログイン以外の全ページをブラウザ確認してからデプロイ
- デプロイ後、Supabase の Redirect URLs にプレビューエイリアスを登録するまで
  Google ログインは動かない（docs/deploy.md §4 の罠）。登録が必要なURLを列挙して
  タスクボード（managing-my-tasks）に登録すること
- 私の確認が必要になるまで止まらず進める。確認の前に Codex のレビューを通す
```

### Phase C 用

```
Cloudflare Tunnel + Access で、管理画面の AI指示出し（/admin/ai）を本番から
使えるようにしてください。計画は docs/design/09_Cloudflare移行実行計画.md §3 Phase C。

構成: ブラウザ → wss://codex.<ドメイン>/codex（Access: Google認証・管理者2メールのみ）
→ Tunnel → localhost:8790（npm run codex:bridge）→ codex app-server

- ブリッジと画面は実装済み・ローカル実機検証済み。接続先URL欄に wss:// を入れるだけで
  切り替わる設計になっている
- cloudflared の設定は LaunchAgent 化して、Mac 起動時に自動で立つようにする
- Access のポリシーは profiles.sql:46 の2メールと一致させる
- 終わったら docs/design/08 §0.1.1 の Tunnel 節に「構築済み」と実際のホスト名を追記
```

## 5. 移行しないもの・残る制約

- **Supabase はそのまま**（DB・認証とも）。移すのはホスティングだけ
- 学習者向け Live 機能の Gemini キー（localStorage・BYOK）はスコープ外
- `/admin/ai` の生成結果は**保存しない**方針のまま（08）。保存したくなったら 08 の議論（30日実削除・二枚舌問題）に戻ること
- Codex サブスクの認証（`~/.codex/auth.json`）はユーザー個人のもの。ブリッジを他人に使わせる運用はしない（Access で2人に絞る理由の一つ）
