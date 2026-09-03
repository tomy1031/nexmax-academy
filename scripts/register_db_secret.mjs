#!/usr/bin/env node
/**
 * register_db_secret — `SUPABASE_DB_URL` を GitHub に 登録する（1回で 終わらせる）
 *
 * ## なぜ 道具に するか
 * この 鍵の 登録は 2026-08-27 から 何度も やり直しに なって いる。理由は 3つ とも
 * **人の 不注意では なく 手順の 不備**だった:
 *
 *   1. 置き場所 … リポジトリ直下の Secrets では **見えない**。Environment「Preview」に 要る
 *   2. 文字列  … ダッシュボードの「URI」は 直結で **IPv6 だけ**。CI（IPv4）から 届かない
 *   3. ホスト名 … 正しい Session pooler は `aws-<n>-<region>` で、プロジェクトごとに ちがう
 *
 * ここで 3つ とも 機械が 埋める。人が 入れるのは **合言葉だけ**。
 *
 * ## 合言葉の 扱い
 *   - 画面に 出さない（入力は 伏せ字）
 *   - ファイルに 書かない
 *   - `gh` の 標準入力へ 直に 渡す（GitHub 側で 暗号化されて 保管される）
 *   - `@` `/` `:` などが 入って いても 壊れないよう **百分率エンコード**する
 *
 * 使いかた:
 *   node scripts/register_db_secret.mjs <project-ref>
 *   node scripts/register_db_secret.mjs <project-ref> --env Production
 */

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { findPoolerHost } from "./find_db_host.mjs";
import { poolerUrl } from "./lib/db_url.mjs";

const args = process.argv.slice(2);
const ref = args.find((a) => !a.startsWith("--"));
const envIndex = args.indexOf("--env");
const environment = envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : "Preview";

if (!ref) {
  console.error("使いかた: node scripts/register_db_secret.mjs <project-ref> [--env Preview]");
  console.error("  project-ref は Supabase の URL の まんなか（https://<ref>.supabase.co）。");
  process.exit(1);
}

/**
 * 伏せ字で 1行 読む。
 *
 * readline が 打った字を 書き戻す ところ（`_writeToOutput`）を 差しかえて 黙らせる。
 * 端末で ない ところ（パイプ）でも 動くように、`terminal` は 端末の ときだけ 立てる。
 */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const terminal = Boolean(process.stdin.isTTY);
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal });
    if (terminal) {
      let muted = false;
      rl._writeToOutput = (chunk) => {
        if (!muted) process.stderr.write(chunk);
      };
      process.stderr.write(prompt);
      muted = true;
    } else {
      process.stderr.write(prompt);
    }
    rl.question("", (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolve(answer.trim());
    });
  });
}

const host = await findPoolerHost(ref, console.log);
if (!host) process.exit(1);

console.log("");
console.log(`■ 登録先: Environment「${environment}」の SUPABASE_DB_URL`);
console.log(`■ 形    : ${poolerUrl({ ref, host, password: "********" })}`);
console.log("");

const password = await askHidden("Supabase の DB の 合言葉（打った字は 出ません）: ");
if (!password) {
  console.error("✗ 合言葉が 空です。やめました。");
  process.exit(1);
}

const url = poolerUrl({ ref, host, password: encodeURIComponent(password) });

const result = spawnSync("gh", ["secret", "set", "SUPABASE_DB_URL", "--env", environment], {
  input: url,
  stdio: ["pipe", "inherit", "inherit"],
  encoding: "utf8",
});
if (result.status !== 0) {
  console.error("✗ 登録できませんでした（gh の 出力を 見てください）");
  process.exit(1);
}

const list = spawnSync("gh", ["secret", "list", "--env", environment], { encoding: "utf8" });
const registered = (list.stdout ?? "").includes("SUPABASE_DB_URL");
console.log(registered ? "✓ 登録できました" : "⚠ 一覧に 出て きません（GitHub の 反映待ちかも）");
console.log("  つぎ: gh workflow run migrate.yml  で 実際に 流して 確かめる");
