import { describe, expect, it } from "vitest";
import {
  connectorHandbook,
  parseMigrationList,
  pendingMigrations,
  readRepoMigrations,
} from "../scripts/check_migrations.mjs";

/**
 * 移行SQLの流し忘れを見つける見張り（2026-08-26 の事故）。
 *
 * `20260824090000_register_profile_on_login.sql` が2日間 流されないまま、
 * それに依存する直しを2本 本番へ出していた。単体テストも e2e も CI も全部 緑で、
 * **DB だけが遅れていた**。気づいたのは、たまたま DB を覗いたときである
 * （30人がログイン済みなのに、先生の名簿には23人）。
 *
 * ここが見張るのは1つ: **リポジトリにあって DB に無いものを、必ず数え上げる**。
 */

describe("リポジトリの移行SQLを読む", () => {
  it("ファイル名から版と名前を取り、版の順に並べる", () => {
    const found = readRepoMigrations([
      "20260824090000_register_profile_on_login.sql",
      "20260725090000_profiles.sql",
      "20260811100000_profile_names.sql",
    ]);
    expect(found.map((m) => m.version)).toEqual([
      "20260725090000",
      "20260811100000",
      "20260824090000",
    ]);
    expect(found[0]!.name).toBe("profiles");
  });

  it("移行SQLでないものは数えない（README・書きかけ・別の拡張子）", () => {
    const found = readRepoMigrations([
      "README.md",
      "20260725090000_profiles.sql",
      "profiles.sql", // 版が無い
      "2026072509_short.sql", // 桁が足りない
      "20260725090000_profiles.sql.bak",
    ]);
    expect(found).toHaveLength(1);
  });
});

describe("DBに記録ずみの版を読む", () => {
  /** `supabase migration list` の表。Local だけ立っている行が「流し忘れ」。 */
  const OUTPUT = [
    "        Local          |        Remote         |     Time (UTC)",
    "  ---------------------|-----------------------|---------------------",
    "   20260725090000      |    20260725090000     | 2026-07-25 09:00:00",
    "   20260824090000      |                       |",
  ].join("\n");

  it("Remote 側に立っている版だけを「適用ずみ」と数える", () => {
    const applied = parseMigrationList(OUTPUT);
    expect(applied.has("20260725090000")).toBe(true);
    // ここを取りちがえると、流し忘れを「流れている」と報告してしまう——
    // それはこの見張りが**無いより悪い**状態である。
    expect(applied.has("20260824090000")).toBe(false);
  });

  /**
   * いまの supabase CLI は 版を バックティックで 囲んで 出す。
   * 素の 14桁で 突き合わせて いた ころは **1つも 拾えず「全部 流し忘れ」**に なった
   * （2026-09-04。DB は 30本 とも そろって いたのに 赤くなった）。
   */
  it("版がバックティックで囲まれていても読む（supabase CLI の いまの 出力）", () => {
    const quoted = [
      "   Local            | Remote           | Time (UTC)            ",
      "  ------------------|------------------|-----------------------",
      "   `20260725090000` | `20260725090000` | `2026-07-25 09:00:00` ",
      "   `20260824090000` |                  |                       ",
    ].join("\n");
    const applied = parseMigrationList(quoted);
    expect(applied.has("20260725090000")).toBe(true);
    expect(applied.has("20260824090000")).toBe(false);
  });

  it("表でない行（見出し・空行）を数えない", () => {
    expect(parseMigrationList("Connecting to remote database...\n\n").size).toBe(0);
  });
});

describe("流し忘れを数え上げる", () => {
  const repo = readRepoMigrations([
    "20260725090000_profiles.sql",
    "20260824090000_register_profile_on_login.sql",
  ]);

  it("DBに無いものを返す（2026-08-26 に実際に起きた形）", () => {
    const pending = pendingMigrations(repo, new Set(["20260725090000"]));
    expect(pending.map((m) => m.name)).toEqual(["register_profile_on_login"]);
  });

  it("全部そろっていれば空", () => {
    const applied = new Set(["20260725090000", "20260824090000"]);
    expect(pendingMigrations(repo, applied)).toHaveLength(0);
  });

  it("DBにだけある版は流し忘れではない（ダッシュボードで直に入れたものなど）", () => {
    const applied = new Set(["20260725090000", "20260824090000", "20260727013141"]);
    expect(pendingMigrations(repo, applied)).toHaveLength(0);
  });
});

/*
 * 鍵が 無い ときに **どこへ 送るか**。
 *
 * 前は「『デプロイ（DB）』ワークフローで流す」とだけ 言って いた。ところが
 * その ワークフローは **まさに 鍵が 無くて 動かない**ので、読んだ 側は
 * 行き止まりに 送られる（2026-08-26・2026-08-27 と 2回、14秒で 落ちた）。
 * 2026-08-27 の 決定「両方」に 合わせ、鍵が 入るまでの 手＝コネクタの 手順を 出す。
 */
describe("鍵が 無い ときの 手順書", () => {
  const repo = [
    { version: "20260824090000", name: "register_profile_on_login", file: "a.sql" },
    { version: "20260827120000", name: "release_kaisha_stage_to_git", file: "b.sql" },
  ];

  it("コネクタで 流す 手を 出す", () => {
    expect(connectorHandbook(repo)).toContain("コネクタ");
  });

  /*
   * ここを 抜かすと、鍵が 入った 日に ワークフローが **もう 手で 流した ぶんを
   * もう一度 流そうとする**。記録の SQL まで 出すのは そのため。
   */
  it("版を 記録する SQL を、いちばん 新しい 版で 出す", () => {
    const text = connectorHandbook(repo);
    expect(text).toContain("supabase_migrations.schema_migrations");
    expect(text).toContain("20260827120000");
    expect(text).toContain("release_kaisha_stage_to_git");
  });

  it("1本も 無くても 落ちない", () => {
    expect(connectorHandbook([])).toContain("<版>");
  });
});
