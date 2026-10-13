import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_TABLES_TO_KEEP,
  cleanRoles,
  countCopyRows,
  countSql,
  dataExcludes,
  dateOfKey,
  keyFor,
  needsMonthly,
  parseCountRows,
  redactLog,
  REQUIRED_TABLES,
  selectPrunable,
  stampOf,
  verifyCounts,
} from "../scripts/db_backup.mjs";

/**
 * 毎晩の DB 書き出し（.github/workflows/backup.yml）。
 *
 * 2026-10-11 まで 本番DBには **戻せる 時点が 1つも 無かった**。ここが 守るのは:
 *   - 要る ものが 書き出しに 入る（auth.users・identities・public の 全部）
 *   - 「戻せた」と 言える ときだけ 合格に する（件数が 1件でも 違えば 落とす）
 *   - 古い ものを 消すとき、**新しい ものを 消さない**
 *   - public の ログに 学習者の 中身を 出さない・秘密鍵を リポジトリに 置かない
 */

const ROOT = join(__dirname, "..");

describe("中身を 書き出さない 表", () => {
  const tables = [
    "auth.users",
    "auth.identities",
    "auth.sessions",
    "auth.refresh_tokens",
    "auth.audit_log_entries",
    "storage.objects",
    "storage.buckets",
    "",
    "  auth.flow_state  ",
  ];

  it("auth は users と identities だけ 残し、ほか（合鍵に 近い もの）は 外す", () => {
    const excluded = dataExcludes(tables);
    expect(excluded).not.toContain("auth.users");
    expect(excluded).not.toContain("auth.identities");
    expect(excluded).toEqual(
      expect.arrayContaining([
        "auth.sessions",
        "auth.refresh_tokens",
        "auth.audit_log_entries",
        "auth.flow_state",
      ]),
    );
    expect(AUTH_TABLES_TO_KEEP).toEqual(["users", "identities"]);
  });

  it("storage は 全部 外す（ファイルは 対象外。目録だけ 戻しても 使えない）", () => {
    expect(dataExcludes(tables)).toEqual(
      expect.arrayContaining(["storage.objects", "storage.buckets"]),
    );
  });

  it("public など ほかの スキーマは 外さない（知らない 表は 書き出しに 入る 側へ 倒す）", () => {
    expect(dataExcludes(["public.quiz_results", "app.anything", "auth.sessions"])).toEqual([
      "auth.sessions",
    ]);
  });

  it("GoTrue が 表を 足しても、名指し せずに 自動で 外れる", () => {
    expect(dataExcludes(["auth.users", "auth.some_new_table"])).toEqual(["auth.some_new_table"]);
  });
});

describe("roles.sql の 下ごしらえ", () => {
  it("Supabase が 付ける 設定値の 権限は 注記つきで 外す（戻すと permission denied で 止まる）", () => {
    const sql = [
      "SET default_transaction_read_only = off;",
      'ALTER ROLE "anon" SET "statement_timeout" TO \'3s\';',
      'GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin" GRANTED BY "supabase_admin";',
      "RESET ALL;",
    ].join("\n");
    const lines = cleanRoles(sql).split("\n");
    expect(lines[1]).toBe('ALTER ROLE "anon" SET "statement_timeout" TO \'3s\';');
    expect(lines[2]).toMatch(/^-- \[db_backup\] .*GRANT SET ON PARAMETER "log_min_messages"/);
    expect(lines[3]).toBe("RESET ALL;");
  });
});

describe("書き出した data.sql の 件数を 数える", () => {
  const sql = [
    "SET session_replication_role = replica;",
    "",
    'COPY "auth"."users" ("instance_id", "id", "email") FROM stdin;',
    "00000000\tu1\ta@example.com",
    "00000000\tu2\tb@example.com",
    "\\.",
    "",
    'COPY "public"."quiz_results" ("id", "answer") FROM stdin;',
    '1\tCOPY "x"."y" (a) FROM stdin;', // 行の 中身が COPY に 見えても 1件と 数える
    "2\tline\\nbreak", // 値の 中の 改行は \n に なって いる
    "\\.",
    "",
    'COPY "public"."empty_table" ("id") FROM stdin;',
    "\\.",
    "",
    'SELECT pg_catalog.setval(\'"public"."seq"\', 5, true);',
    "RESET ALL;",
  ].join("\n");

  it("表ごとに 1行 ＝ 1件で 数える（空の 表も 0件で 出す）", () => {
    expect(countCopyRows(sql)).toEqual({
      "auth.users": 2,
      "public.quiz_results": 2,
      "public.empty_table": 0,
    });
  });

  it("COPY が 終わらない まま 切れて いたら 止める（途中で 切れた 書き出しを 合格に しない）", () => {
    expect(() => countCopyRows('COPY "public"."x" ("id") FROM stdin;\n1\n2')).toThrow(/終わらない/);
  });
});

describe("戻した 先で 数えて 突き合わせる", () => {
  it("数える SQL は 名前を 囲んで 作る", () => {
    expect(countSql({ "public.quiz_results": 3, "auth.users": 2 })).toBe(
      [
        `select 'auth.users', count(*) from "auth"."users"`,
        "union all",
        `select 'public.quiz_results', count(*) from "public"."quiz_results";`,
        "",
      ].join("\n"),
    );
  });

  it("psql の タブ区切りを 読む", () => {
    expect(parseCountRows("auth.users\t35\npublic.profiles\t35\n\n")).toEqual({
      "auth.users": 35,
      "public.profiles": 35,
    });
  });

  const full = Object.fromEntries(REQUIRED_TABLES.map((name) => [name, 10]));

  it("全部 そろえば 合格", () => {
    expect(verifyCounts(full, { ...full })).toEqual([]);
  });

  it("1件でも 違えば 不合格", () => {
    const problems = verifyCounts(full, { ...full, "public.word_test_answers": 9 });
    expect(problems).toEqual([expect.stringContaining("public.word_test_answers")]);
  });

  it("戻した 先に 表が 無ければ 不合格", () => {
    const { ["auth.identities"]: _gone, ...restored } = full;
    expect(verifyCounts(full, restored)).toEqual([expect.stringContaining("auth.identities")]);
  });

  it("要る 表が 空なら 不合格（別の DB を 指した・全部 消えた を 黙って 保存しない）", () => {
    const empty = { ...full, "auth.users": 0 };
    expect(verifyCounts(empty, { ...empty })).toEqual([expect.stringContaining("auth.users")]);
  });

  it("守る ものの 一覧に、学習者・修了証・解答・先生の 直した 教材が 入って いる", () => {
    expect(REQUIRED_TABLES).toEqual(
      expect.arrayContaining([
        "auth.users",
        "auth.identities",
        "public.profiles",
        "public.completion_certificates",
        "public.word_test_answers",
        "public.studio_contents",
      ]),
    );
  });
});

describe("置き場での 名前", () => {
  it("時刻の 印に `:` を 入れない", () => {
    expect(stampOf(new Date("2026-10-11T19:17:42Z"))).toBe("2026-10-11T1917Z");
  });

  it("名前から 時刻を 読み戻せる。読めない 名前は null", () => {
    const key = keyFor("daily", "2026-10-11T1917Z");
    expect(key).toBe("daily/nexmax-db-2026-10-11T1917Z.tar.gz.age");
    expect(dateOfKey(key)?.toISOString()).toBe("2026-10-11T19:17:00.000Z");
    expect(dateOfKey("daily/someone-else.tar.gz")).toBeNull();
    expect(dateOfKey("daily/nexmax-db-2026-10-11T1917Z.tar.gz")).toBeNull(); // 暗号化されて いない 名前
  });

  it("月の 写しは その 月に まだ 無いときだけ 作る", () => {
    const now = new Date("2026-11-01T22:00:00Z");
    expect(needsMonthly([], now)).toBe(true);
    expect(needsMonthly([keyFor("monthly", "2026-10-01T2000Z")], now)).toBe(true);
    expect(needsMonthly([keyFor("monthly", "2026-11-01T2000Z")], now)).toBe(false);
    expect(needsMonthly(["None"], now)).toBe(true); // aws の「空」の 出力
  });
});

describe("古い ものを 消す", () => {
  const now = new Date("2026-12-31T20:00:00Z");
  const daily = (day: string) => keyFor("daily", `${day}T1917Z`);

  it("日数を 過ぎた ものだけ 消す", () => {
    const keys = [daily("2026-12-30"), daily("2026-12-01"), daily("2026-11-01")];
    expect(selectPrunable(keys, { now, keepDays: 35, keepMin: 1 })).toEqual([daily("2026-11-01")]);
  });

  it("書き出しが 止まって いても、新しい 順の keepMin 本は 消さない", () => {
    // 2か月 止まって いた: 全部 期限切れでも 最後の 7本は 残す
    const keys = Array.from({ length: 10 }, (_, i) =>
      daily(`2026-10-${String(i + 1).padStart(2, "0")}`),
    );
    const doomed = selectPrunable(keys, { now, keepDays: 35, keepMin: 7 });
    expect(doomed).toEqual([daily("2026-10-03"), daily("2026-10-02"), daily("2026-10-01")]);
  });

  it("名前の 読めない ものは 消さない（人が 手で 置いた ものかも しれない）", () => {
    const keys = ["daily/manual-before-migration.sql.age", daily("2020-01-01")];
    expect(selectPrunable(keys, { now, keepDays: 35, keepMin: 0 })).toEqual([daily("2020-01-01")]);
  });
});

describe("復元の 失敗ログを 伏せる（Actions の ログは 公開）", () => {
  const log = [
    'psql:/home/runner/work/_temp/nexmax-db-x/data.sql:120: ERROR:  invalid input syntax for type uuid: "yamada@example.com"',
    'CONTEXT:  COPY users, line 3, column id: "yamada@example.com"',
    "DETAIL:  Key (email)=(tanaka@example.com) already exists.",
    "ERROR:  duplicate key value violates unique constraint 'users_email_key'",
    "HINT:  something with Yamada Taro",
  ].join("\n");

  it("メール・名前・行の 中身を 1文字も 出さない", () => {
    const out = redactLog(log).join("\n");
    expect(out).not.toMatch(/example\.com|yamada|tanaka|Yamada/i);
  });

  it("どの ファイルの 何行目か・どの 表かは 残す（直しに 要る）", () => {
    const out = redactLog(log);
    expect(out[0]).toBe('ERROR data.sql:120 invalid input syntax for type uuid: "…"');
    expect(out[1]).toBe("  （users の 3行目）");
  });

  it("DB の 部品の 名前（role・relation・column など）は 伏せない（直すのに 要る）", () => {
    const out = redactLog(
      [
        'psql:/tmp/roles.sql:13: ERROR:  role "supabase_etl_admin" does not exist',
        'ERROR:  column "is_anonymous" of relation "users" does not exist',
        'ERROR:  invalid input syntax for type uuid: "yamada@example.com"',
      ].join("\n"),
    );
    expect(out).toEqual([
      'ERROR roles.sql:13 role "supabase_etl_admin" does not exist',
      'ERROR column "is_anonymous" of relation "users" does not exist',
      'ERROR invalid input syntax for type uuid: "…"',
    ]);
  });

  it("ERROR が 無い ログは 何も 出さない（中身を 含む かも しれない ため）", () => {
    expect(redactLog("COPY 35\nsomething else")).toEqual([expect.stringContaining("出しません")]);
  });
});

describe("リポジトリに 置く もの", () => {
  it("暗号化の 宛先は age の 公開鍵だけ。秘密鍵は 置かない", () => {
    const text = readFileSync(join(ROOT, "scripts/db_backup_recipients.txt"), "utf8");
    expect(text).not.toMatch(/AGE-SECRET-KEY-1[0-9A-Z]{20,}/i);
    const recipients = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    expect(recipients.length).toBeGreaterThan(0);
    for (const recipient of recipients) expect(recipient).toMatch(/^age1[02-9ac-hj-np-z]{58}$/);
  });

  it("ワークフローは 書き出しを artifact に しない・版を 固定する・run の 中に 式を 書かない", () => {
    const text = readFileSync(join(ROOT, ".github/workflows/backup.yml"), "utf8");
    // コメントは 理由を 書く 場所なので 見ない（「@latest を 使わない」と 書いて ある）
    const yml = text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(yml).not.toMatch(/upload-artifact/);
    expect(yml).not.toMatch(/@latest/);
    expect(yml).not.toMatch(/toJSON\(secrets\)/);
    expect(yml).toMatch(/SUPABASE_CLI: supabase@\d+\.\d+\.\d+\n/);
    expect(yml).toMatch(/environment: Preview/);

    // run: の ブロックの 中に `${{ }}` が 無い（secrets は env: で だけ 渡す。docs/deploy.md §0.16）
    const lines = yml.split("\n");
    let inRun = false;
    let runIndent = 0;
    for (const line of lines) {
      const indent = line.length - line.trimStart().length;
      const runStart = /^(\s*)(?:- )?run: ?(.*)$/.exec(line);
      if (runStart) {
        inRun = true;
        runIndent = runStart[1]!.length;
        expect(runStart[2]).not.toMatch(/\$\{\{/);
        continue;
      }
      if (inRun && line.trim() && indent <= runIndent) inRun = false;
      if (inRun) expect(line).not.toMatch(/\$\{\{/);
    }
  });
});
