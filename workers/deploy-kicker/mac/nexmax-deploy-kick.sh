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
# いまが 授業前の 窓かだけを 見る:   nexmax-deploy-kick.sh --check-window（窓の 中なら 0）
#
# **時刻は UTC で ここが 決める。** launchd は 地域の 時刻で 動くが、2026-10 の この Mac では
# 16:10 の つもりが 14:10 ICT に 動いて いた（2時間 早い。JST の 時刻で 数えて いた とみられる）。
# 10-16 は その 14:10〜15:02 には まだ 新しい 教材が 無く「同じ」で 止まり、
# 教材が 入った 16時台には 起きなかった。だから plist は「毎時 02・10・52分」に 起こすだけにして、
# 授業前の 窓に 入って いるかは 下の in_window が UTC で 見る（Mac の 地域が どこでも 同じ）。

set -eu

# 授業前の 窓: 火・水・金 09:05〜10:10 UTC（16:05〜17:10 ICT）。授業は 17:30 ICT。
# Cloudflare 側（wrangler.jsonc）の 09:10 / 09:52 / 10:02 UTC が この 中に 入る。
in_window() {
  # shellcheck disable=SC2046
  set -- $(date -u '+%u %H %M') # 曜日（1＝月 … 7＝日）・時・分
  case "$1" in 2 | 3 | 5) ;; *) return 1 ;; esac
  now=$((${2#0} * 60 + ${3#0}))
  [ "$now" -ge $((9 * 60 + 5)) ] && [ "$now" -le $((10 * 60 + 10)) ]
}

if [ "${1:-}" = "--check-window" ]; then
  in_window
  exit $?
fi

# 窓の 外では 何も しない（毎時 起きるので、記録も 残さない）。--dry-run は 窓の 外でも 判定を 見せる。
if [ "${1:-}" != "--dry-run" ] && ! in_window; then
  exit 0
fi

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
  if in_window; then win="授業前の 窓の 中"; else win="授業前の 窓の 外（定刻なら 何も しない）"; fi
  log "dry-run 起こす ところでした 本番=${prod_sha:-取得できず} → integration=$integ_sha（$win）"
  echo "dry-run: 本番=${prod_sha:-取得できず} / integration=$integ_sha → 叩けば 出ます（いまは $win）"
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
