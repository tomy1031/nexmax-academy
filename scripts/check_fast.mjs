#!/usr/bin/env node
/**
 * check_fast — push の 前の 見張り（速い 検査だけを 並べて 一度に 回す）
 *
 * なぜ要るか: CI の赤の多く（整形くずれ・型・コンテンツ検収）は、押してから
 * 5分待って知るには軽すぎる失敗で、1回の赤が「気づく→直す→もう一度 CI」の
 * 15分級のやり直しになる（2026-08-25 に整形だけで2回）。ここで20〜30秒払えば
 * その往復ごと消える。重い検査（ビルド・e2e・大きさ）は入れない — CI が見る。
 *
 * 使いかた:
 *   node scripts/check_fast.mjs          # 整形・型・コンテンツ検収・単体テスト（pre-push が回す）
 *   node scripts/check_fast.mjs --full   # ↑に ESLint と 秘密情報スキャン も足す（PR を作る前に）
 *
 * 4つを順に回すと約45秒、並列なら約25秒（2026-08-25 開発コンテナ実測）。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/*
 * 依存が 入って いない ときは、4本 まとめて 意味の 分からない 赤を 出さない。
 * 新しい セッション（コンテナは 毎回 まっさら）で いちばん よく 起きる。
 */
if (!existsSync(new URL("../node_modules/.bin/tsc", import.meta.url))) {
  console.error("🛑 node_modules が ありません。先に `npm ci` を 走らせて ください（約45秒）。");
  process.exit(1);
}

const FAST = [
  ["整形", "format:check"],
  ["型", "typecheck"],
  ["コンテンツ検収", "lint:content"],
  ["単体テスト", "test"],
];
const FULL_EXTRA = [
  ["ESLint", "lint"],
  ["秘密情報", "lint:secrets"],
];

const full = process.argv.includes("--full");
const checks = full ? [...FAST, ...FULL_EXTRA] : FAST;
const t0 = Date.now();

/** 1つの npm script を走らせ、出力はためておく（並列でも行が混ざらないように）。 */
function run([label, script]) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "--silent", script], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) =>
      resolve({ label, script, code: code ?? 1, out, sec: Math.round((Date.now() - t0) / 1000) }),
    );
    child.on("error", (err) =>
      resolve({
        label,
        script,
        code: 1,
        out: String(err),
        sec: Math.round((Date.now() - t0) / 1000),
      }),
    );
  });
}

console.log(
  `⏳ 速い検査を ${checks.length}本 同時に 回します（${checks.map(([l]) => l).join("・")}）`,
);
const results = await Promise.all(checks.map(run));

let failed = 0;
for (const r of results) {
  if (r.code === 0) {
    console.log(`  ✓ ${r.label}（${r.sec}秒）`);
  } else {
    failed++;
    console.error(`\n✗ ${r.label}（npm run ${r.script}）が 落ちました:\n${r.out}`);
  }
}

const total = Math.round((Date.now() - t0) / 1000);
if (failed > 0) {
  console.error(
    `\n🛑 ${failed}本が 赤です（${total}秒）。直してから 押してください — CI で 知るより 5分 はやい。`,
  );
  process.exit(1);
}
console.log(`✅ ぜんぶ 緑（${total}秒）`);
