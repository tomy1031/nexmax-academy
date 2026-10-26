import { describe, expect, it } from "vitest";
import type { ProfileRow } from "../src/lib/profile-db";
import {
  readSavedFilter,
  restoreFilter,
  writeSavedFilter,
  writeSavedGroup,
  type FilterStorage,
} from "../src/lib/records/saved-filter";
import { EMPTY_FILTER, pickProfileFilter } from "../src/lib/records/table";

/*
 * 授業ごとの分析を 別の ページ（/admin/class-reports）へ 移した（2026-10-26）。
 * 2つの ページの つなぎ目を 見る——組の 共有と、名前を 押して 学習の きろくへ 行く とき。
 */

function memory(
  initial: Record<string, string> = {},
): FilterStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

const KNOWN = {
  profileIds: new Set(["sok", "aya"]),
  stageIds: new Set(["houkoku"]),
  unitIds: new Set(["houkoku_quiz"]),
};

function profile(over: Partial<ProfileRow> & { id: string }): ProfileRow {
  return {
    email: `${over.id}@example.com`,
    display_name: over.id,
    family_name: "",
    given_name: "",
    nickname: "",
    university: "AUPP",
    cohort: 1,
    gender: null,
    personality_type: null,
    answers: [],
    scores: {} as ProfileRow["scores"],
    personality_version: 3,
    answer_language: null,
    language_switched: false,
    is_admin: false,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("分析の ページで 選んだ 組を 学習の きろくと 共有する", () => {
  it("組を 書きかえ、メンバーの 選びは 外し、ステージ・単元は 残す", () => {
    const storage = memory();
    writeSavedFilter(storage, {
      ...EMPTY_FILTER,
      university: "AUPP",
      cohort: 1,
      profileId: "aya",
      stageId: "houkoku",
      unitId: "houkoku_quiz",
    });
    writeSavedGroup(storage, { university: "CADT", cohort: 3 });
    expect(restoreFilter(readSavedFilter(storage), KNOWN)).toEqual({
      ...EMPTY_FILTER,
      university: "CADT",
      cohort: 3,
      stageId: "houkoku",
      unitId: "houkoku_quiz",
    });
  });

  it("覚えて いる 条件が 無くても 組だけ 書く", () => {
    const storage = memory();
    writeSavedGroup(storage, { university: "AUPP", cohort: 2 });
    expect(restoreFilter(readSavedFilter(storage), KNOWN)).toEqual({
      ...EMPTY_FILTER,
      university: "AUPP",
      cohort: 2,
    });
  });

  it("端末の 保存が 使えなくても 投げない", () => {
    expect(() => writeSavedGroup(null, { university: "AUPP", cohort: 1 })).not.toThrow();
    const broken: FilterStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => writeSavedGroup(broken, { university: "AUPP", cohort: 1 })).not.toThrow();
  });
});

describe("分析の 名前から 学習の きろくを 開く（?profile=）", () => {
  const AYA = profile({ id: "aya", university: "AUPP", cohort: 1 });

  it("組が 合って いれば そのまま、その 生徒を えらぶ", () => {
    expect(
      pickProfileFilter(
        { ...EMPTY_FILTER, university: "AUPP", cohort: 1, stageId: "houkoku" },
        AYA,
      ),
    ).toEqual({
      ...EMPTY_FILTER,
      university: "AUPP",
      cohort: 1,
      stageId: "houkoku",
      profileId: "aya",
    });
  });

  it("組が 合わなければ 組を 外す（メンバーの 一覧に 出ない まま 選ばれない ように）", () => {
    expect(
      pickProfileFilter(
        { ...EMPTY_FILTER, university: "CADT", cohort: 2, unitId: "houkoku_quiz" },
        AYA,
      ),
    ).toEqual({ ...EMPTY_FILTER, unitId: "houkoku_quiz", profileId: "aya" });
  });

  it("いまは 無い 生徒なら 条件を 変えない", () => {
    const filter = { ...EMPTY_FILTER, university: "AUPP" };
    expect(pickProfileFilter(filter, undefined)).toBe(filter);
  });
});
