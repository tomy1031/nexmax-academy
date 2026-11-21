import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  anonKeyProblems,
  missingMigrations,
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
