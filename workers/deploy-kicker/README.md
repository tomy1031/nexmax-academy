# deploy-kicker — 授業前の 本番デプロイを 時間通りに 起こす

## なぜ 要るか

**GitHub の `schedule`（cron）は この リポジトリでは 毎回 3〜5時間 遅れて 届く。**
2026-09-01〜09-18 の schedule ラン 46本を 測った 結果:

| イベント   | ラン作成までの 時間                                       |
| ---------- | --------------------------------------------------------- |
| `push`     | **3秒**（直近20本 すべて）                                |
| `schedule` | **3時間15分〜4時間43分**（中央値 3時間45分・最大 11時間） |

授業は 火・水・金 **17:30 ICT**。cron は 16:12〜17:12 ICT に 5本 置いて あるのに、
実際に ランが 作られるのは **20:30〜21:55 ICT**——毎回 授業の 3時間あと だった。
だから 9/15・9/16・9/18 は いずれも 人が 手で 出して いた（17:21 / 17:23 / 16:53 ICT）。

**時差では ない。** `12 9 UTC` = `16:12 ICT` は 正しい。遅れ幅が 日ごとに 88分 ぶれるので
固定の ずれでも なく、時刻を 早めても 直らない（早すぎる 日が 出るだけで、直前に
入れた 教材が 載らなくなる）。

**cron を 5本に 増やした 対策（2026-08-29・docs/deploy.md §0.11）は 効かなかった。**
5本 とも 同じだけ 遅れて いた——別々の 待ち行列では なく、**同じ 1つの 遅れ**を
見て いただけ だった。

**詰まって いるのは Actions では なく `schedule` の 配達だけ**（`push` は 3秒）。
だから **時計を GitHub の 外へ 出す**。外の 時計が `workflow_dispatch` を 叩けば、
イベントは 3秒で 届く。

## 仕組み

```
  Cloudflare Cron Trigger ─┐
                           ├─→ workflow_dispatch (target: auto) ─→ デプロイ
  この Mac の launchd    ─┘        （3秒で 届く）                  ├ integration を 取り込む
                                                                   ├ 単体テスト・DB の 確認
  GitHub の cron（保険）  ─────→ schedule（3〜5時間 遅れ）────────→ ├ main を 早送り
                                                                   └ 本番へ 出す
```

`target: auto` は **cron と まったく 同じ 道**（`.github/workflows/deploy.yml` の
`env.AUTO`）。起こし役が 3つに 増えただけで、出す 手順は 1本の まま。

**3つ とも 起きても 二重には 出ない。** 出すか どうかは ワークフロー側の
[`scripts/lib/should_deploy.mjs`](../../scripts/lib/should_deploy.mjs) が 本番の
`/api/version` を 見て 決める。中身が 同じ／前の ビルドから 30分 未満 なら 空振りで、
**KV を 1件も 使わない**（1回の 本番デプロイ ＝ 約75件 / 枠 1000件/日）。

## 時刻（授業は 17:30 ICT）

| 起こし役       | 時刻（ICT）              | 書きかた                                    |
| -------------- | ------------------------ | ------------------------------------------- |
| Cloudflare     | 16:10 / 16:52 / 17:02    | `wrangler.jsonc` の `triggers.crons`（UTC） |
| この Mac       | 16:10 / 16:52 / 17:02    | `mac/…plist`（Mac が ICT なので そのまま）  |
| GitHub（保険） | 16:12 / 16:26 / …/ 17:12 | `deploy.yml` の `schedule`（UTC・遅れる）   |

16:10 に 出れば 16:22 ごろ 本番に 載る（ビルド 6〜10分）。16:52 は それ以降に 入った
教材を 拾う ための 2回目（30分の 間隔は `should_deploy` の 条件に 合わせて ある）。

## 1. Cloudflare 側（本命・この Mac に 依らない）

鍵を 1つ 作る 必要が ある。

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
   - Repository access: **Only select repositories** → `nexmax-academy` だけ
   - Permissions → Repository permissions → **Actions: Read and write**（これだけ）
   - Expiration は 最長で。**切れると 黙って 起こらなく なる**ので、期限を カレンダーに 入れる
2. Worker を 出して、鍵を 入れる:

```bash
npx wrangler deploy -c workers/deploy-kicker/wrangler.jsonc
npx wrangler secret put GITHUB_TOKEN -c workers/deploy-kicker/wrangler.jsonc
```

3. 動いて いるかを 見る（鍵は 出ない・ここから デプロイは 起きない）:

```bash
curl -s https://academy-deploy-kicker.nexmax.workers.dev | python3 -m json.tool
```

`{"same": true}` なら 本番と integration が そろって いる。

## 2. この Mac 側（保険・鍵ゼロ）

`gh` が すでに ログイン済み なので 鍵は 要らない。**この Mac が 起きて いる ときだけ** 効く。

```bash
mkdir -p ~/.local/bin ~/Library/LaunchAgents
cp workers/deploy-kicker/mac/nexmax-deploy-kick.sh ~/.local/bin/
chmod +x ~/.local/bin/nexmax-deploy-kick.sh
sed -e "s|REPLACE_WITH_ABSOLUTE_PATH|$HOME/.local/bin|" -e "s|REPLACE_WITH_HOME|$HOME|" \
  workers/deploy-kicker/mac/dev.nexmax.academy.deploy-kick.plist \
  > ~/Library/LaunchAgents/dev.nexmax.academy.deploy-kick.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/dev.nexmax.academy.deploy-kick.plist
```

確かめる:

```bash
~/.local/bin/nexmax-deploy-kick.sh --dry-run   # 叩かずに 判定だけ
tail ~/Library/Logs/nexmax-deploy-kick.log     # 起きた 記録
```

外す:

```bash
launchctl bootout "gui/$(id -u)/dev.nexmax.academy.deploy-kick"
rm ~/Library/LaunchAgents/dev.nexmax.academy.deploy-kick.plist
```

## 落ちて いないかの 見かた

- `npm run handoff` … 本番と main の 差が 出る
- 上の Worker の URL … `same: false` が 授業前に 続いて いたら 起こし役が 全部 黙って いる
- `tail ~/Library/Logs/nexmax-deploy-kick.log` … Mac 側が 何を したか

**GitHub の cron は 消して いない。** 外の 時計が 2つ とも 黙った ときの
最後の 受け皿として 残す（遅れて 届いても、すでに 出て いれば 空振りに なる）。
