#!/usr/bin/env node
/**
 * 上げる 大きさの 見張り（無料枠 3MiB）
 *
 * ## なぜ 要るか
 * Cloudflare Workers の 無料枠は **gzip 3MiB**。超えると deploy が
 * `code:10027` で 止まる。2026-08-16、のこり 5KiB まで 来ていたことに
 * 誰も 気づけないまま デプロイが 止まった——**大きくなった日に 言ってくれる
 * 仕組みが どこにも 無かった**（気づけるのは 上限を またいだ 瞬間だけだった）。
 *
 * ## やること
 * `wrangler deploy --dry-run` は **資格情報なしで動く**（実測）。その出力の
 * `Total Upload: … / gzip: … KiB` を読んで、しきい値と くらべるだけ。
 *
 *   〜2867 KiB（2.8MiB）… 通す
 *   2867〜3072 KiB       … 警告（PRのログに 出す。まだ 落とさない）
 *   3072 KiB（3MiB）超え … 落とす
 *
 * 先に `.open-next/` を 作っておくこと（`npm run cf:build:local`）。
 *
 * 使い方: node scripts/check_worker_size.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** 無料枠の 上限（gzip・KiB）。 */
const LIMIT_KIB = 3 * 1024;
/** ここを 超えたら 警告（上限の 93%）。減らす 手が まだ 効くうちに 言う。 */
const WARN_KIB = 2867;

const worker = path.join(process.cwd(), ".open-next", "worker.js");
if (!fs.existsSync(worker)) {
  console.error(
    "✗ .open-next/worker.js が ありません。先に `npm run cf:build:local` を 実行してください。",
  );
  process.exit(1);
}

const run = spawnSync("npx", ["wrangler", "deploy", "--dry-run"], {
  encoding: "utf-8",
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;

if (run.status !== 0) {
  console.error(output);
  console.error("✗ wrangler の dry-run が 失敗しました（上の出力を 見てください）。");
  process.exit(1);
}

const matched = /Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/.exec(output);
if (!matched) {
  console.error(output);
  console.error("✗ 大きさの 行が 読めませんでした（wrangler の 出力の 形が 変わったかも）。");
  process.exit(1);
}

const rawKib = Number(matched[1]);
const gzipKib = Number(matched[2]);
const percent = ((gzipKib / LIMIT_KIB) * 100).toFixed(1);
const remaining = (LIMIT_KIB - gzipKib).toFixed(0);

const headline = `上げる 大きさ: gzip ${gzipKib.toFixed(0)} KiB / ${LIMIT_KIB} KiB（${percent}%・のこり ${remaining} KiB）`;
console.log(`\n${headline}`);
console.log(`（圧縮まえ ${rawKib.toFixed(0)} KiB）\n`);

/** GitHub の まとめ欄にも 残す（PR を 見た人が ログを 開かなくても 分かる）。 */
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const mark = gzipKib > LIMIT_KIB ? "🛑" : gzipKib > WARN_KIB ? "⚠️" : "✅";
  fs.appendFileSync(
    summaryFile,
    [
      `### ${mark} Worker の 大きさ`,
      "",
      `| gzip | 上限 | つかっている ぶん | のこり |`,
      `| ---- | ---- | ---------------- | ------ |`,
      `| ${gzipKib.toFixed(0)} KiB | ${LIMIT_KIB} KiB | ${percent}% | ${remaining} KiB |`,
      "",
    ].join("\n"),
  );
}

if (gzipKib > LIMIT_KIB) {
  console.log(
    `::error::${headline} — 無料枠の 上限を 超えています。このままでは デプロイが code:10027 で 止まります。`,
  );
  process.exit(1);
}

if (gzipKib > WARN_KIB) {
  console.log(
    `::warning::${headline} — 上限の ${percent}% です。減らす 手（重複した 依存・使っていない SDK）を 先に 打ってください。`,
  );
  process.exit(0);
}

console.log(`✓ ${headline}`);
