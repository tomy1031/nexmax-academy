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

### 未確認（使う前に実機で1回通すこと）

- 組み込み `image_gen` が ChatGPT ログインのみで動くのか、APIキーでも動くのか
  （同梱 SKILL.md と issue #24465 で記述が食い違う）
- `turn/start` で image_gen を確定的に呼ばせる方法（tool_choice 相当があるか）
- 画像生成の課金経路とレート上限
- `image_gen` が使えないという不具合報告が複数ある（#19133 / #28102 / #28464）

## 2. いま使える形（ローカル）

```bash
npm run codex:bridge
```

これが `codex app-server` も一緒に起動し、`ws://127.0.0.1:8790/codex` を開く。
ブラウザから `codex app-server` へ直接つなげないのは、loopback 以外の Origin を
拒否するためで、この中継がハンドシェイクだけ肩代わりしている
（`scripts/codex_bridge.mjs`）。前提として `codex` CLI が入っていること
（`npm i -g @openai/codex`）。

管理画面「AI設定」の下半分がこの接続先を持つ。**先生のブラウザと同じマシンで
ブリッジが動いているときだけ**つながる。

## 3. 公開中のアプリから使う形（Cloudflare・無料）

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
| Containers | **無料枠なし**（Workers Paid が要る） |

**画像生成が 125 秒を超えうるなら、同期で待たせる作りにしてはいけない。**
Worker が即ジョブIDを返し、ブリッジ側で作り、画面はポーリングする形にする。

## 4. 常駐させたくなったら

| 順位 | 置き場 | 月額 | 注意 |
| --- | --- | --- | --- |
| 1 | Oracle Cloud Always Free（Ampere A1 2 OCPU / 12GB） | ¥0 | カード必須。A1 は在庫切れで取れないことがある。**7日間ほぼ無負荷だと回収対象**になるので、生成デーモンは keep-alive が要る |
| 2 | Fly.io（shared-cpu-1x 256MB 常時） | 約 $2/月 | 新規の無料枠は無い。`min_machines_running=1` で常駐 |
| 3 | Google Cloud Run（min-instances=1） | 約 $4.5/月 | request-based 課金なら無料枠が効く |

Render Free は15分でスピンダウンするので常駐に使えない。

## 5. いま実装してあるところ／していないところ

- **してある**: ローカルのブリッジへブラウザから直接つなぐ経路（`/admin/ai`）と、
  接続先の設定・状態表示
- **していない**: Tunnel 越しの経路（Worker からのサーバ側 fetch と Access ヘッダ）、
  非同期ジョブ化。ドメインを Cloudflare に載せてトンネルを立てるところまでは
  手作業が要るので、その手順を踏んだあとに配線する
