import { describe, expect, it } from "vitest";
import {
  hasAnyFilter,
  readSavedFilter,
  restoreFilter,
  SAVED_FILTER_KEY,
  writeSavedFilter,
  type FilterStorage,
} from "../src/lib/records/saved-filter";
import { defaultKind, EMPTY_FILTER, listedKinds } from "../src/lib/records/table";

/** 端末の 保存の 代わり（Map で 持つ）。 */
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
  profileIds: new Set(["sok", "sophea"]),
  stageIds: new Set(["houkoku", "renraku"]),
  unitIds: new Set(["houkoku_quiz", "renraku_quiz"]),
};

describe("学習の きろくの 絞り込みを 覚える（願い #599）", () => {
  it("書いた 条件を 次に 開いた とき そのまま 戻す", () => {
    const storage = memory();
    writeSavedFilter(storage, {
      ...EMPTY_FILTER,
      university: "AUPP",
      cohort: 3,
      profileId: "sok",
      stageId: "houkoku",
      unitId: "houkoku_quiz",
    });
    expect(restoreFilter(readSavedFilter(storage), KNOWN)).toEqual({
      university: "AUPP",
      cohort: 3,
      profileId: "sok",
      stageId: "houkoku",
      unitId: "houkoku_quiz",
      text: "",
    });
  });

  it("「ことばで さがす」は 覚えない（開いた とたんに 行が 消えて 見えない ように）", () => {
    const storage = memory();
    writeSavedFilter(storage, { ...EMPTY_FILTER, university: "CADT", text: "けんしゅう" });
    expect(storage.map.get(SAVED_FILTER_KEY)).not.toContain("けんしゅう");
    expect(restoreFilter(readSavedFilter(storage), KNOWN).text).toBe("");
  });

  it("ログアウトの 片づけ（nexmax. で 始まる 鍵）に 消されない 鍵を 使う", () => {
    expect(SAVED_FILTER_KEY.startsWith("nexmax.")).toBe(false);
  });

  it("いまは 無い 学生・ステージ・教材は 戻さない（選びが 見えない まま 効かない）", () => {
    const storage = memory({
      [SAVED_FILTER_KEY]: JSON.stringify({
        university: "AUPP",
        cohort: 2,
        profileId: "gone",
        stageId: "kieta",
        unitId: "nai",
      }),
    });
    expect(restoreFilter(readSavedFilter(storage), KNOWN)).toEqual({
      ...EMPTY_FILTER,
      university: "AUPP",
      cohort: 2,
    });
  });

  it("覚えて いない・壊れて いる・形が ちがう ときは 空の 条件", () => {
    expect(restoreFilter(readSavedFilter(memory()), KNOWN)).toEqual(EMPTY_FILTER);
    expect(
      restoreFilter(readSavedFilter(memory({ [SAVED_FILTER_KEY]: "{こわれた" })), KNOWN),
    ).toEqual(EMPTY_FILTER);
    expect(
      restoreFilter(
        readSavedFilter(
          memory({ [SAVED_FILTER_KEY]: JSON.stringify({ cohort: "3", stageId: 5 }) }),
        ),
        KNOWN,
      ),
    ).toEqual(EMPTY_FILTER);
  });

  it("端末の 保存が 使えなくても 投げない", () => {
    const broken: FilterStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSavedFilter(broken)).toBeNull();
    expect(() => writeSavedFilter(broken, EMPTY_FILTER)).not.toThrow();
    expect(readSavedFilter(null)).toBeNull();
    expect(() => writeSavedFilter(null, EMPTY_FILTER)).not.toThrow();
  });

  it("条件が 1つでも あれば「条件を 外す」を 出す", () => {
    expect(hasAnyFilter(EMPTY_FILTER)).toBe(false);
    expect(hasAnyFilter({ ...EMPTY_FILTER, cohort: 3 })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_FILTER, text: "a" })).toBe(true);
  });
});

describe("修了証は 種類の えらびに 出さない（願い #599）", () => {
  it("記録の ある 種類から 修了証だけを 除く", () => {
    expect(listedKinds(["progress", "quiz", "certificate"])).toEqual(["progress", "quiz"]);
  });

  it("回答の 無い 単元（修了証と 進み具合だけ）でも、既定の 表は 修了証に ならない", () => {
    expect(defaultKind(listedKinds(["progress", "certificate"]))).toBe("progress");
  });

  it("回答が あれば 既定は 回答", () => {
    expect(defaultKind(listedKinds(["progress", "listening", "certificate"]))).toBe("listening");
  });
});
