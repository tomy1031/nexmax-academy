import { describe, expect, it } from "vitest";
import {
  areNamesValid,
  buildDisplayName,
  buildFullName,
  hasLearnerNames,
  isKatakanaName,
  katakanaNotice,
  katakanaOrEmpty,
  KATAKANA_HINT,
  MAX_NAME_LENGTH,
  normalizeName,
  TOO_LONG_HINT,
} from "@/lib/name";

describe("normalizeName", () => {
  it("半角カタカナを全角にそろえる（日本語IMEが出す形をそのまま通せるように）", () => {
    expect(normalizeName("ｿﾋﾟｱ")).toBe("ソピア");
    expect(normalizeName("ｳﾞｨﾎﾞﾙ")).toBe("ヴィボル");
  });

  it("全角スペースを半角にし、前後と重なりを落とす", () => {
    expect(normalizeName("　ソク　　ソピア　")).toBe("ソク ソピア");
  });
});

describe("isKatakanaName", () => {
  it("カタカナ・長音符・中点・語間のスペースを通す", () => {
    for (const name of ["ソピア", "ダラー", "ソク・ソピア", "ソク ソピア", "ヴィボル"]) {
      expect(isKatakanaName(name), name).toBe(true);
    }
  });

  it("ローマ字・ひらがな・漢字・空は通さない", () => {
    for (const name of ["Sophea", "そぴあ", "田中", "", "ソピアA"]) {
      expect(isKatakanaName(name), name).toBe(false);
    }
  });
});

describe("katakanaNotice", () => {
  it("未入力には注意を出さない（打つ前に赤い字を見せない）", () => {
    expect(katakanaNotice("")).toBeNull();
    expect(katakanaNotice("   ")).toBeNull();
  });

  it("カタカナなら注意を出さない", () => {
    expect(katakanaNotice("ソピア")).toBeNull();
    expect(katakanaNotice("ｿﾋﾟｱ")).toBeNull();
  });

  it("カタカナでなければ書き直しを案内する", () => {
    expect(katakanaNotice("Sophea")).toBe(KATAKANA_HINT);
    expect(katakanaNotice("そぴあ")).toBe(KATAKANA_HINT);
  });

  it("長すぎるときは長さの案内を出す", () => {
    expect(katakanaNotice("ア".repeat(MAX_NAME_LENGTH))).toBeNull();
    expect(katakanaNotice("ア".repeat(MAX_NAME_LENGTH + 1))).toBe(TOO_LONG_HINT);
  });

  it("学習者に見せる案内に禁止語（AGENTS.md 規律1）を使わない", () => {
    for (const message of [KATAKANA_HINT, TOO_LONG_HINT]) {
      for (const banned of ["不正解", "間違い", "ダメ"]) {
        expect(message).not.toContain(banned);
      }
    }
  });
});

describe("areNamesValid", () => {
  const names = { familyName: "ソク", givenName: "ソピア", nickname: "ソピア" };

  it("苗字と名前がカタカナならよい", () => {
    expect(areNamesValid(names)).toBe(true);
  });

  it("呼んでほしい名前は空でもよい（任意の欄）", () => {
    expect(areNamesValid({ ...names, nickname: "" })).toBe(true);
  });

  it("苗字か名前が欠けている・カタカナでないなら保存させない", () => {
    expect(areNamesValid({ ...names, familyName: "" })).toBe(false);
    expect(areNamesValid({ ...names, givenName: "" })).toBe(false);
    expect(areNamesValid({ ...names, familyName: "Sok" })).toBe(false);
    expect(areNamesValid({ ...names, givenName: "そぴあ" })).toBe(false);
    expect(areNamesValid({ ...names, nickname: "Sophea" })).toBe(false);
  });
});

describe("buildDisplayName", () => {
  it("呼んでほしい名前があればそれを呼び名にする", () => {
    expect(buildDisplayName({ familyName: "ソク", givenName: "ソピア", nickname: "ピア" })).toBe(
      "ピア",
    );
  });

  it("呼んでほしい名前が無ければ名前を呼び名にする", () => {
    expect(buildDisplayName({ familyName: "ソク", givenName: "ソピア", nickname: "" })).toBe(
      "ソピア",
    );
  });

  it("名前も無ければ苗字を呼び名にする", () => {
    expect(buildDisplayName({ familyName: "ソク", givenName: "", nickname: "" })).toBe("ソク");
  });
});

describe("buildFullName", () => {
  it("苗字を先に並べる（カンボジアの並び）", () => {
    expect(buildFullName({ familyName: "ソク", givenName: "ソピア" })).toBe("ソク ソピア");
  });

  it("片方しか無いときに余分なスペースを残さない", () => {
    expect(buildFullName({ familyName: "", givenName: "ソピア" })).toBe("ソピア");
  });
});

describe("hasLearnerNames", () => {
  it("苗字と名前がそろっているときだけ true", () => {
    expect(hasLearnerNames({ familyName: "ソク", givenName: "ソピア" })).toBe(true);
    expect(hasLearnerNames({ familyName: "ソク", givenName: "" })).toBe(false);
    expect(hasLearnerNames({ familyName: "", givenName: "ソピア" })).toBe(false);
    expect(hasLearnerNames(null)).toBe(false);
  });
});

describe("katakanaOrEmpty", () => {
  it("Google の名前がカタカナなら初期値に使う", () => {
    expect(katakanaOrEmpty("ソピア")).toBe("ソピア");
    expect(katakanaOrEmpty("ｿﾋﾟｱ")).toBe("ソピア");
  });

  it("ローマ字・未設定なら欄を空のままにする", () => {
    expect(katakanaOrEmpty("Sophea")).toBe("");
    expect(katakanaOrEmpty(null)).toBe("");
    expect(katakanaOrEmpty(undefined)).toBe("");
  });
});
