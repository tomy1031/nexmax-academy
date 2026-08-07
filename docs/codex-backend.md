# Codex を つなぐ（生成バックエンド）

先生の管理画面から Codex（`codex app-server`）を使って、文章と画像を作るための構成。
2026-08-06 の調査でわかったことをもとにしている。数値には出典を付けた。

## 0. まず判断すること

**Codex を使う必然性が無いなら、常駐バックエンドは丸ごと要らない。**

いま画像も文章も Gemini API で作れており、Worker から直接 `fetch()` できる。
Tunnel も VM も Access も要らず、規律4（サーバプロキシ経由・キーはクライアントに出さない）
だけ守れば済む。すでにそう作ってある:

| 機能 | いまの経路 |
| --- | --- |
| エリアの絵・キャラクターシート・まんがのコマ | `/api/studio/image` → Gemini |
| まんがのコマ割りとセリフ | `/api/studio/manga` → Gemini |
| ことばの抜き出し | `/api/studio/vocab` → Gemini |
| リスニングの音声 | ブラウザ → Gemini Live（サーバは短命トークンだけ） |

Codex を選ぶ理由は実質つぎの2つ。どちらも当てはまらないなら、この文書の先は要らない。

1. ChatGPT のサブスク枠内で画像生成したい（Codex の組み込み `image_gen` / `gpt-image-2`）
2. 手元の `reference.png` と既存の Codex スキル資産をそのまま使いたい

## 1. Codex App Server でできること（実機確認ずみ・codex-cli 0.145.0）

- `codex app-server` は実在する。help 上は `[experimental]`
- プロトコルは JSON-RPC 2.0（電文では `"jsonrpc":"2.0"` を省略）。改行区切りJSON
- **HTTP では叩けない。** `--listen ws://IP:PORT` の WebSocket が要る
  （GET は `/healthz` `/readyz` だけ 200、それ以外は 400、Origin 付きは 403）
- 既定は loopback のみに bind する。外から使うには SSH ポートフォワードか中継が要る
- **画像生成はプロトコルに正式に入っている。** `ImageGenerationThreadItem`
  （`savedPath` に絶対パスが返る）。実体は組み込み `image_gen`、既定モデル `gpt-image-2`
- 参照画像も正式サポート（`{"type":"localImage","path":...}`）
- 認証は2層。①アカウント（`codex login`）②非ループバックWS用（`--ws-auth` ほか）

### 実機で確認できたこと（2026-08-06・codex-cli 0.145.0 / ChatGPT ログイン）

- **組み込み `image_gen` は ChatGPT ログインだけで動く。** Gemini や OpenAI の APIキーは要らなかった。
  （同梱 SKILL.md と issue #24465 で記述が食い違っていた点。ChatGPT 側で動く、が答え）
- `codex exec -i <参照画像> -s workspace-write` に「保存先パス」を書いた指示を渡せば、
  そのパスへ保存して終わる。1セッションで複数枚もまとめて撮れる
- **参照画像は複数枚渡せる**（`-i` を並べる）。設定画2枚＋直前のコマ、で服と部屋がそろった
- 出力は PNG。寸法は指定どおりに出ないことがある（1024 指定で 1254 が返った）。
  中身は変えずに `sips -z` でそろえる。**寸法違いを理由に作り直させない**
- 実績: ネクマックス6体・登場人物シート2枚・まんが4コマ = 計12枚を作り直しゼロで生成

### まだ未確認

- `turn/start` で image_gen を確定的に呼ばせる方法（tool_choice 相当があるか）。
  いまは日本語の指示文で頼んでいるだけなので、モデルが気を変えると撮らない可能性がある
- 画像生成のレート上限（1日あたり何枚まで撮れるか）
- `image_gen` が使えないという不具合報告が複数ある（#19133 / #28102 / #28464）

## 2. いま使える形 — **公開URLからでもつながる**（ドメインもトンネルも不要）

```bash
npm run codex:bridge
```

これが `codex app-server` も一緒に起動し、`ws://127.0.0.1:8790/codex` を開く。
ブラウザから `codex app-server` へ直接つなげないのは、loopback 以外の Origin を
拒否するためで、この中継がハンドシェイクだけ肩代わりしている
（`scripts/codex_bridge.mjs`）。前提として `codex` CLI が入っていること
（`npm i -g @openai/codex`）。

### いちばん大事な実測（2026-08-06）

**https のページからでも `ws://127.0.0.1` は開ける。**
`127.0.0.1` は「安全なオリジン（potentially trustworthy）」に数えられるので、
混在コンテンツの遮断にかからない。実際に
`https://…workers.dev` のページから接続し、`OPEN` になることを確かめた。

つまり **Cloudflare Tunnel も、Cloudflare に載せたドメインも、Access も要らない。**
先生は自分のPCで `npm run codex:bridge` を動かしておくだけで、公開中のURLから
自分の Codex（ChatGPT の枠）を使える。

### そのぶん、合言葉が必須になった

同じ理屈で、**先生が開いたどのサイトからでもこのブリッジは叩ける**。
その先にいるのはシェルを実行できる Codex である。だから:

- ブリッジは起動時に**合言葉**を作り、画面に出す（`~/.nexmax/codex-bridge-token`）
- WS も HTTP も、合言葉が合わなければ 401。上流には1バイトも通さない
- ファイルの受け渡しは**作業フォルダ1つの中だけ**。名前も
  `[a-z0-9_-]{1,64}.(png|jpg|jpeg|webp)` に限る（`tests/codex_bridge_paths.test.ts`）
- 先生は合言葉を「AI設定」に一度だけ貼る

オリジンの許可リストではなく合言葉を境界にしたのは、非ブラウザからは
オリジンを自由に名乗れるためである。

### 通しで確かめたこと（2026-08-06・公開URLのページから）

1. `GET /api/codex/hello` … 合言葉つきで 200、作業フォルダが返る
2. `PUT /api/codex/file` … サイト上のキャラクターシート（132KB）を置けた
3. `WS /codex` … 接続 → `thread/start`（`workspace-write`・cwd=作業フォルダ）
4. `turn/start` に `localImage` ＋ 指示 → `imageGeneration` が `completed`
5. `GET /api/codex/file` … **1536×1024 の PNG がブラウザに戻った**（設定画どおりの人物）

合言葉なしの接続が `REJECTED` になること、`../../etc/passwd` の類が `badName` に
なることも実際に確かめている。

管理画面「AI設定」でつなぎ、合言葉が入っていれば
**「エリアの絵」「とうじょう人物」「まんが」の絵づくりが Codex を先に使う**
（`src/components/studio/image-api.ts`）。届かなければ黙って Gemini に回る。

## 3. トンネルが要るのは「別のマシンに置きたい」ときだけ

§2 のとおり、**先生のブラウザと Codex が同じマシンなら、この節は要らない。**
ここが要るのは次のどちらかのときだけ:

- Codex を先生のPCではなく、常時動くサーバに置きたい（§4）
- 先生が複数いて、1台の Codex を共有したい



```
[先生のブラウザ] → [Workers / Next.js API Route]
                        │ fetch（CF-Access-Client-Id / -Secret ヘッダ）
                        ▼
                  [Cloudflare Tunnel + Access（Service Auth）]
                        ▼
                  [常駐マシンの codex_bridge] → [codex app-server]
```

- **Cloudflare Tunnel は Zero Trust Free に含まれる。** 上限は cloudflared トンネル
  1,000／アカウント、ルート 1,000／アカウント
  （<https://developers.cloudflare.com/cloudflare-one/account-limits/>）
- 公開ホスト名で出すには **Cloudflare にドメインを載せる必要がある**。
  ドメイン不要の Quick Tunnel（TryCloudflare）は同時200リクエスト上限・SSE非対応・
  SLA無しなので本番に使わない
- 「アプリのサーバからだけ叩ける」は **Access の Service Auth ポリシー＋Service Token**
  で実現する。**シートを消費しない**。Service tokens は 50／アカウントまで
- Worker 側は `CF-Access-Client-Id` / `CF-Access-Client-Secret` の2ヘッダを付けるだけ。
  Secret は **`wrangler secret`** に置く（`.env*` に置くと OpenNext がバンドルに焼く —
  AGENTS.md デプロイの罠1）

### 効いてくる上限（出典つき）

| 項目 | Free の値 |
| --- | --- |
| Worker CPU 時間 | 10 ms／呼び出し。**fetch の待ちは CPU に数えない** |
| **エッジの読み取りタイムアウト** | **125 秒 → 超えると 524**。Enterprise のみ変更可 |
| 外部 subrequest | 50／呼び出し |
| リクエスト数 | 100,000／日（超えると **Error 1027**） |
| Worker 本体のサイズ | 3 MB |
| 静的アセット | 20,000 ファイル／1ファイル 25 MiB |
| KV | 読み 100,000／日・**書き 1,000／日**・保存 1 GB |
| Workers AI | **10,000 Neurons／日**（§3.5） |
| Containers | **無料枠なし**（Workers Paid が要る） |

出典: <https://developers.cloudflare.com/workers/platform/limits/> /
<https://developers.cloudflare.com/workers/platform/pricing/>

**125 秒はトンネル経由のときに効く。** Cloudflare のドキュメントは Worker の
subrequest 自体に時間制限は無いとしている（クライアントがつながっている限り続けられる）。
524 は「Cloudflare がプロキシしているオリジンが 125 秒以内に返さなかった」ときの番号なので、
Worker → **トンネル** → 手元のブリッジ、という経路がこれに当たる。
ジョブ化が要るのはこの経路であって、Workers AI を直に呼ぶ経路ではない。

**画像生成が 125 秒を超えうるなら、同期で待たせる作りにしてはいけない。**
Worker が即ジョブIDを返し、ブリッジ側で作り、画面はポーリングする形にする。

## 3.5 常駐マシンを持たずに済ませる道 — Workers AI（Cloudflare 無料枠だけで完結）

**「Cloudflare の無料枠内でできるか」への答えは、ここがいちばん近い。**
Workers AI は Workers Free プランに含まれ、**1日 10,000 Neurons まで無料**
（<https://developers.cloudflare.com/workers-ai/platform/pricing/>）。
Worker から `env.AI` バインディングで呼ぶので、**常駐マシンもトンネルもドメインも
APIキーも要らない**。

決め手は **参照画像を受け取れるモデルがあること**。キャラクターの一貫性は
「設定画を毎回渡す」で作っているので、参照画像が渡せないモデルではこの用途に使えない。

| モデル | 参照画像 | 無料枠での目安 |
| --- | --- | --- |
| `@cf/black-forest-labs/flux-2-klein-4b` | **最大4枚**（`input_image_0`〜`_3`） | 1024×1024 1枚 ≒ 115 Neurons → **1日 80枚前後** |
| `@cf/black-forest-labs/flux-2-klein-9b` | 最大4枚 | 1枚 ≒ 1,700 Neurons → 1日 5〜6枚 |
| `@cf/black-forest-labs/flux-1-schnell` | **不可**（文字→画像のみ） | 安いが、この用途には使えない |

- 呼び出しは multipart/form-data。**参照画像は 512×512 未満でなければならない**
  （設定画 1536×1024 をそのまま渡せない。縮小が要る）
  <https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/>
- 4b の単価: 入力 5.37 Neurons／512×512タイル・出力 26.05 Neurons／512×512タイル。
  1024×1024 の出力＝4タイル＝104.2、参照2枚＝10.74、合わせて約115

**未検証（採用する前に必ず実機で1枚撮ること）**: 出てくる絵が `gpt-image-2` の水準に
届くか。とくに「日本のオフィスのアニメ調」「文字を描かせない」「コマ間で服が変わらない」
の3点。ここが落ちるなら無料枠であることに意味は無い。

## 4. 常駐させたくなったら

| 順位 | 置き場 | 月額 | 注意 |
| --- | --- | --- | --- |
| 1 | Oracle Cloud Always Free（Ampere A1 2 OCPU / 12GB） | ¥0 | カード必須。A1 は在庫切れで取れないことがある。**7日間ほぼ無負荷だと回収対象**になるので、生成デーモンは keep-alive が要る |
| 2 | Fly.io（shared-cpu-1x 256MB 常時） | 約 $2/月 | 新規の無料枠は無い。`min_machines_running=1` で常駐 |
| 3 | Google Cloud Run（min-instances=1） | 約 $4.5/月 | request-based 課金なら無料枠が効く |

Render Free は15分でスピンダウンするので常駐に使えない。

## 5. いま実装してあるところ／していないところ

- **してある**: 公開URLのページから手元のブリッジへ直接つなぐ経路（合言葉つき）。
  絵づくり（エリア・登場人物・まんが）の Codex 経由と、届かないときの Gemini への退避。
  Gemini 経由の画像・文章・音声（§0 の表）
- **していない**: Tunnel 越しの経路（別マシンに置きたくなったとき・§3）と非同期ジョブ化
- **していない**: 文章の生成（まんがのコマ割り・ことばの抜き出し）の Codex 経由。
  いまは Gemini のまま。絵ほど水準の差が出ないので後回しにした
- **していない**: Workers AI 経由（§3.5）。Codex のほうが絵は良いので、当面は不要

### 選ぶときの早見

| やりたいこと | いま使える？ | 要るもの |
| --- | --- | --- |
| 公開URLから絵を作る（ChatGPT の枠・`gpt-image-2`） | **使える** | `npm run codex:bridge` を**同じPC**で動かし、合言葉を貼る |
| 公開URLから絵を作る（Gemini） | **使える** | 先生の Gemini キー（BYOK・画面で登録） |
| 公開URLから文章を作る | **使える**（Gemini） | 同上 |
| 別マシンの Codex を共有する | 未実装 | Cloudflare に載せたドメイン＋トンネル＋Access（§3・§4） |
| キーもログインも無しで絵を作る | 未実装 | Workers AI の配線（§3.5）。品質は Codex に劣る |
