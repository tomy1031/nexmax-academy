import { describe, expect, it } from "vitest";
import {
  PERSONALITY_AXES,
  PERSONALITY_AXIS_META,
  PERSONALITY_QUESTIONS,
  PERSONALITY_TYPES,
  calculatePersonalityScores,
  getPoleFromCode,
  pickPersonalityCode,
  type PersonalityAnswer,
  type PersonalityAxis,
  type PersonalityScores,
  type PersonalityTypeCode,
} from "../src/content/personality";
import { FORBIDDEN_LEARNER_WORDS } from "../src/content/schema";
import { TEACHING_HINTS } from "../src/content/teaching-hints";
import type { StatsProfile } from "../src/lib/personality-stats";
import {
  SKEW_MIN_RESPONDENTS,
  buildStudentHints,
  findSkewedQuestionIds,
} from "../src/lib/teaching-hints";

/* ---------------- fixture ---------------- */

/** 各軸で「左の極（E/S/T/J）」を選ぶ設問数を指定して回答列を作る（軸内の先頭の設問から選ぶ）。 */
function answersWithFirstPoleCounts(counts: Record<PersonalityAxis, number>): PersonalityAnswer[] {
  const seen: Record<PersonalityAxis, number> = { ei: 0, sn: 0, tf: 0, jp: 0 };
  return PERSONALITY_QUESTIONS.map((question) => {
    const position = seen[question.axis];
    seen[question.axis] += 1;
    const firstPole = PERSONALITY_AXIS_META[question.axis].poles[0];
    const wantsFirstPole = position < counts[question.axis];
    return wantsFirstPole === (question.a.pole === firstPole) ? "a" : "b";
  });
}

/** 回答列と矛盾しないスコア・タイプを持つプロフィール。type を渡すと手動変更行を作れる。 */
function profileOf(
  id: string,
  answers: PersonalityAnswer[],
  type?: PersonalityTypeCode,
): StatsProfile {
  const scores = calculatePersonalityScores(answers);
  return {
    id,
    display_name: id,
    email: `${id}@example.com`,
    gender: "male",
    personality_type: type ?? pickPersonalityCode(scores),
    answers,
    scores,
    personality_version: 3,
  };
}

/** コードと矛盾しない全問決定的（各軸 5-0）の回答列。 */
function answersForCode(code: PersonalityTypeCode): PersonalityAnswer[] {
  return PERSONALITY_QUESTIONS.map((question) =>
    question.a.pole === getPoleFromCode(code, question.axis) ? "a" : "b",
  );
}

const Q13_INDEX = PERSONALITY_QUESTIONS.findIndex((question) => question.id === 13);

/**
 * Q13（ei 軸）だけ全員が同じ側（I）を選び、他の設問は半々に割れるコホートを作る。
 * パターンA=全問Ⓐ（Q13 のⒶは I）、パターンB=Q13 だけⒶで残りⒷ。
 */
function skewedCohort(aCount: number, bCount: number): StatsProfile[] {
  const allA = PERSONALITY_QUESTIONS.map((): PersonalityAnswer => "a");
  const allBExceptQ13 = PERSONALITY_QUESTIONS.map((_, index): PersonalityAnswer =>
    index === Q13_INDEX ? "a" : "b",
  );
  return [
    ...Array.from({ length: aCount }, (_, i) => profileOf(`a${i}`, [...allA])),
    ...Array.from({ length: bCount }, (_, i) => profileOf(`b${i}`, [...allBExceptQ13])),
  ];
}

/**
 * ei が 4-1 で I 側に決定的、ただしその1点ぶんを Q13 が支えている生徒。
 * Q13 を偏り設問として除くと ei は実質 3-1（差2）になり、決定的から外れる（08 §3.3）。
 * 他の軸は 5-0 の決定的。
 */
const studentLeaningOnQ13 = () =>
  profileOf("student", answersWithFirstPoleCounts({ ei: 1, sn: 5, tf: 5, jp: 5 }));

/* ---------------- 選択ロジック（08 §6.2） ---------------- */

describe("僅差軸の除外（§6.2-1）", () => {
  it("僅差（3-2）の軸の hint を返さない — 全16パターン網羅", () => {
    // 各軸を「僅差（3-2）」か「決定的（5-0）」のどちらかにした 2^4 = 16 通りを尽くす。
    for (let mask = 0; mask < 16; mask += 1) {
      const closeAxes = PERSONALITY_AXES.filter((_, index) => (mask & (1 << index)) !== 0);
      const decisiveAxes = PERSONALITY_AXES.filter((axis) => !closeAxes.includes(axis));
      const counts = { ei: 5, sn: 5, tf: 5, jp: 5 } as Record<PersonalityAxis, number>;
      for (const axis of closeAxes) counts[axis] = 3;

      const result = buildStudentHints(profileOf("s", answersWithFirstPoleCounts(counts)), []);

      for (const hint of result.hints) {
        expect(closeAxes).not.toContain(hint.axis);
      }
      // 台帳が8極を覆っているので、決定的な軸には（上限3件まで）必ず hint が付く。
      expect(result.hints.map((hint) => hint.axis)).toEqual(decisiveAxes.slice(0, 3));
      expect(result.closeAxes).toEqual(closeAxes);
      expect(result.droppedBySkew).toEqual([]);
    }
  });
});

describe("全軸僅差（§6.2-2）", () => {
  it("全軸 3-2 の生徒には hints を出さない（0件は正規の出力）", () => {
    // §6.2-1 に包含されるが、「言えることがない」が最重要の出力なので独立させる（08 §3.4）。
    const result = buildStudentHints(
      profileOf("s", answersWithFirstPoleCounts({ ei: 3, sn: 3, tf: 3, jp: 3 })),
      [],
    );
    expect(result.hints).toEqual([]);
    expect(result.closeAxes).toEqual(["ei", "sn", "tf", "jp"]);
  });
});

describe("個別カードの add-scaffold 除外（§6.2-3）", () => {
  it("16タイプすべて（全軸決定的）で、個別の hint に add-scaffold が混ざらない", () => {
    for (const type of PERSONALITY_TYPES) {
      const result = buildStudentHints(profileOf("s", answersForCode(type.code)), []);
      expect(result.hints.length).toBeGreaterThan(0);
      for (const hint of result.hints) {
        expect(hint.direction).not.toBe("add-scaffold");
        expect(hint.pole).toBe(getPoleFromCode(type.code, hint.axis));
      }
    }
  });
});

describe("偏り設問の除外（§6.2-4・§6.2-5）", () => {
  it("偏り設問を除くと決定的でなくなる軸が droppedBySkew に落ち、hint が出ない", () => {
    const student = studentLeaningOnQ13();
    const cohort = [...skewedCohort(5, 5), student];

    // Q13 は 11/11 で一方に偏り、他の設問は 6/11 以下にとどまる。
    expect(findSkewedQuestionIds(cohort)).toEqual(new Set([13]));

    const result = buildStudentHints(student, cohort);
    expect(result.droppedBySkew).toEqual(["ei"]);
    expect(result.hints.map((hint) => hint.axis)).toEqual(["sn", "tf", "jp"]);
  });

  it("回答者8人未満のコホートでは偏り判定をしない", () => {
    const student = studentLeaningOnQ13();
    const cohort = [...skewedCohort(3, 2), student];
    expect(cohort.length).toBeLessThan(SKEW_MIN_RESPONDENTS);

    expect(findSkewedQuestionIds(cohort)).toEqual(new Set());

    const result = buildStudentHints(student, cohort);
    expect(result.droppedBySkew).toEqual([]);
    // ei は 4-1 のまま決定的として扱われ、I 側の hint が出る（上限3件なので jp は載らない）。
    expect(result.hints.map((hint) => hint.axis)).toEqual(["ei", "sn", "tf"]);
    expect(result.hints[0]?.pole).toBe("I");
  });
});

describe("手動変更行（§6.2-8）", () => {
  it("スコアから導いたコードと personality_type が食い違う行には何も出さない", () => {
    const answers = answersForCode("ESTJ");
    const result = buildStudentHints(profileOf("s", answers, "INFP"), []);
    expect(result.hints).toEqual([]);
    expect(result.closeAxes).toEqual([]);
    expect(result.droppedBySkew).toEqual([]);
  });
});

describe("壊れたスコア（§6.2-10）", () => {
  it("throw せず、空の結果を返す", () => {
    const valid = profileOf("s", answersForCode("ISTJ"));
    const brokenRows: StatsProfile[] = [
      { ...valid, answers: ["a"] as PersonalityAnswer[] },
      { ...valid, scores: { ei: 99, sn: 0, tf: 0, jp: 0 } as PersonalityScores },
      { ...valid, scores: { leader: 10 } as unknown as PersonalityScores },
      { ...valid, personality_type: "XXXX" as PersonalityTypeCode },
    ];
    for (const row of brokenRows) {
      expect(() => buildStudentHints(row, [row])).not.toThrow();
      expect(buildStudentHints(row, [row])).toEqual({
        hints: [],
        closeAxes: [],
        droppedBySkew: [],
      });
    }
  });
});

/* ---------------- 台帳の検収（08 §6.1・§6.2-6/7/9） ---------------- */

describe("定型文台帳", () => {
  it("10〜16件で、axis と pole が食い違っていない", () => {
    expect(TEACHING_HINTS.length).toBeGreaterThanOrEqual(10);
    expect(TEACHING_HINTS.length).toBeLessThanOrEqual(16);
    for (const hint of TEACHING_HINTS) {
      expect(PERSONALITY_AXIS_META[hint.axis].poles).toContain(hint.pole);
    }
  });

  it("すべての hint に空でない counterSign があり、action と同一でない（§6.2-6）", () => {
    for (const hint of TEACHING_HINTS) {
      expect(hint.action.length).toBeGreaterThan(0);
      expect(hint.counterSign.length).toBeGreaterThan(0);
      expect(hint.counterSign).not.toBe(hint.action);
    }
  });

  it("8極すべてを、個別に出せる方向（add-scaffold 以外）で覆っている（§6.2-7）", () => {
    for (const axis of PERSONALITY_AXES) {
      for (const pole of PERSONALITY_AXIS_META[axis].poles) {
        const individual = TEACHING_HINTS.filter(
          (hint) => hint.axis === axis && hint.pole === pole && hint.direction !== "add-scaffold",
        );
        expect(individual.length).toBeGreaterThan(0);
      }
    }
  });

  it("禁止語が無い（§6.1 の追加リスト＋学習者向け禁止語）（§6.2-9）", () => {
    const forbidden = [
      // 学習者向けの禁止語定数を再利用して合成する（08 §6.1）。
      ...FORBIDDEN_LEARNER_WORDS,
      // 能力・将来の予測
      "向いていない",
      "素質",
      "伸びにくい",
      "適性",
      // 欠損表現
      "弱い",
      "苦手",
      "できない",
      "劣る",
      "足りない",
      // 人格の固定
      "な性格です",
      "な人間です",
      // 比較・序列
      "いちばん",
      "より",
      // 相性の否定
      "合わない",
      "離した",
      // 測っていないもの
      "ストレス",
      "メンタル",
      "家庭",
      "発達",
      // 警戒
      "要注意",
      "気になる",
    ];
    for (const hint of TEACHING_HINTS) {
      for (const text of [hint.action, hint.counterSign]) {
        for (const word of forbidden) {
          expect(text).not.toContain(word);
        }
        // 4文字コード（ISTJ 等）を文に入れない。
        for (const type of PERSONALITY_TYPES) {
          expect(text).not.toContain(type.code);
        }
      }
    }
  });

  it("action が動詞（〜る／〜す等の終止形）で終わっている", () => {
    for (const hint of TEACHING_HINTS) {
      expect(hint.action).toMatch(/(る|す|く|ぶ|む|つ|う)$/);
    }
  });
});
