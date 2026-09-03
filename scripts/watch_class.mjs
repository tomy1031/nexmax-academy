#!/usr/bin/env node
/**
 * watch_class — 授業の あいだ、本番の Worker を 見張る。
 *
 * 何を 見るか（合格の 線は docs/授業前チェック.md）:
 *   - `outcome` が ok 以外（**`exceededCpu` が 1件でも 出たら 赤**）
 *   - 例外（Error 1102 は ここに 出る）
 *   - 5xx
 *   - CPU 時間の 中央値・p95・最大（無料枠の 上限は 1リクエスト 10ms）
 *
 * **数字だけを 見ない。** 665ms が ok で 通った ことが あり、それを 根拠に
 *「上限は CPU では ない」と 誤った 結論を 出した（docs/deploy.md §0.12→§0.13）。
 * 無料枠は バーストを 見逃すので、**`outcome` と `exceptions` が 正**である。
 *
 * 使いかた:
 *   node scripts/watch_class.mjs                 … 本番を 見る（Ctrl+C で まとめ）
 *   node scripts/watch_class.mjs --every 60      … 60秒ごとに 途中経過
 *
 * プレビュー版（STG）は tail できない（Cloudflare の 制限）。STG は
 * `scripts/load_class.mjs` で 混みぐあいを 作って 測る。
 */

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const idx = args.indexOf("--every");
const EVERY = Number(idx >= 0 && args[idx + 1] ? args[idx + 1] : 60) * 1000;

const stats = {
  total: 0,
  ok: 0,
  exceededCpu: 0,
  otherOutcome: new Map(),
  exceptions: 0,
  http5xx: 0,
  cpu: [],
  samples: [],
};

function note(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  if (!event || typeof event !== "object") return;
  stats.total += 1;

  const outcome = event.outcome ?? "(なし)";
  if (outcome === "ok") stats.ok += 1;
  else if (outcome === "exceededCpu") stats.exceededCpu += 1;
  else stats.otherOutcome.set(outcome, (stats.otherOutcome.get(outcome) ?? 0) + 1);

  if (Array.isArray(event.exceptions) && event.exceptions.length > 0) {
    stats.exceptions += event.exceptions.length;
    for (const e of event.exceptions.slice(0, 2)) {
      stats.samples.push(
        `例外 ${e.name ?? ""} ${e.message ?? ""} ${event.event?.request?.url ?? ""}`,
      );
    }
  }
  const status = event.event?.response?.status;
  if (typeof status === "number" && status >= 500) {
    stats.http5xx += 1;
    stats.samples.push(`HTTP ${status} ${event.event?.request?.url ?? ""}`);
  }
  if (typeof event.cpuTime === "number") stats.cpu.push(event.cpuTime);
  if (outcome !== "ok") {
    stats.samples.push(
      `outcome=${outcome} cpu=${event.cpuTime}ms ${event.event?.request?.url ?? ""}`,
    );
  }
}

function pct(values, q) {
  if (values.length === 0) return "-";
  const sorted = [...values].sort((a, b) => a - b);
  return `${sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]}ms`;
}

function report(final) {
  const bad = stats.exceededCpu + stats.exceptions + stats.http5xx;
  console.log(
    [
      final ? "── まとめ ──" : "── 途中経過 ──",
      `リクエスト ${stats.total}（ok ${stats.ok}）`,
      `exceededCpu ${stats.exceededCpu} / 例外 ${stats.exceptions} / 5xx ${stats.http5xx}`,
      `CPU 中央 ${pct(stats.cpu, 0.5)} / p95 ${pct(stats.cpu, 0.95)} / 最大 ${pct(stats.cpu, 1)}`,
      bad === 0 ? "✓ ここまで 異常なし" : `✗ 異常 ${bad} 件`,
    ].join("\n  "),
  );
  for (const line of stats.samples.slice(-5)) console.log(`  ・${line}`);
  stats.samples.length = 0;
}

const tail = spawn("npx", ["--yes", "wrangler", "tail", "academy", "--format", "json"], {
  stdio: ["ignore", "pipe", "inherit"],
});

let buffer = "";
tail.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) if (line.trim()) note(line);
});

const timer = setInterval(() => report(false), EVERY);

function finish() {
  clearInterval(timer);
  report(true);
  const bad = stats.exceededCpu + stats.exceptions + stats.http5xx;
  tail.kill();
  process.exit(bad === 0 ? 0 : 1);
}
process.on("SIGINT", finish);
tail.on("exit", finish);
