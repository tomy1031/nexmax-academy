import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  duplicateVersions,
  duplicateVersionsReport,
  readRepoMigrations,
} from "../scripts/check_migrations.mjs";

/**
 * 移行SQLの版（ファイル名の頭の14桁）の重複を、DB に繋がずに止める（2026-10-11 の事故）。
 *
 * `20261011150000_client_error_events.sql` と `20261011150000_class_reports.sql` が
 * 同じ版で integration に入った（#607）。CI は check・e2e・size とも緑だったのに、
 * 「デプロイ（DB）」が `schema_migrations_pkey` の重複で止まり、class_reports の表は
 * 作られなかった（直しは #615）。
 *
 * DB の見張り（check_migrations）は鍵が無いと DB に聞けず、CI の check には鍵が無い。
 * だから **ファイル名だけで分かる** この検査を、check が必ず走らせる単体テストに置く。
 */

describe("版の重複を数える", () => {
  it("同じ版の2本を1組として返す（2026-10-11 に実際に起きた形）", () => {
    const repo = readRepoMigrations([
      "20261011130000_learner_quiz_first_counts.sql",
      "20261011150000_client_error_events.sql",
      "20261011150000_class_reports.sql",
    ]);
    expect(duplicateVersions(repo)).toEqual([
      {
        version: "20261011150000",
        files: ["20261011150000_class_reports.sql", "20261011150000_client_error_events.sql"],
      },
    ]);
  });

  it("版が全部ちがえば空", () => {
    const repo = readRepoMigrations([
      "20261011150000_client_error_events.sql",
      "20261011160000_class_reports.sql",
    ]);
    expect(duplicateVersions(repo)).toEqual([]);
  });

  it("移行SQLでないもの（README など）は数えない", () => {
    const repo = readRepoMigrations(["README.md", "20261011150000_client_error_events.sql"]);
    expect(duplicateVersions(repo)).toEqual([]);
  });
});

describe("知らせる文", () => {
  const report = duplicateVersionsReport([
    {
      version: "20261011150000",
      files: ["20261011150000_class_reports.sql", "20261011150000_client_error_events.sql"],
    },
  ]);

  it("ぶつかったファイル名を全部出す", () => {
    expect(report).toContain("supabase/migrations/20261011150000_class_reports.sql");
    expect(report).toContain("supabase/migrations/20261011150000_client_error_events.sql");
  });

  it("直しかた（空いている版へ改名・開いている PR の版も見る）を出す", () => {
    expect(report).toContain("空いている版へ改名する");
    expect(report).toContain("gh pr view <n> --json files");
  });
});

describe("リポジトリの supabase/migrations/", () => {
  it("同じ版の移行SQLが2本以上ない", () => {
    const repo = readRepoMigrations(readdirSync(join(process.cwd(), "supabase", "migrations")));
    // 見る対象が空だと、この検査は何も見ずに通ってしまう
    expect(repo.length).toBeGreaterThan(0);
    const duplicates = duplicateVersions(repo);
    expect(duplicates, duplicateVersionsReport(duplicates)).toEqual([]);
  });
});
