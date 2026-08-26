/**
 * 本番デプロイのログを見て、作りおき（KVキャッシュ）が入ったかを確かめる。
 *
 *   npm run cf:deploy 2>&1 | tee /tmp/deploy.log
 *   node scripts/check_cache_populated.mjs /tmp/deploy.log <cf:deploy の終了コード>
 *
 * なぜログを読むのか: 本番は `opennextjs-cloudflare deploy` が **中で**
 * populateCache を呼ぶので、STG（`scripts/preview_alias.mjs` が自前で呼ぶ）
 * のように戻り値を掴めない。掴めるのは標準出力だけである。
 *
 * 見分ける規則は STG と同じものを使う（`scripts/lib/cache_populated.mjs`）。
 * ずらすと片方だけ素通りして、作りおきゼロの版が本番に出る。
 *
 * **止めても本番は戻らない。** アップロードはもう終わっているので、これは
 * 「気づかないまま授業を迎える」ことを防ぐための赤である。赤が出たら
 * docs/deploy.md §0.9 に従って、枠が戻ってから出し直す。
 */
import fs from "node:fs";

const [logPath, statusText] = process.argv.slice(2);

if (!logPath) {
  console.error("使い方: node scripts/check_cache_populated.mjs <ログのパス> [終了コード]");
  process.exit(2);
}

const status = Number(statusText ?? 0);
let output = "";
try {
  output = fs.readFileSync(logPath, "utf-8");
} catch (error) {
  console.error(`✗ デプロイのログを読めませんでした（${logPath}）: ${String(error)}`);
  process.exit(2);
}

const { cachePopulated, CACHE_EMPTY_MESSAGE } = await import("./lib/cache_populated.mjs");

if (!cachePopulated(status, output)) {
  console.error(CACHE_EMPTY_MESSAGE);
  // GitHub Actions の要約に残す（ログを掘らなくても目に入るように）。
  if (process.env.GITHUB_ACTIONS) {
    console.error("::error title=作りおきが入っていません::この版は使わず、枠が戻ってから出し直す");
  }
  process.exit(status || 1);
}

const entries = /Successfully populated cache with (\d+) entries/i.exec(output)?.[1];
console.log(`✓ 作りおきが入りました（${entries}件）。`);
