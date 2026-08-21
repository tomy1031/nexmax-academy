import { describe, expect, it } from "vitest";
import {
  AFFILIATIONS,
  formatSchool,
  isSchoolChosen,
  isStaff,
  isUniversity,
  STAFF_AFFILIATION,
  UNIVERSITIES,
} from "../src/lib/school";

/**
 * 所属に「講師・スタッフ」を足した ときの きまり（願い #153-6）。
 *
 * いちばん こわいのは **先生が `/welcome` に 送り返される** こと。
 * 期生の いらない 所属に 期生を 求めると、`isSchoolChosen` が いつまでも false に なり、
 * `/welcome` と `/map` を 往復して 詰む（`src/app/welcome/page.tsx`・`map-shell.tsx`）。
 */
describe("所属（学校／講師・スタッフ）", () => {
  it("学習者が えらべる のは 学校だけ（講師・スタッフを 出さない）", () => {
    expect([...UNIVERSITIES]).toEqual(["AUPP", "CADT"]);
    expect(UNIVERSITIES).not.toContain(STAFF_AFFILIATION);
  });

  it("先生の 画面では 学校＋講師・スタッフ が えらべる", () => {
    expect([...AFFILIATIONS]).toEqual(["AUPP", "CADT", STAFF_AFFILIATION]);
  });

  it("講師・スタッフも 正しい 所属として 通る", () => {
    expect(isUniversity(STAFF_AFFILIATION)).toBe(true);
    expect(isStaff(STAFF_AFFILIATION)).toBe(true);
    expect(isStaff("AUPP")).toBe(false);
    expect(isUniversity("NUM")).toBe(false);
  });

  it("講師・スタッフは 期生ゼロでも「えらび おわった」あつかい", () => {
    expect(isSchoolChosen({ university: STAFF_AFFILIATION, cohort: 0 })).toBe(true);
  });

  it("学校は これまでどおり 期生も そろって いないと 通らない", () => {
    expect(isSchoolChosen({ university: "AUPP", cohort: 0 })).toBe(false);
    expect(isSchoolChosen({ university: "AUPP", cohort: 3 })).toBe(true);
    expect(isSchoolChosen({ university: "", cohort: 3 })).toBe(false);
    expect(isSchoolChosen(null)).toBe(false);
  });

  it("講師・スタッフの 表示に 期生を つけない", () => {
    expect(formatSchool({ university: STAFF_AFFILIATION, cohort: 0 })).toBe(STAFF_AFFILIATION);
    // DB に 期生が 残って いても、表示には ひきずり出さない
    expect(formatSchool({ university: STAFF_AFFILIATION, cohort: 3 })).toBe(STAFF_AFFILIATION);
    expect(formatSchool({ university: "CADT", cohort: 2 })).toBe("CADT 2期生");
    expect(formatSchool({ university: "", cohort: 0 })).toBe("");
  });
});
