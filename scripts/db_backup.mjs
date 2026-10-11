/**
 * db_backup — 毎晩の DB 書き出し（`.github/workflows/backup.yml`）の 下ごしらえ。
 *
 * なぜ要るか（2026-10-11 の 決定）:
 *   本番DB（Supabase 無料プラン）には 自動バックアップが 無く、**戻せる 時点が
 *   1つも 無かった**（2026-08-20 の 調査・docs/backup-recovery.md）。学習者35人・
 *   修了証136件・単語の 解答14,803件・会話ログ1,615件・先生の 直した 教材16行が
 *   DB に しか 無い。tomy が「毎晩 自動で 書き出す（無料）」を 選んだ。
 *
 * ワークフローは 薄く して、判断は ここに 寄せる（テストで 押さえる ため）:
 *   - data-excludes … 中身を 書き出さない 表を 選ぶ（storage 全部・auth の 大半）
 *   - count-copy    … 書き出した data.sql の 行数を 表ごとに 数える
 *   - count-sql     … 戻した 先で 同じ 表を 数える SQL を 作る
 *   - verify        … 「書き出した 行数」と「戻せた 行数」を 突き合わせる
 *   - manifest      … 中身の 目録（行数・ハッシュ）を 作る
 *   - keys          … 置き場での 名前（daily/ と monthly/）を 決める
 *   - prune         … 消して よい 古い ものを 選ぶ（新しい ものは 必ず 残す）
 *   - redact-log    … 復元の 失敗ログから **行の 中身を 落として** 出す
 *
 * **このリポジトリは public で、Actions の ログも 誰でも 読める。** だから
 * ここは 行の 中身（名前・メール・解答）を 1文字も 出さない。出すのは 表の 名前と 数だけ。
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * auth から 残す 表。**ログインを 同じ 人として 戻す のに 要る 2つ**だけ。
 *
 * - users      … 人そのもの。public の 表は ここの id を 指して いる
 * - identities … Google の アカウントと users.id の 結びつき。これが あれば
 *                戻した あとに Google で 入り直しても **同じ id の まま**に なる
 *
 * ほか（sessions・refresh_tokens・flow_state・one_time_tokens・監査ログ など）は
 * 戻しても 使えない うえ、**ログインの 合鍵に 近い**。持たない ほうが 安全。
 * GoTrue が 表を 足しても、ここに 無い ものは 自動で 外れる（数え上げで 外さない）。
 */
export const AUTH_TABLES_TO_KEEP = ["users", "identities"];

/**
 * 1つでも 空なら「書き出しが おかしい」と みなす 表。
 * 空の DB（別の プロジェクトを 指した・全部 消えた）を 黙って 保存しない ための 見張り。
 */
export const REQUIRED_TABLES = [
  "auth.users",
  "auth.identities",
  "public.users",
  "public.profiles",
  "public.completion_certificates",
  "public.word_test_answers",
  "public.studio_contents",
];

/**
 * 中身を 書き出さない 表（`supabase db dump --data-only --exclude` に 渡す 形）。
 *
 * **範囲は「外す ものを 名指し」で 決める**（「入れる スキーマを 名指し」に しない）。
 * 入れる 側を 名指しすると、あとで 新しい スキーマに 表を 足した とき **黙って 抜ける**。
 * 外す 側を 名指し すれば、知らない 表は 書き出しに 入り、戻して みる（ワークフローの 4）で
 * 合わなければ **赤で 落ちて 気づける**。黙って 抜けるより、うるさく 落ちる ほうを 選ぶ。
 *
 * - storage … 全部 外す。ファイルの 中身は DB に 無く、目録だけ 戻しても 使えない（対象外）
 * - auth    … users と identities 以外を 外す（AUTH_TABLES_TO_KEEP の 理由）
 *
 * @param {readonly string[]} tables `auth.<表>`・`storage.<表>` の 一覧（psql の 出力の 行）
 * @returns {string[]}
 */
export function dataExcludes(tables) {
  return tables
    .map((line) => line.trim())
    .filter((name) => /^(auth|storage)\.[A-Za-z0-9_]+$/.test(name))
    .filter((name) => !(name.startsWith("auth.") && AUTH_TABLES_TO_KEEP.includes(name.slice(5))))
    .sort();
}

/** 識別子 1つ（`"quiz_results"` か `quiz_results`）。 */
const IDENT = String.raw`(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)`;
/** COPY の 頭。`COPY "public"."quiz_results" ("id", …) FROM stdin;` */
const COPY_HEAD = new RegExp(String.raw`^COPY (${IDENT})\.(${IDENT})[ (].* FROM stdin;$`);

/** `"quiz_results"` → `quiz_results` */
function unquote(ident) {
  return ident.startsWith('"') ? ident.slice(1, -1).replaceAll('""', '"') : ident;
}

/**
 * pg_dump の data.sql（`--use-copy`）を 表ごとに 数える。
 *
 * COPY の 中では 改行は `\n` に 置きかわって いるので、**1行 ＝ 1件**。
 * 終わりの 印は `\.` だけの 行。
 *
 * @param {string} sql
 * @returns {Record<string, number>}
 */
export function countCopyRows(sql) {
  /** @type {Record<string, number>} */
  const counts = {};
  let current = null;
  for (const line of sql.split("\n")) {
    if (current === null) {
      const match = COPY_HEAD.exec(line);
      if (match) {
        current = `${unquote(match[1])}.${unquote(match[2])}`;
        counts[current] = counts[current] ?? 0;
      }
      continue;
    }
    if (line === "\\.") {
      current = null;
      continue;
    }
    counts[current] += 1;
  }
  if (current !== null)
    throw new Error(`COPY ${current} が 終わらない まま ファイルが 切れて います`);
  return counts;
}

/** SQL の 識別子として 安全に 囲む（`schema.table` を 2つに 分けて 囲む）。 */
function quoteQualified(name) {
  const dot = name.indexOf(".");
  const quote = (part) => `"${part.replaceAll('"', '""')}"`;
  return `${quote(name.slice(0, dot))}.${quote(name.slice(dot + 1))}`;
}

/**
 * 戻した 先で 数える SQL。出力は `表<TAB>件数` の 行（psql -A -t -F TAB）。
 * @param {Record<string, number>} counts
 * @returns {string}
 */
export function countSql(counts) {
  const names = Object.keys(counts).sort();
  if (names.length === 0) throw new Error("数える 表が ありません");
  const lines = names.map(
    (name) => `select '${name.replaceAll("'", "''")}', count(*) from ${quoteQualified(name)}`,
  );
  return `${lines.join("\nunion all\n")};\n`;
}

/** `表<TAB>件数` の 行を 読む。 */
export function parseCountRows(text) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [name, value] = line.split("\t");
    counts[name] = Number(value);
  }
  return counts;
}

/**
 * 書き出した 行数と 戻せた 行数を 突き合わせる。
 * @param {Record<string, number>} dumped
 * @param {Record<string, number>} restored
 * @param {readonly string[]} required 空では いけない 表
 * @returns {string[]} 問題（空なら 合格）
 */
export function verifyCounts(dumped, restored, required = REQUIRED_TABLES) {
  const problems = [];
  for (const name of required) {
    if (!(dumped[name] > 0)) problems.push(`${name} が 書き出しに 1件も 入って いません`);
  }
  for (const [name, expected] of Object.entries(dumped).sort()) {
    const actual = restored[name];
    if (actual === undefined) problems.push(`${name} を 戻した 先で 数えられません でした`);
    else if (actual !== expected)
      problems.push(`${name}: 書き出し ${expected}件 に 対して 戻せたのは ${actual}件`);
  }
  return problems;
}

/** 置き場での 時刻の 印（`2026-10-11T1917Z`）。ファイル名に `:` を 入れない。 */
export function stampOf(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}

const KEY = /^(daily|monthly)\/nexmax-db-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})Z\.tar\.gz\.age$/;

/**
 * 置き場での 名前。
 * @param {string} kind "daily" | "monthly"
 * @param {string} stamp stampOf の 返り値
 */
export function keyFor(kind, stamp) {
  return `${kind}/nexmax-db-${stamp}.tar.gz.age`;
}

/** 名前から 時刻を 読む。読めない 名前は null（**消す 候補に しない**）。 */
export function dateOfKey(key) {
  const match = KEY.exec(key);
  if (!match) return null;
  const [, , y, mo, d, h, mi] = match;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
}

/**
 * 月の 写しが 要るか。その 月の monthly/ が まだ 無ければ 要る。
 * @param {readonly string[]} monthlyKeys
 * @param {Date} now
 */
export function needsMonthly(monthlyKeys, now) {
  const month = now.toISOString().slice(0, 7);
  return !monthlyKeys.some((key) => {
    const date = dateOfKey(key);
    return date !== null && key.startsWith("monthly/") && date.toISOString().slice(0, 7) === month;
  });
}

/**
 * 消して よい 古い もの。
 *
 * **新しい 順に keepMin 個は、どれだけ 古くても 残す。** 書き出しが 何週間も
 * 止まって いた ときに「期限切れだから」と 最後の 1本まで 消さない ため
 * （日数だけで 消す 仕組みは、止まった ときに いちばん 大事な ものを 消す）。
 *
 * @param {readonly string[]} keys 同じ 種類（daily/ か monthly/）の 名前
 * @param {{ now: Date, keepDays: number, keepMin: number }} rule
 * @returns {string[]}
 */
export function selectPrunable(keys, { now, keepDays, keepMin }) {
  const dated = keys
    .map((key) => ({ key, date: dateOfKey(key) }))
    .filter((item) => item.date !== null)
    .sort((a, b) => b.date - a.date);
  const limit = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  return dated
    .slice(keepMin)
    .filter((item) => item.date.getTime() < limit)
    .map((item) => item.key);
}

/**
 * 復元の 失敗ログを、**行の 中身を 落として** 出す。
 *
 * psql は COPY で 落ちると `CONTEXT: COPY users, line 3: "<その 行 まるごと>"` や
 * `DETAIL: Key (email)=(...)` を 出す。Actions の ログは 公開なので、そのまま
 * 出すと **学習者の メールや 名前が 世界に 出る**。だから ERROR の 1行目だけを、
 * 引用の 中身を 伏せて 出す。
 *
 * @param {string} log
 * @returns {string[]}
 */
export function redactLog(log) {
  const out = [];
  for (const raw of log.split("\n")) {
    const line = raw.trim();
    const error = /^(?:psql:([^:]+):(\d+):\s*)?ERROR:\s*(.*)$/.exec(line);
    if (error) {
      const where = error[1] ? `${error[1].split("/").pop()}:${error[2]} ` : "";
      const message = error[3]
        .replace(/"[^"]*"/g, '"…"')
        .replace(/'[^']*'/g, "'…'")
        .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "(…)=(…)")
        .slice(0, 200);
      out.push(`ERROR ${where}${message}`);
      continue;
    }
    const context = /^CONTEXT:\s*COPY\s+([A-Za-z0-9_."]+),\s*line\s+(\d+)/.exec(line);
    if (context) out.push(`  （${context[1]} の ${context[2]}行目）`);
  }
  return out.length > 0
    ? out
    : ["（ERROR の 行が 見つかりません。ログは 中身を 含む ので 出しません）"];
}

/**
 * 目録。復元する 人が「どれが 何件 入って いるはずか」「ファイルが 壊れて いないか」を
 * 確かめる ために、暗号化の **内側**に 入れる。
 */
export function buildManifest({ dir, files, stamp, rows, tools }) {
  return {
    stamp,
    note: "復元のしかたは docs/backup-recovery.md。Storage（画像・音声のファイル）は入っていない。",
    tools,
    rows,
    files: Object.fromEntries(
      files.map((name) => {
        const path = join(dir, name);
        return [
          name,
          {
            bytes: statSync(path).size,
            sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
          },
        ];
      }),
    ),
  };
}

function readStdin() {
  return readFileSync(0, "utf8");
}

function main(argv) {
  const [command, ...args] = argv;
  const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : fallback;
  };

  switch (command) {
    case "data-excludes": {
      process.stdout.write(dataExcludes(readStdin().split("\n")).join(","));
      return 0;
    }
    case "count-copy": {
      const counts = countCopyRows(readFileSync(args[0], "utf8"));
      process.stdout.write(`${JSON.stringify(counts, null, 2)}\n`);
      return 0;
    }
    case "count-sql": {
      process.stdout.write(countSql(JSON.parse(readFileSync(args[0], "utf8"))));
      return 0;
    }
    case "verify": {
      const dumped = JSON.parse(readFileSync(args[0], "utf8"));
      const restored = parseCountRows(readFileSync(args[1], "utf8"));
      const problems = verifyCounts(dumped, restored);
      const total = Object.values(dumped).reduce((sum, n) => sum + n, 0);
      if (problems.length > 0) {
        for (const problem of problems) console.error(`✗ ${problem}`);
        return 1;
      }
      console.log(`✓ ${Object.keys(dumped).length}表・${total}件、すべて 空の DB へ 戻せました`);
      for (const name of REQUIRED_TABLES) console.log(`   ${name}: ${dumped[name]}件`);
      return 0;
    }
    case "manifest": {
      const dir = args[0];
      const files = readdirSync(dir)
        .filter((name) => name.endsWith(".sql"))
        .sort();
      const manifest = buildManifest({
        dir,
        files,
        stamp: option("stamp", ""),
        rows: JSON.parse(readFileSync(option("rows"), "utf8")),
        tools: { supabaseCli: option("cli", ""), server: option("server", "") },
      });
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
      return 0;
    }
    case "keys": {
      const stamp = option("stamp");
      console.log(keyFor("daily", stamp));
      console.log(keyFor("monthly", stamp));
      return 0;
    }
    case "needs-monthly": {
      const keys = readStdin().split(/\s+/).filter(Boolean);
      process.stdout.write(needsMonthly(keys, new Date(option("now"))) ? "yes" : "no");
      return 0;
    }
    case "prune": {
      const keys = readStdin()
        .split(/\s+/)
        .filter((key) => key && key !== "None");
      const doomed = selectPrunable(keys, {
        now: new Date(option("now")),
        keepDays: Number(option("keep-days")),
        keepMin: Number(option("keep-min")),
      });
      if (doomed.length > 0) process.stdout.write(`${doomed.join("\n")}\n`);
      return 0;
    }
    case "redact-log": {
      for (const line of redactLog(readFileSync(args[0], "utf8"))) console.error(line);
      return 0;
    }
    default:
      console.error(`使いかた: node scripts/db_backup.mjs <command>（冒頭の コメント 参照）`);
      return 2;
  }
}

// テストから import されたときは走らせない。
if (process.argv[1] && process.argv[1].endsWith("db_backup.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
