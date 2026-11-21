#!/usr/bin/env node
/**
 * move_to_new_supabase — 毎晩のバックアップ（R2）を新しい Supabase のプロジェクトへ戻し、
 * アプリ（STG・本番・確認URL）の向き先を新しいプロジェクトへ切り替える。
 *
 * 2026-11-21、古いプロジェクトが通信量（egress）の上限を超えて 402 で止まり、
 * tomy さんが別のアカウントで新しいプロジェクトを作って移すと決めた（docs/deploy.md §0.22）。
 *
 * 使いかた（tomy さんの Mac で。貼るのは「新しいプロジェクトの URL」「DB の合言葉」「公開の鍵」の3つだけ）:
 *   node scripts/move_to_new_supabase.mjs [新しい project-ref か URL] [バックアップ .tar.gz.age]
 *
 *   ref を省くと聞く。バックアップを省くと ~/nexmax-restore/ のいちばん新しい nexmax-db-….tar.gz.age を使う
 *   （R2 から `npx wrangler r2 object get nexmax-academy-db-backup/daily/<名前> --remote --file …` で取る）
 *
 *   --skip-restore  戻すのを飛ばす（もう戻してあり、確かめと切り替えだけやり直すとき）
 *   --no-switch     戻して確かめるところまで。GitHub の鍵は変えない
 *   --key <path>    バックアップを開ける秘密鍵（既定 ~/.config/nexmax-academy/db-backup-age-key.txt）
 *   --expect-privileges "<件数> <md5>"
 *                   古い DB で PRIVILEGE_FINGERPRINT_SQL を流した値。新しい DB の権限の指紋と違えば止める
 *
 * 流れ:
 *   1. バックアップを開ける。平文は一時フォルダ（自分だけ読める）に置き、最後に必ず消す
 *   2. 目録（manifest.json）の sha256 と照らす
 *   3. 新しいプロジェクトの Session pooler を探す（合言葉は送らない。find_db_host.mjs）
 *   4. 合言葉を聞く（伏せ字。空・ちがうときは終わらずに聞き直す）
 *   5. 新しい DB が空かを見る。アプリの表がもうあれば止める（**上書きしない**）
 *   6. 戻す（Supabase 公式「Backup and restore using the CLI」と同じ並び・1つのトランザクション。
 *      docs/backup-recovery.md §5.3）
 *   7. Storage の置き場（assets）と権限を作る（ファイルはバックアップに入っていない）
 *   8. 権限を古い DB とそろえる（privilegeSyncSql）。確かめる: 権限の指紋・表ごとの件数・移行の台帳・RLS
 *   9. 全部通ったら公開の鍵を聞き、GitHub の Environment「Preview」の3つ
 *      （SUPABASE_DB_URL・NEXT_PUBLIC_SUPABASE_URL・NEXT_PUBLIC_SUPABASE_ANON_KEY）と、
 *      見張り（academy-watch）の SUPABASE_URL を差し替える
 *
 * 合言葉と鍵は画面にもファイルにも出さない。psql へは環境変数 PGPASSWORD で、
 * gh・wrangler へは標準入力で渡す（register_db_secret.mjs と同じ扱い）。
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET_SQL = join(ROOT, "supabase", "migrations", "20260805001747_studio_assets_bucket.sql");
const ENVIRONMENT = "Preview";
const WATCH_WORKER = "academy-watch";
const BACKUP_FILES = ["roles.sql", "schema.sql", "data.sql", "extras.sql"];

/**
 * 貼られた公開の鍵を確かめる。返すのは問題の文（空なら合格）。
 *
 * - 旧来の anon（JWT）なら、中身の ref と role を読み、**別のプロジェクトの鍵**や
 *   **service_role（秘密の鍵）**を取り違えていないかを見る（ブラウザに配る値なので取り違えは事故）
 * - 新しい形の Publishable（sb_publishable_…）はそのまま受け取る
 * - sb_secret_… は秘密の鍵なので受け取らない
 *
 * @param {string} key
 * @param {string} ref
 * @returns {string[]}
 */
export function anonKeyProblems(key, ref) {
  const value = String(key ?? "").trim();
  if (!value) return ["鍵が空です"];
  if (/^sb_secret_/.test(value))
    return ["それは秘密の鍵（Secret key）です。Publishable key か anon の鍵を貼ってください"];
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(value)) return [];
  const parts = value.split(".");
  if (parts.length !== 3 || !value.startsWith("eyJ"))
    return ["鍵の形ではありません（eyJ… か sb_publishable_… で始まる1行の文字）"];
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return ["鍵の中身を読めません（途中で切れていませんか）"];
  }
  const problems = [];
  if (payload.role !== "anon")
    problems.push(
      payload.role === "service_role"
        ? "それは service_role（秘密の鍵）です。anon の鍵を貼ってください"
        : `anon の鍵ではありません（role=${payload.role}）`,
    );
  if (payload.ref !== ref)
    problems.push(`別のプロジェクトの鍵です（鍵は ${payload.ref}・新しいプロジェクトは ${ref}）`);
  return problems;
}

/**
 * リポジトリの移行SQL（ファイル名の版）が、戻した DB の台帳に全部あるか。
 * DB にだけある版（2026-09-04 以前の2経路の名残り）は問題にしない。
 *
 * @param {readonly string[]} fileNames supabase/migrations/ のファイル名
 * @param {readonly string[]} dbVersions schema_migrations.version
 * @returns {string[]} DB に無い版
 */
export function missingMigrations(fileNames, dbVersions) {
  const inDb = new Set(dbVersions.map((v) => v.trim()).filter(Boolean));
  return fileNames
    .map((name) => /^(\d{14})_.+\.sql$/.exec(name)?.[1])
    .filter((version) => version && !inDb.has(version))
    .sort();
}

/**
 * 貼られた文字から project-ref を取り出す。ダッシュボードの URL・API の URL・ref そのもの、のどれでもよい。
 * @param {string} text
 * @returns {string | null}
 */
export function projectRefFrom(text) {
  const value = String(text ?? "").trim();
  const m =
    /supabase\.com\/dashboard\/project\/([a-z0-9]{20})(?:[/?#]|$)/.exec(value) ??
    /^https?:\/\/([a-z0-9]{20})\.supabase\.co(?:[/?#]|$)/.exec(value) ??
    /^([a-z0-9]{20})$/.exec(value);
  return m ? m[1] : null;
}

/**
 * 権限を、古い DB とまったく同じにそろえる SQL（2026-11-21 に実際にずれた）。
 *
 * pg_dump の schema.sql は、表の権限を「作った直後は持ち主だけ」という前提で、**足す GRANT だけ**を書く。
 * ところが Supabase のプロジェクトは、public に作った表・関数・連番に anon・authenticated・service_role の
 * 全権限を**作った瞬間に付ける**（既定の権限。schema.sql の末尾の ALTER DEFAULT PRIVILEGES と同じもの）。
 * そのまま戻すと、古い DB で anon から外していた17の表と、外していた関数が、新しい DB では anon に開く。
 * 件数は合うので、毎晩の「戻してみる」では見えない。RLS の検査（events を anon が読めた）で見つかった。
 *
 * だから public の表・関数から、この3つの役の権限をいったん全部外し、schema.sql の GRANT / REVOKE を
 * もう一度流す。PUBLIC（だれでも）の権限は触らない——関数の PUBLIC の実行権は、戻したときに
 * schema.sql の REVOKE がもう正しく外している。拡張機能の持ち物は触らない。
 *
 * @param {string} schemaSql バックアップの schema.sql の中身
 * @returns {string}
 */
export function privilegeSyncSql(schemaSql) {
  const replay = String(schemaSql)
    .split("\n")
    .filter((line) => /^(GRANT|REVOKE) .*;\s*$/.test(line));
  if (replay.length === 0) throw new Error("schema.sql に GRANT / REVOKE の行がありません");
  return [
    "SET search_path = '';",
    "DO $$",
    "DECLARE r record;",
    "BEGIN",
    "  FOR r IN",
    "    SELECT c.oid::regclass::text AS obj, c.relkind",
    "    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace",
    "    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'S', 'p', 'f')",
    "      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d",
    "        WHERE d.classid = 'pg_catalog.pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')",
    "  LOOP",
    "    EXECUTE format('REVOKE ALL ON %s %s FROM anon, authenticated, service_role',",
    "      CASE WHEN r.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.obj);",
    "  END LOOP;",
    "  FOR r IN",
    "    SELECT p.oid::regprocedure::text AS fn, p.prokind",
    "    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace",
    "    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')",
    "      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d",
    "        WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')",
    "  LOOP",
    "    EXECUTE format('REVOKE ALL ON %s %s FROM anon, authenticated, service_role',",
    "      CASE WHEN r.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.fn);",
    "  END LOOP;",
    "END $$;",
    ...replay,
    "",
  ].join("\n");
}

/**
 * 権限の指紋。古い DB と新しい DB で同じ SQL を流し、値が同じなら権限は1件も違わない。
 * public の表・ビュー・連番と、public・app の関数の権限を、（相手・種類）の1件ずつに開いて並べる。
 * 出力は「件数 md5」の1行。
 */
export const PRIVILEGE_FINGERPRINT_SQL = `with rel as (
  select 'r:' || c.relname || ':' || case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end || ':' || a.privilege_type as x
  from pg_class c join pg_namespace n on n.oid = c.relnamespace,
  aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner))) a
  where n.nspname = 'public' and c.relkind in ('r','v','m','S','p')
), fn as (
  select 'f:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end || ':' || a.privilege_type as x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
  aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
  where n.nspname in ('public','app')
)
select count(*) || ' ' || md5(string_agg(x, ',' order by x))
from (select x from rel union all select x from fn) t`;

/* ───────────── ここから下は実行するときだけ ───────────── */

/** 暗号化されたバックアップを置いておく場所（docs/backup-recovery.md §5.1 と同じ）。 */
const DEFAULT_BACKUP_DIR = join(homedir(), "nexmax-restore");

/** そのフォルダでいちばん新しいバックアップ（名前の時刻で選ぶ）。 */
function latestBackup(folder) {
  if (!existsSync(folder)) return null;
  const names = readdirSync(folder)
    .filter((name) => /^nexmax-db-\d{4}-\d{2}-\d{2}T\d{4}Z\.tar\.gz\.age$/.test(name))
    .sort();
  return names.length > 0 ? join(folder, names[names.length - 1]) : null;
}

/** 見える形で1行読む（秘密ではない値だけ）。 */
function askVisible(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(prompt, (value) => {
      rl.close();
      resolve(value.trim());
    });
  });
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exitCode = 1;
  throw new Error("stop");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** psql を探す（Homebrew の libpq は PATH に入らない）。 */
function findPsql() {
  const candidates = [
    ...String(process.env.PATH ?? "")
      .split(delimiter)
      .map((dir) => join(dir, "psql")),
    "/opt/homebrew/opt/libpq/bin/psql",
    "/opt/homebrew/opt/postgresql@17/bin/psql",
    "/usr/local/opt/libpq/bin/psql",
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/**
 * 伏せ字で1行読む（register_db_secret.mjs と同じしかけ）。
 * 空のときは終わらずに聞き直す——空の Enter で終わると、次に貼った値がシェルに
 * コマンドとして入り、画面と履歴に出てしまう（2026-11-21 に実際に起きた）。
 */
async function askHidden(prompt) {
  for (;;) {
    const answer = await new Promise((resolve) => {
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
      rl.question("", (value) => {
        rl.close();
        process.stderr.write("\n");
        resolve(value.trim());
      });
    });
    if (answer) return answer;
    console.error("  空でした。もう一度貼ってください（やめるときは Ctrl+C）。");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const withValue = new Set(["--key", "--expect-privileges"]);
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !(i > 0 && withValue.has(args[i - 1])),
  );
  const skipRestore = flag("--skip-restore");
  const noSwitch = flag("--no-switch");
  const expectPrivileges = option("--expect-privileges")?.trim();
  const keyPath =
    option("--key") ?? join(homedir(), ".config", "nexmax-academy", "db-backup-age-key.txt");

  let ref = projectRefFrom(positional[0] ?? "");
  while (!ref) {
    const answer = await askVisible(
      "新しいプロジェクトの URL か project-ref（https://supabase.com/dashboard/project/… をそのまま貼ってよい）: ",
    );
    ref = projectRefFrom(answer);
    if (!ref)
      console.error("  project-ref（英小文字と数字の20文字）が読み取れません。もう一度どうぞ。");
  }
  const backupPath = positional[1] ?? latestBackup(DEFAULT_BACKUP_DIR);
  if (!backupPath)
    fail(`バックアップ（nexmax-db-….tar.gz.age）が ${DEFAULT_BACKUP_DIR} にありません。`);
  console.log(`■ 新しいプロジェクト: ${ref}\n■ 使うバックアップ: ${backupPath}\n`);

  const psql = findPsql();
  if (!psql) fail("psql がありません。brew install libpq を実行してから、もう一度どうぞ。");

  /* 1〜2. 開けて照らす */
  if (!existsSync(backupPath)) fail(`バックアップがありません: ${backupPath}`);
  if (!existsSync(keyPath)) fail(`バックアップを開ける秘密鍵がありません: ${keyPath}`);
  const work = mkdtempSync(join(tmpdir(), "nexmax-move-"));
  process.on("exit", () => rmSync(work, { recursive: true, force: true }));

  try {
    console.log("■ 1. バックアップを開けます");
    const tarball = join(work, "backup.tar.gz");
    const age = spawnSync("age", ["-d", "-i", keyPath, "-o", tarball, backupPath], {
      encoding: "utf8",
    });
    if (age.status !== 0) fail(`開けられませんでした: ${(age.stderr || "").trim()}`);
    const tar = spawnSync("tar", ["xzf", tarball, "-C", work], { encoding: "utf8" });
    if (tar.status !== 0) fail(`ほどけませんでした: ${(tar.stderr || "").trim()}`);
    const folder = readdirSync(work).find((name) => name.startsWith("nexmax-db-"));
    if (!folder) fail("中に nexmax-db-… のフォルダがありません");
    const dir = join(work, folder);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    for (const file of BACKUP_FILES) {
      const expected = manifest.files?.[file]?.sha256;
      if (!expected || sha256(join(dir, file)) !== expected)
        fail(`${file} が目録と合いません（壊れています）`);
    }
    const total = Object.values(manifest.rows).reduce((a, b) => a + b, 0);
    console.log(
      `✓ ${manifest.stamp} の分。4ファイルとも目録と一致（${Object.keys(manifest.rows).length}表・${total}件）`,
    );

    /* 3〜4. つなぐ */
    console.log("\n■ 2. 新しいプロジェクトの入口（Session pooler）を探します");
    const { findPoolerHost } = await import("./find_db_host.mjs");
    const { poolerUrl } = await import("./lib/db_url.mjs");
    const host = await findPoolerHost(ref, console.log);
    if (!host) fail("入口が見つかりません。project-ref を確かめてください。");

    const base = ["-X", "-h", host, "-p", "5432", "-U", `postgres.${ref}`, "-d", "postgres"];
    let password = "";
    const run = (extra, opts = {}) =>
      spawnSync(psql, [...base, ...extra], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: {
          ...process.env,
          PGPASSWORD: password,
          PGSSLMODE: "require",
          PGCONNECT_TIMEOUT: "20",
        },
        ...opts,
      });
    const query = (sql) => {
      const r = run(["-v", "ON_ERROR_STOP=1", "-A", "-t", "-F", "\t", "-c", sql]);
      if (r.status !== 0) fail(`問い合わせが通りません: ${redact(r.stderr)}`);
      return r.stdout.trim();
    };

    for (let tries = 1; ; tries++) {
      password = await askHidden(
        "\n新しいプロジェクトの DB の合言葉（Database password。打った字は出ません）: ",
      );
      const probe = run(["-A", "-t", "-c", "select 1"]);
      if (probe.status === 0) break;
      const why = /password authentication failed/i.test(probe.stderr)
        ? "合言葉がちがいます"
        : `つながりません（${redact(probe.stderr)}）`;
      if (tries >= 5) fail(`${why}。5回ちがったのでやめました。`);
      console.error(`  ${why}。もう一度どうぞ（やめるときは Ctrl+C）。`);
    }
    console.log("✓ つながりました");

    /* 5〜7. 戻す */
    const hasApp = query("select to_regclass('public.profiles') is not null") === "t";
    if (skipRestore) {
      if (!hasApp) fail("--skip-restore ですが、新しい DB にアプリの表がありません。");
      console.log("\n■ 3. 戻すのは飛ばします（--skip-restore）");
    } else {
      if (hasApp)
        fail(
          "新しい DB にもうアプリの表があります。上書きしないので止めました。" +
            "\n  戻してあるなら --skip-restore を付けて、確かめと切り替えだけやり直してください。",
        );
      console.log("\n■ 3. 戻します（1つのトランザクション。途中で失敗したら何も残りません）");
      const restore = run([
        "-v",
        "ON_ERROR_STOP=1",
        "--single-transaction",
        "-q",
        "-f",
        join(dir, "roles.sql"),
        "-f",
        join(dir, "schema.sql"),
        "-c",
        "SET session_replication_role = replica",
        "-f",
        join(dir, "data.sql"),
        "-f",
        join(dir, "extras.sql"),
      ]);
      if (restore.status !== 0) fail(`戻せませんでした:\n  ${redact(restore.stderr)}`);
      console.log("✓ 戻しました");

      const bucket = run(["-v", "ON_ERROR_STOP=1", "-q", "-f", BUCKET_SQL]);
      if (bucket.status !== 0)
        fail(`Storage の置き場を作れませんでした:\n  ${redact(bucket.stderr)}`);
      console.log("✓ Storage の置き場（assets）と権限を作りました");
    }

    /* 権限を古い DB とそろえる（privilegeSyncSql の理由。何度流しても同じ結果になる） */
    const syncFile = join(work, "privileges.sql");
    writeFileSync(syncFile, privilegeSyncSql(readFileSync(join(dir, "schema.sql"), "utf8")), {
      mode: 0o600,
    });
    const sync = run(["-v", "ON_ERROR_STOP=1", "--single-transaction", "-q", "-f", syncFile]);
    if (sync.status !== 0) fail(`権限をそろえられませんでした:\n  ${redact(sync.stderr)}`);
    console.log("✓ 表と関数の権限を、古い DB と同じにそろえました");

    /* 8. 確かめる */
    console.log("\n■ 4. 確かめます");
    const problems = [];
    const fingerprint = query(PRIVILEGE_FINGERPRINT_SQL);
    if (expectPrivileges && fingerprint !== expectPrivileges)
      problems.push(
        `権限の指紋が古い DB と違います（新しい DB ${fingerprint}・古い DB ${expectPrivileges}）`,
      );
    else
      console.log(
        `✓ 権限の指紋: ${fingerprint}${expectPrivileges ? "（古い DB と一致）" : "（古い DB と比べていません）"}`,
      );
    const { countSql, parseCountRows, verifyCounts } = await import("./db_backup.mjs");
    const restored = parseCountRows(query(countSql(manifest.rows)));
    const countProblems = verifyCounts(manifest.rows, restored);
    problems.push(...countProblems);
    if (countProblems.length === 0)
      console.log(
        `✓ 表ごとの件数: ${Object.keys(manifest.rows).length}表・${total}件、1件も違いません`,
      );

    const files = readdirSync(join(ROOT, "supabase", "migrations"));
    const versions = query("select version from supabase_migrations.schema_migrations").split("\n");
    const missing = missingMigrations(files, versions);
    if (missing.length > 0)
      problems.push(
        `移行の台帳に無い版があります: ${missing.join(", ")}（integration の移行SQLが未反映）`,
      );
    else
      console.log(
        `✓ 移行の台帳: リポジトリの移行SQLが全部入っています（台帳 ${versions.length}版）`,
      );

    const grants = query(
      "select count(*) from information_schema.role_table_grants " +
        "where table_schema = 'public' and grantee in ('anon','authenticated') and privilege_type = 'SELECT'",
    );
    if (Number(grants) === 0)
      problems.push("anon・authenticated に public の表の読み取り権限がありません");
    else console.log(`✓ 表の権限: anon・authenticated の読み取り権限 ${grants}件`);

    const bucketRow = query("select count(*) from storage.buckets where id = 'assets' and public");
    if (bucketRow !== "1") problems.push("Storage の置き場 assets がありません");
    else
      console.log(
        "✓ Storage の置き場 assets があります（中のファイルは下書きの試しだけなので写していません）",
      );

    const rls = spawnSync(process.execPath, [join(ROOT, "scripts", "check_rls.mjs"), "--strict"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dirname(psql)}${delimiter}${process.env.PATH ?? ""}`,
        PGSSLMODE: "require",
        SUPABASE_DB_URL: poolerUrl({ ref, host, password: encodeURIComponent(password) }),
      },
    });
    if (rls.status !== 0)
      problems.push(`RLS の検査に通りません:\n  ${redact(rls.stdout + rls.stderr)}`);
    else console.log("✓ RLS: 他人のデータが読めないことを確かめました（check_rls.mjs）");

    if (problems.length > 0) fail(`確かめで止まりました:\n  - ${problems.join("\n  - ")}`);

    if (noSwitch) {
      console.log("\n■ --no-switch なので、アプリの向き先は変えません。ここまでで終わりです。");
      return;
    }

    /* 9. 切り替える */
    console.log("\n■ 5. アプリの向き先を新しいプロジェクトへ切り替えます");
    const url = `https://${ref}.supabase.co`;
    let anonKey = "";
    for (;;) {
      anonKey = await askHidden(
        "公開の鍵（Project Settings → API Keys の anon public か Publishable key。打った字は出ません）: ",
      );
      const keyProblems = anonKeyProblems(anonKey, ref);
      if (keyProblems.length === 0) {
        const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } }).catch(
          () => null,
        );
        if (res?.ok) break;
        keyProblems.push(
          `その鍵で新しいプロジェクトに入れません（HTTP ${res?.status ?? "つながらない"}）`,
        );
      }
      console.error(`  ${keyProblems.join("・")}。もう一度どうぞ（やめるときは Ctrl+C）。`);
    }

    const secrets = [
      ["SUPABASE_DB_URL", poolerUrl({ ref, host, password: encodeURIComponent(password) })],
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
    ];
    for (const [name, value] of secrets) {
      const set = spawnSync("gh", ["secret", "set", name, "--env", ENVIRONMENT], {
        input: value,
        encoding: "utf8",
        cwd: ROOT,
      });
      if (set.status !== 0) fail(`${name} を登録できませんでした: ${(set.stderr || "").trim()}`);
      console.log(`✓ GitHub の Environment「${ENVIRONMENT}」の ${name} を差し替えました`);
    }

    const watch = spawnSync(
      "npx",
      ["--no-install", "wrangler", "secret", "put", "SUPABASE_URL", "--name", WATCH_WORKER],
      { input: url, encoding: "utf8", cwd: ROOT },
    );
    if (watch.status === 0)
      console.log(`✓ 見張り（${WATCH_WORKER}）の SUPABASE_URL を差し替えました`);
    else
      console.log(
        `⚠ 見張りの SUPABASE_URL は差し替えられませんでした（wrangler のログイン切れかも）。アプリには影響しません。`,
      );

    console.log("\n✓ 終わりました。STG と本番は、次のデプロイから新しいプロジェクトを使います。");
  } catch (error) {
    if (error?.message !== "stop") throw error;
  } finally {
    rmSync(work, { recursive: true, force: true });
    console.log("（バックアップを開けた一時フォルダは消しました）");
  }
}

/** psql のエラーから中身（値）を伏せる。行の中身は出さない（db_backup.mjs の redactLog と同じ考え）。 */
function redact(text) {
  return String(text ?? "")
    .split("\n")
    .filter((line) => /ERROR|FATAL|could not|timeout|✗/i.test(line))
    .map((line) =>
      line
        .replace(/'[^']*'/g, "'…'")
        .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "(…)=(…)")
        .slice(0, 200),
    )
    .slice(0, 8)
    .join("\n  ");
}

if (process.argv[1] && process.argv[1].endsWith("move_to_new_supabase.mjs")) {
  await main().catch((error) => {
    if (error?.message !== "stop") throw error;
  });
}
