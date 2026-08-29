/**
 * 授業前の cron が起きたとき、本番へ 出す 必要が あるかを 決める。
 *
 *   DEPLOY_SHA=<出すコミット> node scripts/check_should_deploy.mjs
 *
 * `$GITHUB_OUTPUT` へ `needed=true|false` を書く（deploy.yml の後続ステップが読む）。
 * 判断の規則は `scripts/lib/should_deploy.mjs`（単体テストあり）。
 *
 * **cron を 5本に した 理由と、それでも 出すのを 1回に する 理由**は
 * docs/deploy.md §0.11。要点だけ:
 *   - GitHub の cron は 遅れる・落ちる（2026-08-28 に 11時間5分 遅れて 授業に 遅刻）
 *   - なので 何回か 起こす
 *   - でも 本番デプロイは KV を 約75件 使う（枠 1000件/日）ので 出すのは 必要な ときだけ
 *
 * **止めない**（常に終了コード 0）。ここで 赤くすると、出す必要が 無い日の ランが
 * 毎回 赤くなって「いつもの赤」に なり、本当の 赤が 埋もれる。
 */
import fs from "node:fs";
import { shouldDeploy } from "./lib/should_deploy.mjs";

const PROD_URL = process.env.PROD_URL ?? "https://academy.nexmax.workers.dev";
const deploySha = process.env.DEPLOY_SHA ?? "";
const quietMinutes = Number(process.env.QUIET_MINUTES ?? 30);

if (!deploySha) {
  console.error("✗ DEPLOY_SHA が 空です。出す側に 倒します。");
}

/** 本番に 聞く。読めなければ null（＝出す側へ 倒す）。 */
async function readLive() {
  try {
    const response = await fetch(`${PROD_URL}/api/version`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.error(`本番が ${response.status} を 返しました（${PROD_URL}/api/version）`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`本番の /api/version を 読めませんでした: ${String(error)}`);
    return null;
  }
}

const live = await readLive();
const { needed, reason } = shouldDeploy({
  live,
  deploySha,
  nowMs: Date.now(),
  quietMinutes,
});

console.log(`本番     = ${live?.sha ?? "読めず"}（${live?.builtAt ?? "-"}）`);
console.log(`これから = ${deploySha || "不明"}`);
console.log(`→ ${reason}`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `needed=${needed}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### 本番へ 出すか\n\n- 本番: \`${live?.sha ?? "読めず"}\`\n- これから: \`${deploySha || "不明"}\`\n- **${needed ? "出します" : "出しません"}** — ${reason}\n`,
  );
}
