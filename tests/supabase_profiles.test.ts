import { describe, expect, it } from "vitest";
import { profileProblems, profileSecrets } from "../scripts/lib/supabase_profiles.mjs";

const REF = "abcdefghijklmnopqrst";
const POOLER = ["postgre", "sql://"].join("");
const good = {
  ref: REF,
  dbUrl: `${POOLER}postgres.${REF}:pw@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  anonKey: "sb_publishable_AbCdEf123456_xyz",
};

describe("profileSecrets（切り替え先の値から、GitHub に入れる3つを作る）", () => {
  it("DB の接続文字列・公開の URL・公開の鍵の3つになる", () => {
    expect(profileSecrets(good)).toEqual([
      ["SUPABASE_DB_URL", good.dbUrl],
      ["NEXT_PUBLIC_SUPABASE_URL", `https://${REF}.supabase.co`],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", good.anonKey],
    ]);
  });
});

describe("profileProblems（保存する値の取り違えを止める）", () => {
  it("正しい値は通す", () => {
    expect(profileProblems(good)).toEqual([]);
  });

  it("別のプロジェクトの接続文字列を混ぜたら止める", () => {
    const other = { ...good, dbUrl: good.dbUrl.replace(REF, "zzzzzzzzzzzzzzzzzzzz") };
    expect(profileProblems(other).join()).toContain("別のプロジェクト");
  });

  it("直結（db.<ref>.supabase.co）や Transaction pooler（:6543）は止める", () => {
    const direct = {
      ...good,
      dbUrl: `${POOLER}postgres.${REF}:pw@db.${REF}.supabase.co:5432/postgres`,
    };
    const transaction = { ...good, dbUrl: good.dbUrl.replace(":5432/", ":6543/") };
    expect(profileProblems(direct).join()).toContain("Session pooler");
    expect(profileProblems(transaction).join()).toContain("Session pooler");
  });

  it("鍵や ref が無ければ止める", () => {
    expect(profileProblems({})).not.toEqual([]);
    expect(() => profileSecrets({ ...good, anonKey: "" })).toThrow();
  });
});
