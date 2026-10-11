# watch — 本番の 見張り（外形監視・2026-10-11）

## なぜ 要るか

本番の 異常を 知らせる 仕組みが **1つも 無かった**。Error 1102・ログインの 失敗・
Worker の 失敗・画面の エラーは、学習者や 先生の 申告で はじめて 分かって いた。
`src/app/global-error.tsx` は どの エラーでも「アプリが 新しく なったときに 出ます」と
出して 読み直すだけで、どこにも 送って いなかった。

## 仕組み

```
  学習者の ブラウザ ── 画面が 落ちた ──→ events 表（Supabase）に 要約を 1行
  （global-error）                         ※ 端末ごとに 間引き・DB で 全体の ふた

  Cloudflare Cron ──→ この Worker ──┬─ GET /                     （タイトル・作りおき）
  10分ごと／授業は 5分ごと          ├─ GET /map                  （門番。ログインなし＝307 が 正常）
                                    ├─ GET /api/health/content   （Next の サーバ＋DB＋教材の 警告）
                                    └─ client_error_counts()     （画面の エラーの 件数だけ）
                                              │
                                   続いて いれば ─→ Slack ／ メール
```

| 見る もの         | 異常と みなす とき                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------- |
| 3つの ページ      | 5xx・1102・1101・つながらない。**その 回で 2回 失敗** か **前の 回に 続いて 失敗**          |
| 教材の 健康しらべ | `warnings` が 空で ない 状態が **2回 続いた**                                               |
| 画面の エラー     | 15分で **3件 以上**（同じ エラーは 端末ごとに 30分に 1回。3人 か、1人が ちがう 画面で 3回） |
| DB（Supabase）    | 件数を 読みに 行って **2回 続けて** 届かない                                                |

**知らせは 少なく。** 新しい 異常で 1通・続いて いれば 2時間ごとに 1通（夜 22〜7時 ICT は 念押し しない）・
**1時間 正常が 続いたら**「直りました」1通。1回 通った だけで 閉じると、時々だけ 落ちる 異常
（3割だけ 1102 など）で「異常あり」と「直りました」が 交互に 届く（30分では 1日 8回 行き来した。
`tests/watch_worker.test.ts` の 1日ぶんの 試し）。
最初の 1回だけ「見張りを はじめました」が 届く（知らせ先の 試しを 兼ねる）。
知らせが 届かなかった ときは、次の 回に もう一度 送る。
**測れなかった 回**（健康しらべ・DB が 落ちた）は、前の 回の 異常を そのまま 残す（うその「直りました」を 出さない）。

**画面の エラーの 道は だれでも 書ける**（公開の anon 鍵で 入る）。DB で 形を 絞り
（/ で 始まる・空白なし・種類は 2つ）、知らせの 文では 安全な 文字だけに して、Slack へは
`& < >` を 消して 送る（`<!channel>` や 偽の リンクを 効かせない）。公開の 鍵で ある 以上、
わざと 3件 入れて 鳴らす・30件 入れて ふたを 埋める ことは 防げない——知らせの 文に
「たしかめる」URL を 付けて あるので、本物かは そこで 見る。

## 無料枠と 本番の 枠を 守る 決まり

- **KV に 書かない。** 本番の KV は 書き込み 1000件/日 の 枠を デプロイと 作りおきが 使う
  （docs/deploy.md §0.9）。状態は **Durable Object（SQLite）に 1件**だけ（無料枠 1日 10万行・別枠）。
- **見に 行く ページは 作り直しを 起こさない ものだけ。** `/` は 作りおき（force-static）、
  `/map` は 門番が 転送するだけ、`/api/health/content` は 作りおき しない API。
  ISR の ページを 叩くと、そのたび 作り直し → KV 書き込み に なる。**足す ときは ここを 守る。**
- **Cron Trigger は アカウント全体で 5本まで。** deploy-kicker が 3本、ここが 2本で ちょうど 5本。
  増やすなら 先に 数える（`tests/watch_worker.test.ts` が 見張って いる）。
- 曜日は **名前で** 書く（`TUE,WED,FRI`）。Cloudflare の 資料では 数字は 1＝日曜。
- アプリ本体の 大きさ（gzip 3MiB）には 響かない（別の Worker。これ自体は gzip 約 6 KiB）。
- **秘密は `wrangler secret put` だけ**。ビルド環境・リポジトリには 置かない（docs/deploy.md 罠1）。

## 出しかた

**出す 前に 1つ 確かめる。** 教材の 健康しらべは 2026-10-11 時点で クエストを 数えず
「404 に なる」と 誤って 警告して いる（PR #598 で 直し中）。それが 本番に 出る 前に
見張りを 動かすと、**10分後に 誤報が 鳴る**。先に こう 確かめる:

```bash
curl -s https://academy.nexmax.workers.dev/api/health/content | python3 -c "import sys,json;print(json.load(sys.stdin)['warnings'])"
```

`[]` なら 出して よい。

### 1. 知らせ先の 鍵を 作る（どちらか 一方）

- **Slack**: Slack の アプリ設定 → Incoming Webhooks → 知らせたい チャンネルを えらんで URL を 作る
- **メール**: [Resend](https://resend.com) に 登録 → API Keys で 作る（無料枠 1日100通。
  送り元は `onboarding@resend.dev` の まま で、**Resend に 登録した 自分の アドレスにだけ** 届く）

### 2. Worker を 出して、鍵を 入れる

```bash
npx wrangler deploy -c workers/watch/wrangler.jsonc
```

Slack の とき:

```bash
npx wrangler secret put SLACK_WEBHOOK_URL -c workers/watch/wrangler.jsonc
```

メールの とき（宛先は カンマ区切りで 何人でも）:

```bash
npx wrangler secret put RESEND_API_KEY -c workers/watch/wrangler.jsonc
```

```bash
npx wrangler secret put ALERT_EMAIL_TO -c workers/watch/wrangler.jsonc
```

画面の エラーの 件数も 見る とき（アプリと 同じ **公開の** 値。無くても ページは 見る）:

```bash
npx wrangler secret put SUPABASE_URL -c workers/watch/wrangler.jsonc
```

```bash
npx wrangler secret put SUPABASE_ANON_KEY -c workers/watch/wrangler.jsonc
```

### 3. 動いて いるかを 見る（読むだけ・鍵は 出ない）

```bash
curl -s https://academy-watch.nexmax.workers.dev | python3 -m json.tool
```

`startedAt` が 入って いれば 1回 走った。`notifyTo` が `true` の 先に「見張りを はじめました」が
届いて いる はず。`open` が 空なら 正常。

## 画面の エラーの 中身を 見る

見張りが 読むのは **件数だけ**。中身（メッセージ・ページ・ログインの 有無）は 管理者だけが 読める。
AI に 頼むなら Supabase コネクタで:

```sql
select at, object as page, result->>'kind' as kind, result->>'message' as message,
       result->>'logged_in' as logged_in, result->>'build' as build
from public.events where verb = 'client_error' order by at desc limit 50;
```

送って いる もの・送って いない ものは `src/lib/error-report.ts` の 冒頭。
**だれの エラーかは 残して いない**（user_id は 空・メールや id は 伏せ字）。14日で 消える。

## 手もとで 確かめる

```bash
npx vitest run tests/watch_worker.test.ts tests/error_report.test.ts
```

判定（続いたか・鳴らすか・直ったか）は `src/watch.js` に まとめて あり、Cloudflare に 依らずに 試せる。
