import { describe, expect, it } from "vitest";
import {
  PERSONALITY_AXES,
  PERSONALITY_AXIS_META,
  PERSONALITY_FAMILIES,
  PERSONALITY_QUESTIONS,
  PERSONALITY_TYPES,
  calculatePersonalityScores,
  getCloseAxis,
  getCompatibility,
  getFamilyForCode,
  getPersonalityType,
  isPersonalityScores,
  isPersonalityTypeCode,
  pickPersonalityCode,
  scorePersonality,
  type PersonalityAnswer,
  type PersonalityAxis,
  type PersonalityScores,
  type PersonalityTypeCode,
} from "../src/content/personality";

/** 指定した軸だけ「左の極（E/S/T/J）」を選び、他の軸は右の極を選ぶ回答列を作る。 */
function answersChoosing(firstPoleAxes: readonly PersonalityAxis[]): PersonalityAnswer[] {
  return PERSONALITY_QUESTIONS.map((question) => {
    const wantsFirstPole = firstPoleAxes.includes(question.axis);
    const firstPole = PERSONALITY_AXIS_META[question.axis].poles[0];
    const aIsFirstPole = question.a.pole === firstPole;
    return wantsFirstPole === aIsFirstPole ? "a" : "b";
  });
}

describe("設問データ", () => {
  it("20問あり、各軸5問ずつ", () => {
    expect(PERSONALITY_QUESTIONS).toHaveLength(20);
    for (const axis of PERSONALITY_AXES) {
      expect(PERSONALITY_QUESTIONS.filter((question) => question.axis === axis)).toHaveLength(5);
    }
  });

  it("出題順は EI → SN → TF → JP のローテーション", () => {
    PERSONALITY_QUESTIONS.forEach((question, index) => {
      expect(question.axis).toBe(PERSONALITY_AXES[index % 4]);
      expect(question.id).toBe(index + 1);
    });
  });

  it("Ⓐ／Ⓑ はその軸の2つの極で、重複しない", () => {
    for (const question of PERSONALITY_QUESTIONS) {
      const poles = PERSONALITY_AXIS_META[question.axis].poles;
      expect(poles).toContain(question.a.pole);
      expect(poles).toContain(question.b.pole);
      expect(question.a.pole).not.toBe(question.b.pole);
    }
  });

  it("Ⓐの極が設計書 §3.2 の表どおりに配置されている", () => {
    // EI・TF は各軸の2・4問目、SN・JP は1・3・5問目で Ⓐ が反対側（07 §3.1）。
    const expected = "E N T P I S F J E N T P I S F J E N T P".split(" ");
    expect(PERSONALITY_QUESTIONS.map((question) => question.a.pole)).toEqual(expected);
  });

  it("Ⓐが常に同じ極にならない（各軸で両向きが2問以上）", () => {
    for (const axis of PERSONALITY_AXES) {
      const questions = PERSONALITY_QUESTIONS.filter((question) => question.axis === axis);
      const firstPole = PERSONALITY_AXIS_META[axis].poles[0];
      const aIsFirst = questions.filter((question) => question.a.pole === firstPole).length;
      expect(aIsFirst).toBeGreaterThanOrEqual(2);
      expect(questions.length - aIsFirst).toBeGreaterThanOrEqual(2);
    }
  });

  it("3言語すべてに柱書きと選択肢がそろっている", () => {
    for (const question of PERSONALITY_QUESTIONS) {
      for (const text of [question.easy, question.japanese, question.english]) {
        expect(text.length).toBeGreaterThan(0);
      }
      for (const option of [question.a, question.b]) {
        for (const text of [option.easy, option.japanese, option.english]) {
          expect(text.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("タイプ台帳", () => {
  it("16タイプあり、コードが重複しない", () => {
    expect(PERSONALITY_TYPES).toHaveLength(16);
    expect(new Set(PERSONALITY_TYPES.map((type) => type.code)).size).toBe(16);
  });

  it("4家族に4タイプずつ所属し、家族のcodesと一致する", () => {
    expect(PERSONALITY_FAMILIES).toHaveLength(4);
    for (const family of PERSONALITY_FAMILIES) {
      expect(family.codes).toHaveLength(4);
      for (const code of family.codes) {
        expect(getPersonalityType(code).familyId).toBe(family.id);
      }
    }
  });

  it("家族はケルシー気質（SJ/NT/NF/SP）と一致する", () => {
    const rule: Record<string, string> = { SJ: "leader", NT: "idea", NF: "heart", SP: "challenge" };
    for (const type of PERSONALITY_TYPES) {
      const [, sn, tf, jp] = type.code;
      const keirsey = sn === "S" ? (jp === "J" ? "SJ" : "SP") : tf === "T" ? "NT" : "NF";
      expect(type.familyId).toBe(rule[keirsey]);
      expect(getFamilyForCode(type.code).keirsey).toBe(keirsey);
    }
  });

  it("ひとことは述語で終わる（体言止めを禁止）", () => {
    for (const type of PERSONALITY_TYPES) {
      expect(type.tagline).toMatch(/ます$/);
    }
  });

  it("分析は4行で、最後の1行が「日本の IT の しごとでは」で始まる", () => {
    for (const type of PERSONALITY_TYPES) {
      expect(type.analysis).toHaveLength(4);
      expect(type.analysis[3]).toMatch(/^日本の IT の しごとでは、/);
    }
  });

  it("締め文に「かつやく」「はっき」「たよりに され」を使わない（07 §2）", () => {
    for (const type of PERSONALITY_TYPES) {
      for (const line of type.analysis) {
        expect(line).not.toMatch(/かつやく|はっき|たよりに され/);
      }
    }
  });

  it("学習者向け文言に擬態語・畳語副詞を使わない（07 §2）", () => {
    const banned = /きちんと|はっきり|じっくり|つぎつぎ|さっと|まっすぐ/;
    for (const type of PERSONALITY_TYPES) {
      for (const line of [type.tagline, type.teamRoleDetail, ...type.analysis]) {
        expect(line).not.toMatch(banned);
      }
    }
    for (const question of PERSONALITY_QUESTIONS) {
      for (const line of [question.easy, question.a.easy, question.b.easy]) {
        expect(line).not.toMatch(banned);
      }
    }
  });

  it("禁止語を含まない（01ガイド）", () => {
    const banned = /不正解|間違い|ダメ|ぼうけん|たんけん|クエスト|宝/;
    for (const type of PERSONALITY_TYPES) {
      for (const line of [type.name, type.tagline, type.teamRoleDetail, ...type.analysis]) {
        expect(line).not.toMatch(banned);
      }
    }
  });
});

describe("スコアリング", () => {
  it("各軸の合計は必ず5点になる", () => {
    const cases: PersonalityAxis[][] = [[], ["ei"], ["ei", "sn"], ["ei", "sn", "tf", "jp"]];
    for (const axes of cases) {
      const scores = calculatePersonalityScores(answersChoosing(axes));
      for (const axis of PERSONALITY_AXES) {
        expect(scores[axis]).toBe(axes.includes(axis) ? 5 : 0);
      }
    }
  });

  it("選んだ極に1点ずつ入る", () => {
    const answers = answersChoosing(["ei", "tf"]);
    expect(calculatePersonalityScores(answers)).toEqual({ ei: 5, sn: 0, tf: 5, jp: 0 });
    expect(scorePersonality(answers)).toBe("ENTP");
  });

  it("境界: 3以上が左の極、2以下が右の極", () => {
    expect(pickPersonalityCode({ ei: 3, sn: 3, tf: 3, jp: 3 })).toBe("ESTJ");
    expect(pickPersonalityCode({ ei: 2, sn: 2, tf: 2, jp: 2 })).toBe("INFP");
    expect(pickPersonalityCode({ ei: 5, sn: 0, tf: 3, jp: 2 })).toBe("ENTP");
  });

  it("同点が構造的に起きない（どの回答でも有効なコードになる）", () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const axes = PERSONALITY_AXES.filter((_, index) => (mask & (1 << index)) !== 0);
      expect(isPersonalityTypeCode(scorePersonality(answersChoosing(axes)))).toBe(true);
    }
  });

  it("軸ごとに全32通りの回答を尽くしても、集計と極が一致する（3対2の経路を含む）", () => {
    const axisIndex: Record<PersonalityAxis, number> = { ei: 0, sn: 1, tf: 2, jp: 3 };

    for (const axis of PERSONALITY_AXES) {
      const targets = PERSONALITY_QUESTIONS.filter((question) => question.axis === axis);
      const [firstPole, secondPole] = PERSONALITY_AXIS_META[axis].poles;

      for (let mask = 0; mask < 32; mask += 1) {
        // 対象軸の5問だけ mask に従って極を選び、他の軸は Ⓐ 固定にする。
        const answers = PERSONALITY_QUESTIONS.map((question): PersonalityAnswer => {
          if (question.axis !== axis) return "a";
          const position = targets.indexOf(question);
          const wantsFirstPole = (mask & (1 << position)) !== 0;
          return wantsFirstPole === (question.a.pole === firstPole) ? "a" : "b";
        });

        const expectedCount = [...Array(5).keys()].filter(
          (position) => (mask & (1 << position)) !== 0,
        ).length;
        const scores = calculatePersonalityScores(answers);

        expect(scores[axis]).toBe(expectedCount);
        expect(scorePersonality(answers)[axisIndex[axis]]).toBe(
          expectedCount >= 3 ? firstPole : secondPole,
        );
      }
    }
  });

  it("16タイプすべてがスコアから到達できる", () => {
    const reached = new Set<PersonalityTypeCode>();
    for (let mask = 0; mask < 16; mask += 1) {
      const scores = { ei: 0, sn: 0, tf: 0, jp: 0 } as PersonalityScores;
      PERSONALITY_AXES.forEach((axis, index) => {
        scores[axis] = (mask & (1 << index)) !== 0 ? 3 : 2;
      });
      reached.add(pickPersonalityCode(scores));
    }
    expect(reached.size).toBe(16);
    for (const type of PERSONALITY_TYPES) {
      expect(reached.has(type.code)).toBe(true);
    }
  });

  it("回答が20問そろっていなければ弾く", () => {
    expect(() => scorePersonality(["a"])).toThrow("20もん");
    expect(() =>
      scorePersonality(Array.from({ length: 20 }, () => "x" as PersonalityAnswer)),
    ).toThrow("20もん");
  });

  it("範囲外のスコアを弾く", () => {
    expect(() => pickPersonalityCode({ ei: 6, sn: 0, tf: 0, jp: 0 })).toThrow();
    expect(() => pickPersonalityCode({ ei: 2.5, sn: 0, tf: 0, jp: 0 })).toThrow();
    expect(() => pickPersonalityCode({ ei: -1, sn: 0, tf: 0, jp: 0 })).toThrow();
    expect(() => pickPersonalityCode({ ei: Number.NaN, sn: 0, tf: 0, jp: 0 })).toThrow();
  });

  it("キーの形がちがうスコアを弾く（v2 の4軸や余分なキー）", () => {
    const v2Scores = {
      leader: 10,
      idea: 5,
      heart: 0,
      challenge: 0,
    } as unknown as PersonalityScores;
    expect(() => pickPersonalityCode(v2Scores)).toThrow();

    const extraKey = { ei: 3, sn: 3, tf: 3, jp: 3, extra: 1 } as unknown as PersonalityScores;
    expect(() => pickPersonalityCode(extraKey)).toThrow();

    const missingKey = { ei: 3, sn: 3, tf: 3 } as unknown as PersonalityScores;
    expect(() => pickPersonalityCode(missingKey)).toThrow();
  });

  it("isPersonalityScores がDB境界の値を判定できる", () => {
    expect(isPersonalityScores({ ei: 0, sn: 5, tf: 3, jp: 2 })).toBe(true);
    expect(isPersonalityScores({ ei: 0, sn: 5, tf: 3 })).toBe(false);
    expect(isPersonalityScores({ leader: 1, idea: 2, heart: 3, challenge: 4 })).toBe(false);
    expect(isPersonalityScores({ ei: "3", sn: 3, tf: 3, jp: 3 })).toBe(false);
    expect(isPersonalityScores(null)).toBe(false);
  });
});

describe("僅差の軸（07 §4.3）", () => {
  it("3-2 の軸だけを EI→SN→TF→JP の順で1つ返す", () => {
    expect(getCloseAxis({ ei: 5, sn: 4, tf: 3, jp: 2 })).toBe("tf");
    expect(getCloseAxis({ ei: 2, sn: 3, tf: 5, jp: 0 })).toBe("ei");
    expect(getCloseAxis({ ei: 5, sn: 0, tf: 4, jp: 1 })).toBeNull();
  });

  it("壊れたスコアには僅差表示を返さず弾く", () => {
    const broken = { ei: 2, sn: 99, tf: Number.NaN, jp: -1 } as PersonalityScores;
    expect(() => getCloseAxis(broken)).toThrow();
  });
});

describe("相性カード（07 §5.1）", () => {
  it("4枚が規則どおりに一意に決まる", () => {
    const result = getCompatibility("ESTJ");
    expect(result.similar.map((card) => card.code)).toEqual(["ISTJ", "ESTP"]);
    expect(result.complementary.map((card) => card.code)).toEqual(["INFP", "ENFJ"]);
  });

  it("16タイプすべてで、自分自身が出ない・重複しない・実在コードである", () => {
    for (const type of PERSONALITY_TYPES) {
      const result = getCompatibility(type.code);
      const codes = [...result.similar, ...result.complementary].map((card) => card.code);
      expect(codes).toHaveLength(4);
      expect(new Set(codes).size).toBe(4);
      expect(codes).not.toContain(type.code);
      for (const code of codes) {
        expect(isPersonalityTypeCode(code)).toBe(true);
      }
    }
  });

  it("反転する軸が設計書 §5.1 のとおりに固定されている", () => {
    // ①E/Iだけ ②J/Pだけ ③4つ全部 ④S/NとT/Fだけ。位置は 0=EI, 1=SN, 2=TF, 3=JP。
    const expectedFlips = [[0], [3], [0, 1, 2, 3], [1, 2]];

    for (const type of PERSONALITY_TYPES) {
      const result = getCompatibility(type.code);
      const cards = [...result.similar, ...result.complementary];

      cards.forEach((card, cardIndex) => {
        const flipped = [...card.code]
          .map((letter, index) => (letter === type.code[index] ? null : index))
          .filter((index): index is number => index !== null);
        expect(flipped).toEqual(expectedFlips[cardIndex]);
      });
    }
  });

  it("不正なコードを弾く", () => {
    expect(() => getCompatibility("XXXX" as PersonalityTypeCode)).toThrow();
    expect(() => getCompatibility("ESTJX" as PersonalityTypeCode)).toThrow();
  });

  it("「合わない」枠組みの語を使わない", () => {
    for (const type of PERSONALITY_TYPES) {
      const result = getCompatibility(type.code);
      for (const card of [...result.similar, ...result.complementary]) {
        expect(card.reason).not.toMatch(/合わない|にがて|気を つけて/);
      }
    }
  });
});
