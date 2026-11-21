/**
 * supabase_profiles — アプリがどの Supabase のプロジェクトを使うかを、コマンド1つで切り替えるための部品
 *
 * 2026-11-21、別のアカウントの新しいプロジェクトへ移したときに、tomy さんが
 * 「相互のDBは簡単に切り替えできるように準備はしておいてください」と頼んだ。
 *
 * GitHub の Secrets は書けるが読み出せない。切り替え先の値（DB の接続文字列と公開の鍵）を
 * 毎回人に貼ってもらわずに済むよう、プロジェクトごとの値を tomy さんの Mac に
 * **暗号化して**置く（毎晩のバックアップと同じ age の鍵。公開鍵は scripts/db_backup_recipients.txt、
 * 秘密鍵は ~/.config/nexmax-academy/db-backup-age-key.txt）。平文はファイルにも画面にも出さない。
 *
 * 置き場: ~/.config/nexmax-academy/supabase-profiles/<ref>.json.age
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PROFILE_DIR = join(homedir(), ".config", "nexmax-academy", "supabase-profiles");
export const AGE_KEY = join(homedir(), ".config", "nexmax-academy", "db-backup-age-key.txt");
const RECIPIENTS = join(ROOT, "scripts", "db_backup_recipients.txt");
const STATE = join(PROFILE_DIR, "current.json");
export const ENVIRONMENT = "Preview";
export const WATCH_WORKER = "academy-watch";

/**
 * 1つのプロジェクトの値から、GitHub の Environment「Preview」に入れる3つを作る。
 * @param {{ ref: string, dbUrl: string, anonKey: string }} profile
 * @returns {[string, string][]}
 */
export function profileSecrets(profile) {
  const problems = profileProblems(profile);
  if (problems.length > 0) throw new Error(problems.join("・"));
  return [
    ["SUPABASE_DB_URL", profile.dbUrl],
    ["NEXT_PUBLIC_SUPABASE_URL", `https://${profile.ref}.supabase.co`],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", profile.anonKey],
  ];
}

/**
 * 保存する値の形の見張り。別のプロジェクトの接続文字列を混ぜていないかも見る。
 * @param {unknown} profile
 * @returns {string[]}
 */
export function profileProblems(profile) {
  const p = /** @type {Record<string, unknown>} */ (profile ?? {});
  const problems = [];
  if (typeof p.ref !== "string" || !/^[a-z0-9]{20}$/.test(p.ref))
    problems.push("ref が20文字の英小文字と数字ではありません");
  if (typeof p.anonKey !== "string" || p.anonKey.length < 20) problems.push("公開の鍵がありません");
  if (typeof p.dbUrl !== "string" || !/^postgres(ql)?:\/\//.test(p.dbUrl))
    problems.push("DB の接続文字列がありません");
  else if (typeof p.ref === "string" && !p.dbUrl.includes(`postgres.${p.ref}:`))
    problems.push("DB の接続文字列が別のプロジェクトを指しています");
  else if (!/pooler\.supabase\.com:5432\//.test(p.dbUrl))
    problems.push("DB の接続文字列が Session pooler（…pooler.supabase.com:5432）ではありません");
  return problems;
}

function profilePath(ref) {
  return join(PROFILE_DIR, `${ref}.json.age`);
}

/** 暗号化して保存する（上書き）。 */
export function saveProfile({ ref, dbUrl, anonKey, label }) {
  const profile = { ref, dbUrl, anonKey, label: label ?? "", savedAt: new Date().toISOString() };
  const problems = profileProblems(profile);
  if (problems.length > 0) throw new Error(problems.join("・"));
  mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
  const age = spawnSync("age", ["-R", RECIPIENTS, "-o", profilePath(ref)], {
    input: JSON.stringify(profile),
    encoding: "utf8",
  });
  if (age.status !== 0) throw new Error(`暗号化できませんでした: ${(age.stderr || "").trim()}`);
  return profilePath(ref);
}

/** 開けて読む。 */
export function loadProfile(ref, keyPath = AGE_KEY) {
  const file = profilePath(ref);
  if (!existsSync(file)) throw new Error(`${ref} の値が保存されていません（${file}）`);
  const age = spawnSync("age", ["-d", "-i", keyPath, file], { encoding: "utf8" });
  if (age.status !== 0) throw new Error(`開けられませんでした: ${(age.stderr || "").trim()}`);
  const profile = JSON.parse(age.stdout);
  const problems = profileProblems(profile);
  if (problems.length > 0) throw new Error(problems.join("・"));
  return profile;
}

/** 保存してあるプロジェクトの一覧（中身は開けない。ref と保存した日時だけ）。 */
export function listProfiles() {
  if (!existsSync(PROFILE_DIR)) return [];
  return readdirSync(PROFILE_DIR)
    .filter((name) => /^[a-z0-9]{20}\.json\.age$/.test(name))
    .map((name) => ({
      ref: name.slice(0, 20),
      savedAt: statSync(join(PROFILE_DIR, name)).mtime.toISOString(),
    }));
}

/** いまアプリ（GitHub の鍵）がどれを向いているか（最後に切り替えた記録。無ければ null）。 */
export function currentState() {
  if (!existsSync(STATE)) return null;
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return null;
  }
}

/**
 * GitHub の Environment「Preview」の3つと、見張りの SUPABASE_URL を、そのプロジェクトへ差し替える。
 * 値は標準入力で渡す（画面にもコマンドの引数にも出さない）。
 */
export function applyProfile(profile, log = console.log) {
  for (const [name, value] of profileSecrets(profile)) {
    const set = spawnSync("gh", ["secret", "set", name, "--env", ENVIRONMENT], {
      input: value,
      encoding: "utf8",
      cwd: ROOT,
    });
    if (set.status !== 0)
      throw new Error(`${name} を登録できませんでした: ${(set.stderr || "").trim()}`);
    log(`✓ GitHub の Environment「${ENVIRONMENT}」の ${name} を差し替えました`);
  }
  const watch = spawnSync(
    "npx",
    ["--no-install", "wrangler", "secret", "put", "SUPABASE_URL", "--name", WATCH_WORKER],
    { input: `https://${profile.ref}.supabase.co`, encoding: "utf8", cwd: ROOT },
  );
  if (watch.status === 0) log(`✓ 見張り（${WATCH_WORKER}）の SUPABASE_URL を差し替えました`);
  else
    log(
      `⚠ 見張りの SUPABASE_URL は差し替えられませんでした（wrangler のログイン切れかも）。アプリには影響しません。`,
    );
  mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(STATE, JSON.stringify({ ref: profile.ref, at: new Date().toISOString() }) + "\n", {
    mode: 0o600,
  });
}

/** psql を探す（Homebrew の libpq は PATH に入らない）。 */
export function findPsql() {
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
 * STG を今の鍵で作り直す（「デプロイ」ワークフローを staging で起こす。STG は tomy さんの許可なしで出してよい）。
 * 本番は起こさない（授業前の自動に任せる。急ぐときは tomy さんの「本番まで」で）。
 */
export function deployStaging(log = console.log) {
  const run = spawnSync(
    "gh",
    ["workflow", "run", "deploy.yml", "--ref", "integration", "-f", "target=staging"],
    {
      encoding: "utf8",
      cwd: ROOT,
    },
  );
  if (run.status === 0)
    log("✓ STG の作り直しを始めました（数分。GitHub の Actions →「デプロイ」）");
  else log(`⚠ STG の作り直しを始められませんでした: ${(run.stderr || "").trim()}`);
}

/**
 * 伏せ字で1行読む（register_db_secret.mjs と同じしかけ）。
 * 空のときは終わらずに聞き直す——空の Enter で終わると、次に貼った値がシェルに
 * コマンドとして入り、画面と履歴に出てしまう（2026-11-21 に実際に起きた）。
 */
export async function askHidden(prompt) {
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

/** 見える形で1行読む（秘密ではない値だけ）。 */
export function askVisible(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(prompt, (value) => {
      rl.close();
      resolve(value.trim());
    });
  });
}
