#!/usr/bin/env node
/**
 * check_rls — 他人の データを 読めない・書けない ことを **本物の DB に 聞いて** 確かめる。
 *
 * なぜ 要るか:
 *   移行SQL に RLS が 書いて あることと、**本番の DB で 効いて いる**ことは 別である。
 *   `check_migrations.mjs` は「流れたか」しか 見ない。ここは「効いて いるか」を 見る。
 *   ブラウザから Supabase を 直に 呼ぶ 使い方（教材ページの クライアント化）では、
 *   送る 中身は 利用者が 書きかえられる ので、**RLS だけが 境界**に なる。
 *
 * 中身は `supabase/tests/rls_check.sql`。ぜんぶ 1つの トランザクションで 走り、
 * 最後に `rollback` する（書き込みの 試しは 拒否される 向きだけ・巻き戻る）。
 *
 * 終わりかたは check_migrations.mjs と そろえる。**「だめだった」と「確かめられない」は
 * 別物**だから:
 *   - 検査が だめ      → いつでも 失敗（1）
 *   - 鍵が 無い        → 既定は 成功（0）＋ 警告。`--strict` のときだけ 失敗（1）
 *
 * 使いかた:
 *   node scripts/check_rls.mjs           … 見て、報告する（既定）
 *   node scripts/check_rls.mjs --strict  … 「確かめられない」も 失敗に する
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQL = join(ROOT, "supabase", "tests", "rls_check.sql");
const strict = process.argv.includes("--strict");

if (!existsSync(SQL)) {
  console.error(`✗ ${SQL} がありません`);
  process.exit(1);
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.log("⚠ RLS は **確かめていません**（SUPABASE_DB_URL がありません）。");
  console.log(
    "  鍵は GitHub の Settings → Environments → Preview に入れます（docs/deploy.md §0 罠6）。",
  );
  console.log("  AIのセッションなら Supabase コネクタで supabase/tests/rls_check.sql の");
  console.log(
    "  中身を そのまま 流せば、同じ 検査が できます（最後に rollback するので 何も 残らない）。",
  );
  process.exit(strict ? 1 : 0);
}

const psql = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", SQL], {
  stdio: "inherit",
  encoding: "utf8",
});

if (psql.error) {
  console.error(`✗ psql を起動できませんでした: ${psql.error.message}`);
  console.error(
    "  GitHub の ubuntu ランナーには 入っています。手もとに 無ければ postgresql-client を 入れてください。",
  );
  process.exit(1);
}
if (psql.status !== 0) {
  console.error("✗ RLS の検査に 通りませんでした（上の ✗ を 見てください）");
  process.exit(1);
}
console.log("✓ RLS の検査に 通りました");
