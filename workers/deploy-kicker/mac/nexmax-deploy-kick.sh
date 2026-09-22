#!/bin/sh
# nexmax-deploy-kick — この Mac から 授業前の 本番デプロイを 起こす（保険）。
#
# 本命は Cloudflare の Cron Trigger（workers/deploy-kicker）。こちらは **この Mac が
# 起きて いる ときだけ** 効く 二段目で、鍵を 1つも 増やさずに 今日から 動かせる
# （`gh` は すでに ログイン済み）。両方 起きても 二重には 出ない——出すか どうかは
# ワークフロー側の `scripts/lib/should_deploy.mjs` が 本番の /api/version を 見て
# 決めるので、中身が 同じ／前の ビルドから 30分 未満 なら 空振りに なる。
#
# 入れかた・外しかたは ../README.md。
# 動いたかは `tail ~/Library/Logs/nexmax-deploy-kick.log`。
#
# 確かめるだけ（叩かない）: nexmax-deploy-kick.sh --dry-run

set -eu

REPO="tomy1031/nexmax-academy"
WORKFLOW="deploy.yml"
PROD_URL="https://academy.nexmax.workers.dev"
LOG="$HOME/Library/Logs/nexmax-deploy-kick.log"

# launchd の PATH は ほぼ空。実体を 名指しする。
GH="/opt/homebrew/bin/gh"
[ -x "$GH" ] || GH="$(command -v gh 2>/dev/null || echo /usr/local/bin/gh)"

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >>"$LOG"; }

if [ ! -x "$GH" ]; then
  log "NG gh が 見つかりません（$GH）"
  exit 1
fi

# いまの 本番と integration を 見る。同じなら 起こさない（GitHub を 無駄に 叩かない）。
prod_sha="$(curl -sf --max-time 20 "$PROD_URL/api/version" | sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' || true)"
integ_sha="$("$GH" api "repos/$REPO/commits/integration" --jq .sha 2>/dev/null || true)"

if [ -z "$integ_sha" ]; then
  log "NG integration の SHA が 取れません（gh の ログイン切れ？ \`gh auth status\` を 見る）"
  exit 1
fi

if [ -n "$prod_sha" ] && [ "$prod_sha" = "$integ_sha" ]; then
  log "skip 本番は すでに integration と 同じ（$(printf '%s' "$integ_sha" | cut -c1-7)）"
  exit 0
fi

if [ "$DRY" = "1" ]; then
  log "dry-run 起こす ところでした 本番=${prod_sha:-取得できず} → integration=$integ_sha"
  echo "dry-run: 本番=${prod_sha:-取得できず} / integration=$integ_sha → 叩けば 出ます"
  exit 0
fi

# ref=main は cron と 同じ（schedule は 既定ブランチで 始まる）。
# target=auto が「cron と 同じ 道」＝ integration を 取り込む → 検査 →
# main を 早送り → 本番へ 出す、を 通す。
if "$GH" workflow run "$WORKFLOW" --repo "$REPO" --ref main -f target=auto >>"$LOG" 2>&1; then
  log "ok 起こしました 本番=${prod_sha:-取得できず} → integration=$integ_sha"
else
  log "NG workflow_dispatch に 失敗（上の 行を 見る）"
  exit 1
fi
