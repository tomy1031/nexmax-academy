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

### Phase B — デプロイと認証 → **5・6 完了（2026-07-31）／7 のみ残り**

5. ✅ デプロイ済み。`NEXT_PUBLIC_*` は**ビルド変数**（`wrangler secret` では手遅れ。バンドルに埋まるため）
   - `wrangler` 認証済み（`tomy1031@gmail.com`）。アカウントIDは `npx wrangler whoami` で確認する
     — **このリポジトリは public なので直書きしない**
   - 本番URL: **`https://academy.nexmax.workers.dev`**
     （Worker名 `academy` ＋ アカウントsubdomain `nexmax`）
   - 秘密を除いたビルドで投入（`next-env.mjs` が空・バンドルに service_role key なし・
     `NEXT_PUBLIC_*` はクライアント/middleware/server に inline 済み）

**URL短縮の経緯（2026-07-31 〜 08-03）**

公開URLは `<Worker名>.<アカウントsubdomain>.workers.dev` で、**`workers.dev` も
subdomain の階層も外せない**。短くする手段は独自ドメインだけだが、ドメインは買わない方針
（§Phase C の決定）。そこで**2つのラベルを選び直して**短縮した。

| | URL | 文字数 |
|---|---|---|
| 初回デプロイ時 | `nexmax-academy.mokumoku-db.workers.dev` | 38 |
| subdomain 変更後 | `nexmax-academy.nextmake.workers.dev` | 35 |
| **最終** | **`academy.nexmax.workers.dev`** | **26** |

- アカウントsubdomain は**アカウント全体で1つ**。既定 `mokumoku-db` は別アプリ由来の名前
  だったため変更した。**変更はダッシュボード操作のみ**（API は
  `code 10036: Account already has an associated subdomain` で既存subdomainの変更を拒否）
- 希望だった `nexmax.academy.workers.dev` は **`academy` が他者に取得済み**で不可。
  `nexmax` は空いていたので `academy.nexmax.workers.dev` にした
- **subdomain の空き判定**: 登録済みなら任意の3階層目が DNS 解決し、未登録なら解決しない。
  `dig +short A zz1test.<候補>.workers.dev` で判定できる（自分の subdomain が
  「取得済み」と出ることで裏を取る）
- Worker 名は `nexmax-academy` → `academy` に改名した。**改名は別 Worker になる**ので
  旧 Worker は `wrangler delete` で消す（デプロイ履歴は引き継がれない）
- subdomain 変更は**アカウント内の全 Worker のURLを変える**。mokumoku も
  `mokumoku.nexmax.workers.dev` に移ったが、URLをコードに持っていなかったため
  再デプロイ不要だった

**踏んだ罠: URL変更と Redirect URLs 登録の順序（2026-08-03）**

subdomain を変更する**前**に、変更**後**のURL（`academy.nexmax.workers.dev/**`）を
Supabase に登録してしまい、その間ログインが Vercel へ落ち続けた。
実際に生きているURLと許可リストが食い違うと `/authorize` の時点で拒否される。
**URLを変えてから登録する**か、移行期間中は両方登録しておくこと。
6. ✅ プレビューエイリアス作成済み: **`https://staging-academy.nexmax.workers.dev`**
   （`wrangler versions upload --preview-alias staging`）
   - Supabase の Redirect URLs は **`/**` 付きで登録する**。
     `.../auth/callback` の完全一致では動かない（下記）
   - 検証方法: Supabase の auth ログは**採用した戻り先**を `referer` に記録する。
     `/authorize?redirect_to=<URL>` を叩いてログを見れば、Google の認証情報なしに
     登録の成否が判定できる（手順は `docs/deploy.md` §0.3）
   - `/authorize` の `Location` ヘッダは未登録でも同じに見えるので**判定に使えない**

**踏んだ罠: 完全一致で登録すると `?code=` 付きで外れる（2026-08-03）**

最初 `https://academy.nexmax.workers.dev/auth/callback` を完全一致で登録し、
クエリなしの `/authorize` テストが通ったので「登録できた」と判断した。**これは誤判定。**
実際のログインでは `/authorize` は通るが `/callback` で Site URL（Vercel）へ落ちた。

原因は、戻り先が **`?code=...` が付いた状態で照合される**こと。実測した対照:

| 渡した `redirect_to` | 判定 |
|---|---|
| `workers.dev/auth/callback` | 受理 |
| `workers.dev/auth/callback?code=...` | **拒否** ← 実フロー |
| `vercel.app/auth/callback?code=...` | 受理 |
| `vercel.app/anything/deep/path` | 受理 |

**Vercel が今まで動いていたのは Site URL 配下が暗黙に全許可されるためで、
登録が正しかったからではない。** Site URL 以外へ移すとこの暗黙許可が効かなくなる。

対処: `https://<host>/**` で登録する。検証も**必ず `?code=` を付けて**行う。
7. ⬜ Google ログイン → 20問 → 保存 → `/admin` の実機確認（deploy.md §4 の再現）
   - **ユーザー本人の Google 認証が必要なため Claude では実施できない**。ここだけ手作業
   - 失敗した場合は Supabase の auth ログ（MCP `get_logs(service:"auth")`）と
     Workers のログ（`wrangler tail`・observability 有効化済み）で追える

Phase B の実機検証結果（本番URLに対して実施）:

- 全10ルート 200・未存在 404。`/admin/users` の初回のみ 404 だったが、これは**デプロイ直後の
  伝播中**によるもので、2回目以降は 200（ビルド出力にも存在）。回帰ではない
- Edge middleware の `?code=` → `/auth/callback` 転送、`next` パラメータ保持、静的アセット素通し
  をすべて確認
- **§2.6 の懸念は本番で解消。** `/auth/callback` が
  `https://academy.nexmax.workers.dev/login?...` と**公開ホスト＋https**で解決した。
  `x-forwarded-host` 分岐は使われず、`request.url` 由来のフォールバックが正しく動いている
- ブラウザ実機で `/`・`/nekumax` の描画・画像・ルビ合成を確認。console エラー 0
  - 注意: 画像は `loading="lazy"` なので、読み込み途中に `naturalWidth` を測ると
    「壊れている」ように見える。判定は curl か十分待ってから行うこと
- mokumoku（同一アカウントの別 Worker）は subdomain 変更後も
  `https://mokumoku.nexmax.workers.dev` で 200。再デプロイ不要だった

### Phase C — Tunnel + Access（AI指示出しを本番から使う）→ **保留（ドメインなしでは成立しない）**

**決定（2026-08-03）: ドメインは購入しない。`nextmake.co.jp` も使わない。無料運用が必須。**
本番URLは `https://academy.nexmax.workers.dev` のまま確定。

この決定により Phase C は現状の設計では実施できない。理由:

- 固定ホスト名の Tunnel は、生成される `<UUID>.cfargotunnel.com` へ**自分のゾーンから
  CNAME を張る**構成が前提。ゾーンにはドメインが要る
- ドメイン不要の Quick Tunnel（TryCloudflare）は `*.trycloudflare.com` の
  **ランダムな使い捨てURL**で、固定できず **Access で保護できない**
- Cloudflare のドキュメント自身が「固定ホスト名や厳格なアクセス制御が要るなら
  Access で保護した named tunnel を使え」と書いている
- 保護なしで公開URLに晒すのは不可。ブリッジの先はユーザー個人の Codex サブスク認証
  （`~/.codex/auth.json`）であり、Access で2メールに絞るのがそもそもの前提だった（§5）

**当面の運用**: `/admin/ai` はローカルで使う（`npm run dev` + `npm run codex:bridge`、
接続先は既定の `ws://127.0.0.1:8790/codex`）。ブリッジも画面も実装済み・実機検証済みなので
機能自体は今も使える。**本番から使えないだけ。**

なお本番（https）のページから `ws://127.0.0.1:8790` へ繋ぐのは mixed content の扱いが
ブラウザ依存なので、当てにしないこと。

再開する条件: ドメインを1つ用意する（無料枠で足りるのは Workers・Tunnel・Access であって、
ドメイン登録料だけは別）。用意できたら以下をそのまま実施する。

8. `cloudflared` インストール → Tunnel 作成 → `codex.<ドメイン>` を `http://127.0.0.1:8790` に向ける
9. Zero Trust Access でアプリを作成し、**Google 認証＋管理者2メール**（`supabase/migrations/20260725090000_profiles.sql:46` と同じ2つ）だけ許可
10. `/admin/ai` の接続先に `wss://codex.<ドメイン>/codex` を入れて実機確認
11. `docs/deploy.md` を Cloudflare 前提に書き換え（Vercel の節は「旧」として残す）

### 決めごと → **決着済み（2026-08-03）**

- Cloudflare アカウント: `tomy1031@gmail.com`（アカウントIDは `npx wrangler whoami` で確認）
- **ドメインは購入しない。`nextmake.co.jp` も使わない。無料運用が必須。**
- 本番URLは **`https://academy.nexmax.workers.dev`** で確定
  - workers.dev のURLは `<Worker名>.<アカウントsubdomain>.workers.dev` という構造で、
    `workers.dev` もアカウント subdomain の階層も**外せない**。短縮には独自ドメインが要る
  - アカウント subdomain は既定の `mokumoku-db`（別アプリ由来）から `nextmake` に変更済み
  - 検討して見送った案: `nexmax.academy` / `nexmax.jp` / `nexmax.app` / `nexmax.school` /
    `nexmaxacademy.com` はいずれも取得可能だったが、年額費用が発生するため見送り
    （`nexmax.com` は2014年から登録済みで取得不可）
  - `academy.nexmax` のような形は**そもそも成立しない**。`.nexmax` は TLD ではないため
  - `nextmake.co.jp`（Xserver 運用中）を使うにはゾーンごと Cloudflare へ移す必要がある。
    サブドメインだけ切り出す Subdomain setup は **Enterprise 限定**
- **その帰結として Phase C は保留**（上記 Phase C の節を見る）

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
