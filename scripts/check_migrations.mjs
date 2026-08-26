/**
 * check_migrations — DBへ流し忘れた移行SQLを見つける見張り。
 *
 * なぜ要るか（2026-08-26 の事故）:
 *   `supabase/migrations/20260824090000_register_profile_on_login.sql` が
 *   **2日間 流されないまま**だった。その間に「ログインした人を登録する」直しを
 *   2本（#187・#204）出し、単体テストも e2e も CI も全部 緑で、本番にも載った。
 *   なのに DB 側は `gender` が not null のままで、登録は**黙って弾かれ続けていた**。
 *   気づいたのは、たまたま Supabase を覗いた時である——**30人がログインして
 *   いたのに、先生の名簿には23人しか出ていなかった。**
 *
 *   コネクタ（DBを見る道）は前から繋がっていた。つまり足りなかったのは
 *   **権限ではなく、確かめる仕組み**である。だから機械の見張りをここに置く。
 *
 * 何を見るか:
 *   `supabase/migrations/*.sql` のファイル名の頭（版）と、DBの
 *   `supabase_migrations.schema_migrations` に記録された版を突き合わせる。
 *   リポジトリにあって DB に無いものが「流し忘れ」。
 *
 *   2026-08-26 に台帳を突き合わせた（baseline）ので、**ファイル名の版と
 *   DBの版は1対1で対応する**。それ以前は別系統で、名前だけが似ていた。
 *
 * どう確かめるか:
 *   `SUPABASE_DB_URL`（接続文字列）があれば Supabase CLI に聞く。
 *   無ければ**確かめられないと正直に言って終わる**（`--strict` を付けると失敗にする）。
 *   黙って「問題なし」と言わないのが、この見張りのいちばん大事な性質である。
 *
 * 使いかた:
 *   node scripts/check_migrations.mjs           … 見て、報告する（既定）
 *   node scripts/check_migrations.mjs --strict  … 流し忘れ／確かめられないを失敗にする（CI）
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

/** ファイル名は `<14桁の版>_<名前>.sql`（Supabase CLI の作法）。 */
const FILE_NAME = /^(\d{14})_(.+)\.sql$/;

/**
 * @typedef {{ version: string, name: string, file: string }} Migration
 */

/**
 * リポジトリにある移行SQL。版の順に並べて返す。
 * @param {readonly string[]} entries `supabase/migrations/` のファイル名
 * @returns {Migration[]}
 */
export function readRepoMigrations(entries) {
  return entries
    .map((entry) => FILE_NAME.exec(entry))
    .filter((match) => match !== null)
    .map((match) => ({ version: match[1], name: match[2], file: match[0] }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * `supabase migration list` の出力から、DBに記録ずみの版を拾う。
 *
 * 出力は `  Local | Remote | Time` の表で、Remote 側に版が立っていれば適用ずみ。
 * 表の形が変わっても壊れないように、**行の中に現れる14桁の並びのうち
 * 2つ目以降**ではなく「Remote 列」を列位置で読む。
 *
 * @param {string} stdout `supabase migration list` の出力
 * @returns {Set<string>} DBに記録ずみの版
 */
export function parseMigrationList(stdout) {
  const applied = new Set();
  for (const line of stdout.split("\n")) {
    if (!line.includes("|")) continue;
    const columns = line.split("|").map((cell) => cell.trim());
    if (columns.length < 2) continue;
    const remote = columns[1];
    if (/^\d{14}$/.test(remote)) applied.add(remote);
  }
  return applied;
}

/**
 * リポジトリにあって DB に無いもの。
 * @param {readonly Migration[]} repo
 * @param {ReadonlySet<string>} applied
 * @returns {Migration[]}
 */
export function pendingMigrations(repo, applied) {
  return repo.filter((migration) => !applied.has(migration.version));
}

function fetchAppliedVersions(dbUrl) {
  const stdout = execFileSync(
    "npx",
    ["--yes", "supabase@latest", "migration", "list", "--db-url", dbUrl],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return parseMigrationList(stdout);
}

function main() {
  const strict = process.argv.includes("--strict");
  const repo = readRepoMigrations(readdirSync(MIGRATIONS_DIR));
  const dbUrl = process.env.SUPABASE_DB_URL ?? "";

  if (!dbUrl) {
    // **ここで「問題なし」と言わない。** 言った瞬間に、この見張りは
    // 2026-08-26 の事故をもう一度そのまま通す。
    console.log(`移行SQL ${repo.length}本（リポジトリ）`);
    console.log("⚠ DBの適用状況は **確かめていません**（SUPABASE_DB_URL がありません）。");
    console.log("  AIのセッションなら Supabase コネクタで直接 確かめられます:");
    console.log("    select version from supabase_migrations.schema_migrations order by version;");
    console.log("  流し忘れがあれば「デプロイ（DB）」ワークフローで流す（docs/deploy.md §0.8）。");
    process.exit(strict ? 1 : 0);
    return;
  }

  let applied;
  try {
    applied = fetchAppliedVersions(dbUrl);
  } catch (error) {
    console.error("✗ DBに聞けませんでした:", error.message?.split("\n")[0] ?? error);
    process.exit(strict ? 1 : 0);
    return;
  }

  const pending = pendingMigrations(repo, applied);
  if (pending.length === 0) {
    console.log(`✓ 移行SQL ${repo.length}本、すべてDBに流れています。`);
    return;
  }

  console.error(`\n🛑 DBへ流していない移行SQLが ${pending.length}本 あります:`);
  for (const migration of pending) console.error(`   - ${migration.file}`);
  console.error("\nこれを放っておくと、**コードだけ先に本番へ載って黙って効かない**");
  console.error("（2026-08-26 に実発生。7人が先生の名簿から消えていた）。");
  console.error("流しかた: Actions → 「デプロイ（DB）」→ Run workflow（docs/deploy.md §0.8）\n");
  process.exit(1);
}

// テストから import されたときは走らせない。
if (process.argv[1] && process.argv[1].endsWith("check_migrations.mjs")) main();
