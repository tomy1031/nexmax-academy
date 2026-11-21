import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  anonKeyProblems,
  missingMigrations,
  PRIVILEGE_ROWS_SQL,
  privilegeFingerprint,
  privilegeSyncSql,
  projectRefFrom,
} from "../scripts/move_to_new_supabase.mjs";

/** テスト用の JWT（署名はでたらめ。中身だけ読む）。 */
function jwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.c2lnbmF0dXJl`;
}

const REF = "abcdefghijklmnopqrst";

describe("anonKeyProblems（新しいプロジェクトの公開の鍵の取り違えを止める）", () => {
  it("そのプロジェクトの anon の鍵は通す", () => {
    expect(anonKeyProblems(jwt({ ref: REF, role: "anon" }), REF)).toEqual([]);
  });

  it("新しい形の Publishable key は通す", () => {
    expect(anonKeyProblems("sb_publishable_AbCdEf123456_xyz", REF)).toEqual([]);
  });

  it("service_role（秘密の鍵）は止める——ブラウザに配る値になるため", () => {
    const problems = anonKeyProblems(jwt({ ref: REF, role: "service_role" }), REF);
    expect(problems.join()).toContain("service_role");
  });

  it("Secret key（sb_secret_…）は止める", () => {
    expect(anonKeyProblems("sb_secret_AbCdEf123456", REF).join()).toContain("秘密の鍵");
  });

  it("古いプロジェクトの鍵を貼ったら止める", () => {
    const problems = anonKeyProblems(jwt({ ref: "zzzzzzzzzzzzzzzzzzzz", role: "anon" }), REF);
    expect(problems.join()).toContain("別のプロジェクト");
  });

  it("空・途中で切れた文字は止める", () => {
    expect(anonKeyProblems("", REF)).not.toEqual([]);
    expect(anonKeyProblems("eyJhbGciOi", REF)).not.toEqual([]);
    expect(anonKeyProblems("https://abc.supabase.co", REF)).not.toEqual([]);
  });
});

describe("missingMigrations（戻した DB の台帳にリポジトリの移行SQLが全部あるか）", () => {
  it("全部あれば空", () => {
    expect(
      missingMigrations(
        ["20260805001747_studio_assets_bucket.sql", "README.md"],
        ["20260805001747", "20260727013141"],
      ),
    ).toEqual([]);
  });

  it("DB に無い版を返す（DB にだけある古い版は問題にしない）", () => {
    expect(
      missingMigrations(
        ["20260805001747_a.sql", "20261117120000_b.sql", "20261201000000_c.sql"],
        ["20260805001747", "20261117120000", "20260101000000"],
      ),
    ).toEqual(["20261201000000"]);
  });

  it("リポジトリの移行SQLのファイル名は全部「14桁_名前.sql」の形（形が崩れると見落とす）", () => {
    const files = readdirSync(join(__dirname, "..", "supabase", "migrations")).filter((f) =>
      f.endsWith(".sql"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file).toMatch(/^\d{14}_.+\.sql$/);
  });
});

describe("projectRefFrom（貼られた URL から project-ref を取る）", () => {
  it("ダッシュボードの URL・API の URL・ref そのもの、のどれでも読める", () => {
    expect(projectRefFrom(`https://supabase.com/dashboard/project/${REF}`)).toBe(REF);
    expect(projectRefFrom(`https://supabase.com/dashboard/project/${REF}/settings/api-keys`)).toBe(
      REF,
    );
    expect(projectRefFrom(`https://${REF}.supabase.co`)).toBe(REF);
    expect(projectRefFrom(`  ${REF}  `)).toBe(REF);
  });

  it("長さや文字がちがうものは読まない", () => {
    expect(projectRefFrom("")).toBeNull();
    expect(projectRefFrom("abc")).toBeNull();
    expect(projectRefFrom(`${REF}x`)).toBeNull();
    expect(
      projectRefFrom("https://supabase.com/dashboard/project/ABCDEFGHIJKLMNOPQRST"),
    ).toBeNull();
  });
});

describe("privilegeSyncSql（新しい DB の権限を古い DB とそろえる）", () => {
  const schema = [
    'CREATE TABLE "public"."events" ("id" bigint);',
    'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";',
    'GRANT ALL ON TABLE "public"."events" TO "authenticated";',
    'GRANT INSERT ON TABLE "public"."events" TO "anon";',
    'REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;',
    'GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";',
  ].join("\n");
  const sql = privilegeSyncSql(schema);

  it("先に anon・authenticated・service_role の権限を外し、そのあと schema.sql の GRANT / REVOKE を流す", () => {
    const revokeAt = sql.indexOf("FROM anon, authenticated, service_role");
    const replayAt = sql.indexOf('GRANT INSERT ON TABLE "public"."events" TO "anon";');
    expect(revokeAt).toBeGreaterThan(-1);
    expect(replayAt).toBeGreaterThan(revokeAt);
    expect(sql).toContain('REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;');
  });

  it("PUBLIC の権限と、表を作る文・既定の権限の文は流し直さない", () => {
    expect(sql).not.toMatch(/FROM anon, authenticated, service_role, PUBLIC/i);
    expect(sql).not.toContain("CREATE TABLE");
    expect(sql).not.toContain("ALTER DEFAULT PRIVILEGES");
  });

  it("拡張機能の持ち物には触らない", () => {
    expect(sql.match(/deptype = 'e'/g)?.length).toBe(2);
  });

  it("GRANT が1行も無い schema.sql は受け取らない（権限を全部外したままにしない）", () => {
    expect(() => privilegeSyncSql('CREATE TABLE "public"."x" ("id" int);')).toThrow();
  });

  it("権限を並べる SQL は public の表と public・app の関数を数える", () => {
    expect(PRIVILEGE_ROWS_SQL).toContain("n.nspname = 'public'");
    expect(PRIVILEGE_ROWS_SQL).toContain("n.nspname in ('public','app')");
  });
});

describe("privilegeFingerprint（権限の指紋。バックアップに入っている物だけを数える）", () => {
  const schema = [
    'CREATE TABLE "public"."events" ("id" bigint);',
    'CREATE OR REPLACE FUNCTION "app"."is_admin"() RETURNS boolean AS $$ select true $$;',
  ].join("\n");
  const rows = [
    "r\tpublic\tevents\tr:events:postgres:SELECT",
    "r\tpublic\tevents\tr:events:anon:INSERT",
    "f\tapp\tis_admin\tf:app.is_admin():PUBLIC:EXECUTE",
    "f\tpublic\trls_auto_enable\tf:public.rls_auto_enable():postgres:EXECUTE",
    "f\tpublic\trls_auto_enable\tf:public.rls_auto_enable():PUBLIC:EXECUTE",
  ].join("\n");

  it("バックアップに無い物（Supabase が新しいプロジェクトに置く物）は数えず、名前を返す", () => {
    const { fingerprint, extras } = privilegeFingerprint(rows, schema);
    expect(fingerprint.startsWith("3 ")).toBe(true);
    expect(extras).toEqual(["public.rls_auto_enable()"]);
  });

  it("古い DB で SQL が作る値と同じ並べ方（バイトの順・カンマつなぎ）で md5 を取る", () => {
    const expected = createHash("md5")
      .update(
        [
          "f:app.is_admin():PUBLIC:EXECUTE",
          "r:events:anon:INSERT",
          "r:events:postgres:SELECT",
        ].join(","),
      )
      .digest("hex");
    expect(privilegeFingerprint(rows, schema).fingerprint).toBe(`3 ${expected}`);
  });

  it("行の順が変わっても同じ値になる", () => {
    const shuffled = rows.split("\n").reverse().join("\n");
    expect(privilegeFingerprint(shuffled, schema)).toEqual(privilegeFingerprint(rows, schema));
  });
});
