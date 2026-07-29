import { describe, expect, it } from "vitest";
import {
  PERSONALITY_AXES,
  PERSONALITY_AXIS_META,
  PERSONALITY_QUESTIONS,
  PERSONALITY_TYPES,
  getPoleFromCode,
  pickPersonalityCode,
  scorePersonality,
  type PersonalityAnswer,
  type PersonalityScores,
  type PersonalityTypeCode,
} from "../src/content/personality";
import type { Gender } from "../src/lib/profile";
import {
  buildTeamSuggestions,
  calculateAxisAverages,
  calculateDashboardKpis,
  calculateExtraversionRatio,
  calculateGenderFamilyMatrix,
  calculateQuestionStats,
  calculateResultChange,
  calculateTeamPenalty,
  calculateTypeDistribution,
  createBalancedTeams,
  PENALTY_SCALE,
  getSampleMode,
  hasCompletedPersonality,
  latestResultsByProfile,
  selectCompletedProfiles,
  type StatsProfile,
} from "../src/lib/personality-stats";

/* ---------------- fixture ---------------- */

/** コードと矛盾しないスコアを作る（各軸は左極なら5、右極なら0）。 */
function scoresForCode(code: PersonalityTypeCode): PersonalityScores {
  const scores: PersonalityScores = { ei: 0, sn: 0, tf: 0, jp: 0 };
  for (const axis of PERSONALITY_AXES) {
    const [first] = PERSONALITY_AXIS_META[axis].poles;
    scores[axis] = getPoleFromCode(code, axis) === first ? 5 : 0;
  }
  return scores;
}

/** コードと矛盾しない回答列を作る。 */
function answersForCode(code: PersonalityTypeCode): PersonalityAnswer[] {
  return PERSONALITY_QUESTIONS.map((question) =>
    question.a.pole === getPoleFromCode(code, question.axis) ? "a" : "b",
  );
}

function profileOfCode(
  id: string,
  code: PersonalityTypeCode,
  options: { gender?: Gender; name?: string; version?: number } = {},
): StatsProfile {
  return {
    id,
    display_name: options.name ?? id,
    email: `${id}@example.com`,
    gender: options.gender ?? "male",
    personality_type: code,
    answers: answersForCode(code),
    scores: scoresForCode(code),
    personality_version: options.version ?? 3,
  };
}

const CLASS_OF_12: readonly PersonalityTypeCode[] = [
  "ISTJ",
  "ISTJ",
  "ENFP",
  "INTJ",
  "ESFJ",
  "ISFP",
  "ENTP",
  "INFJ",
  "ESTP",
  "ISFJ",
  "ENTJ",
  "ENFJ",
];

function classOf12(): StatsProfile[] {
  return CLASS_OF_12.map((code, index) =>
    profileOfCode(`s${String(index).padStart(2, "0")}`, code),
  );
}

describe("fixture の健全性", () => {
  it("コードから作った answers / scores が、そのコードに戻る", () => {
    for (const type of PERSONALITY_TYPES) {
      expect(scorePersonality(answersForCode(type.code))).toBe(type.code);
      expect(pickPersonalityCode(scoresForCode(type.code))).toBe(type.code);
    }
  });
});

/* ---------------- 少数データ規則 ---------------- */

describe("getSampleMode", () => {
  it("0人は empty、1〜2人は counts-only、3人以上は full", () => {
    expect(getSampleMode(0)).toBe("empty");
    expect(getSampleMode(1)).toBe("counts-only");
    expect(getSampleMode(2)).toBe("counts-only");
    expect(getSampleMode(3)).toBe("full");
  });
});

/* ---------------- 完了判定 ---------------- */

describe("hasCompletedPersonality", () => {
  const complete = profileOfCode("a", "ISTJ");

  it("完成した回答は true", () => {
    expect(hasCompletedPersonality(complete)).toBe(true);
  });

  it("回答が19問なら false", () => {
    expect(hasCompletedPersonality({ ...complete, answers: complete.answers.slice(0, 19) })).toBe(
      false,
    );
  });

  it("v2 の回答値（yes）が混ざれば false", () => {
    const answers = [...complete.answers];
    answers[3] = "yes" as unknown as PersonalityAnswer;
    expect(hasCompletedPersonality({ ...complete, answers })).toBe(false);
  });

  it("v2 のスコア形式なら false", () => {
    const scores = { leader: 10, idea: 5, heart: 0, challenge: 0 } as unknown as PersonalityScores;
    expect(hasCompletedPersonality({ ...complete, scores })).toBe(false);
  });

  it("スコアが範囲外・小数なら false", () => {
    expect(hasCompletedPersonality({ ...complete, scores: { ei: 6, sn: 0, tf: 0, jp: 0 } })).toBe(
      false,
    );
    expect(hasCompletedPersonality({ ...complete, scores: { ei: 3.5, sn: 0, tf: 0, jp: 0 } })).toBe(
      false,
    );
  });

  it("タイプが v2 の4値・未知文字列・null なら false", () => {
    for (const broken of ["leader", "XXXX", null, undefined]) {
      expect(
        hasCompletedPersonality({
          ...complete,
          personality_type: broken as unknown as PersonalityTypeCode,
        }),
      ).toBe(false);
    }
  });
});

describe("selectCompletedProfiles", () => {
  const rows = [
    profileOfCode("a", "ISTJ"),
    profileOfCode("b", "INFJ", { version: 2 }),
    { ...profileOfCode("c", "ENTP"), answers: [] as PersonalityAnswer[] },
  ];

  it("版を指定しなければ版で絞らない", () => {
    expect(selectCompletedProfiles(rows).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("版を指定すると、その版だけになる", () => {
    expect(selectCompletedProfiles(rows, 3).map((row) => row.id)).toEqual(["a"]);
  });
});

/* ---------------- タイプ分布 ---------------- */

describe("calculateTypeDistribution", () => {
  it("空でも4家族・各家族4コードを必ず返す", () => {
    const result = calculateTypeDistribution([]);
    expect(result.sampleMode).toBe("empty");
    expect(result.families).toHaveLength(4);
    for (const family of result.families) {
      expect(family.count).toBe(0);
      expect(family.percentage).toBeNull();
      expect(family.codes).toHaveLength(4);
      expect(family.codes.every((code) => code.count === 0)).toBe(true);
    }
  });

  it("1人のときは割合を出さない（06 §6）", () => {
    const result = calculateTypeDistribution([profileOfCode("a", "INFJ")]);
    expect(result.sampleMode).toBe("counts-only");
    const heart = result.families.find((family) => family.family === "heart");
    expect(heart?.count).toBe(1);
    expect(heart?.percentage).toBeNull();
    expect(heart?.codes.find((code) => code.code === "INFJ")?.percentage).toBeNull();
  });

  it("家族内の16コードは0件も落とさず、定義順で固定される", () => {
    const result = calculateTypeDistribution([profileOfCode("a", "INFJ")]);
    const heart = result.families.find((family) => family.family === "heart");
    expect(heart?.codes.map((code) => code.code)).toEqual(["INFJ", "INFP", "ENFJ", "ENFP"]);
    expect(heart?.codes.map((code) => code.count)).toEqual([1, 0, 0, 0]);
  });

  it("割合の母数は家族内ではなく回答者全体", () => {
    const profiles = [
      profileOfCode("a", "ISTJ"),
      profileOfCode("b", "ISFJ"),
      profileOfCode("c", "INFJ"),
      profileOfCode("d", "INFJ"),
    ];
    const result = calculateTypeDistribution(profiles);
    const heart = result.families.find((family) => family.family === "heart");
    expect(heart?.count).toBe(2);
    expect(heart?.percentage).toBe(50);
    // 家族母数（2人中2人=100%）ではなく全体母数（4人中2人=50%）
    expect(heart?.codes.find((code) => code.code === "INFJ")?.percentage).toBe(50);
  });

  it("件数が同数なら PERSONALITY_FAMILIES の定義順で決まる", () => {
    const profiles = [
      profileOfCode("a", "ENTP"),
      profileOfCode("b", "INTJ"),
      profileOfCode("c", "ISTJ"),
      profileOfCode("d", "ISFJ"),
      profileOfCode("e", "INFJ"),
    ];
    const result = calculateTypeDistribution(profiles);
    // leader 2 / idea 2 / heart 1 / challenge 0 → 同数の leader と idea は定義順
    expect(result.families.map((family) => family.family)).toEqual([
      "leader",
      "idea",
      "heart",
      "challenge",
    ]);
  });
});

/* ---------------- 軸平均 ---------------- */

describe("calculateAxisAverages", () => {
  it("空サンプルでは average を 0 ではなく null にする", () => {
    const result = calculateAxisAverages([]);
    expect(result.sampleMode).toBe("empty");
    expect(result.items).toHaveLength(4);
    for (const item of result.items) {
      expect(item.average).toBeNull();
      expect(item.leaning).toBeNull();
    }
  });

  it("軸ごとに {axis, average} のペアで一致する", () => {
    const profile = {
      ...profileOfCode("a", "ISTJ"),
      scores: { ei: 1, sn: 4, tf: 5, jp: 3 } as PersonalityScores,
    };
    const items = calculateAxisAverages([profile]).items;
    expect(items.map((item) => [item.axis, item.average])).toEqual([
      ["ei", 1],
      ["sn", 4],
      ["tf", 5],
      ["jp", 3],
    ]);
  });

  it("割り切れない平均を丸める", () => {
    const values = [0, 1, 3];
    const profiles = values.map((value, index) => ({
      ...profileOfCode(`p${index}`, "ISTJ"),
      scores: { ei: value, sn: 0, tf: 0, jp: 0 } as PersonalityScores,
    }));
    expect(calculateAxisAverages(profiles).items[0]?.average).toBe(1.3);
  });

  it("leaning は 2.5 を境にし、ちょうど 2.5 は null", () => {
    function leaningFor(values: number[]): string | null {
      const profiles = values.map((value, index) => ({
        ...profileOfCode(`p${index}`, "ISTJ"),
        scores: { ei: value, sn: 0, tf: 0, jp: 0 } as PersonalityScores,
      }));
      return calculateAxisAverages(profiles).items[0]?.leaning ?? null;
    }
    expect(leaningFor([5, 5, 5, 1])).toBe("E"); // 4.0
    expect(leaningFor([1, 1, 1, 5])).toBe("I"); // 2.0
    expect(leaningFor([0, 5])).toBeNull(); // ちょうど 2.5
    // 個人判定 getPole のしきい値は3。平均2.8 は getPole なら I 側だが、集計の leaning は E。
    expect(leaningFor([3, 3, 3, 2])).toBe("E"); // 2.75 → 2.8
  });

  it("寄りの判定は丸める前の実平均で行う", () => {
    // 13人・合計32 → 実平均 2.4615…（右極寄り）。表示は 2.5 に丸まるが、
    // 丸めた値で判定すると「どちらでもない」に化ける。
    const values = [5, 5, 5, 5, 5, 5, 2, 0, 0, 0, 0, 0, 0];
    expect(values.reduce((sum, value) => sum + value, 0)).toBe(32);
    const profiles = values.map((value, index) => ({
      ...profileOfCode(`p${index}`, "ISTJ"),
      scores: { ei: value, sn: 0, tf: 0, jp: 0 } as PersonalityScores,
    }));
    const ei = calculateAxisAverages(profiles).items[0];
    expect(ei?.average).toBe(2.5);
    expect(ei?.leaning).toBe("I");
  });

  it("極ごとの人数を返す（平均だけだと二峰性が隠れる）", () => {
    const profiles = [
      profileOfCode("a", "ESTJ"),
      profileOfCode("b", "ESTJ"),
      profileOfCode("c", "ISTJ"),
      profileOfCode("d", "ISTJ"),
    ];
    const ei = calculateAxisAverages(profiles).items.find((item) => item.axis === "ei");
    expect(ei?.average).toBe(2.5);
    expect(ei?.firstPoleCount).toBe(2);
    expect(ei?.secondPoleCount).toBe(2);
  });

  it("壊れたスコアが1件混ざっても、他の学生の平均が壊れない", () => {
    const broken = {
      ...profileOfCode("broken", "ISTJ"),
      scores: {} as unknown as PersonalityScores,
    };
    const profiles = [
      {
        ...profileOfCode("a", "ISTJ"),
        scores: { ei: 4, sn: 0, tf: 0, jp: 0 } as PersonalityScores,
      },
      {
        ...profileOfCode("b", "ISTJ"),
        scores: { ei: 2, sn: 0, tf: 0, jp: 0 } as PersonalityScores,
      },
      broken,
    ];
    expect(calculateAxisAverages(profiles).items[0]?.average).toBe(3);
  });
});

/* ---------------- 設問別分布 ---------------- */

describe("calculateQuestionStats", () => {
  it("空でも設問数ぶんの行を、番号順・軸つきで返す", () => {
    const result = calculateQuestionStats([]);
    expect(result.items).toHaveLength(PERSONALITY_QUESTIONS.length);
    expect(result.items.map((item) => item.questionId)).toEqual(
      PERSONALITY_QUESTIONS.map((question) => question.id),
    );
    expect(result.items.map((item) => item.axis)).toEqual(
      PERSONALITY_QUESTIONS.map((question) => question.axis),
    );
    for (const item of result.items) {
      expect(item.total).toBe(0);
      expect(item.answers.every((answer) => answer.percentage === null)).toBe(true);
    }
  });

  it("1人のとき、選択肢のバケットを順序・極つきで完全一致で見る", () => {
    const result = calculateQuestionStats([profileOfCode("a", "ISTJ")]);
    const first = PERSONALITY_QUESTIONS[0]!;
    // ISTJ は I。Q1 は a=E / b=I なので b が選ばれる。
    expect(result.items[0]?.answers).toEqual([
      { answer: "a", pole: first.a.pole, count: 0, percentage: null },
      { answer: "b", pole: first.b.pole, count: 1, percentage: null },
    ]);
  });

  it("設問ごとに別々に集計している（1行を20回コピーしていない）", () => {
    // ISTJ と ESTJ は ei だけが違う。ei の設問でだけ分布が割れ、他の軸は全員一致する。
    const profiles = [
      profileOfCode("a", "ISTJ"),
      profileOfCode("b", "ESTJ"),
      profileOfCode("c", "ESTJ"),
    ];
    const stats = calculateQuestionStats(profiles).items;

    const q1 = stats.find((item) => item.questionId === 1)!;
    const q2 = stats.find((item) => item.questionId === 2)!;
    expect(q1.answers.map((answer) => answer.count)).toEqual([2, 1]); // a=E が2人
    expect(q2.answers.map((answer) => answer.count)).toEqual([0, 3]); // 全員 S、Q2 は b=S
    expect(q1.answers.map((answer) => answer.count)).not.toEqual(
      q2.answers.map((answer) => answer.count),
    );
  });

  it("同じ Ⓐ でも設問によって極が入れ替わる（07 §3.1）", () => {
    const stats = calculateQuestionStats([]).items;
    const q1 = stats.find((item) => item.questionId === 1)!;
    const q5 = stats.find((item) => item.questionId === 5)!;
    expect(q1.axis).toBe("ei");
    expect(q5.axis).toBe("ei");
    expect(q1.answers[0]?.pole).toBe("E");
    expect(q5.answers[0]?.pole).toBe("I");
  });

  it("v2 の回答値は数えない", () => {
    const broken = {
      ...profileOfCode("x", "ISTJ"),
      answers: Array.from({ length: 20 }, () => "yes") as unknown as PersonalityAnswer[],
    };
    const stats = calculateQuestionStats([broken]).items;
    expect(stats[0]?.total).toBe(0);
    expect(stats[0]?.answers.map((answer) => answer.count)).toEqual([0, 0]);
  });
});

/* ---------------- 性別×家族 ---------------- */

describe("calculateGenderFamilyMatrix", () => {
  it("空でも4家族すべてが0で並ぶ", () => {
    const matrix = calculateGenderFamilyMatrix([]);
    expect(Object.keys(matrix)).toHaveLength(4);
    expect(matrix.leader).toEqual({ male: 0, female: 0, total: 0 });
  });

  it("家族単位で性別を数える", () => {
    const matrix = calculateGenderFamilyMatrix([
      profileOfCode("a", "ISTJ", { gender: "male" }),
      profileOfCode("b", "INFJ", { gender: "female" }),
    ]);
    expect(matrix.leader).toEqual({ male: 1, female: 0, total: 1 });
    expect(matrix.heart).toEqual({ male: 0, female: 1, total: 1 });
    expect(matrix.idea.total).toBe(0);
    expect(matrix.challenge.total).toBe(0);
  });
});

/* ---------------- ペナルティ関数（07 §6.2） ---------------- */

describe("calculateTeamPenalty", () => {
  const members = (codes: PersonalityTypeCode[]) =>
    codes.map((code, index) => profileOfCode(`m${index}`, code));

  it("J が0人なら段取り不在の8点", () => {
    const penalty = calculateTeamPenalty(members(["ESFP", "ISFP"]), 0.5);
    expect(penalty.missingPlanner).toBe(8);
    expect(penalty.missingCarer).toBe(0);
  });

  it("F が0人なら気づかい不在の8点", () => {
    const penalty = calculateTeamPenalty(members(["ESTJ", "ISTJ"]), 0.5);
    expect(penalty.missingCarer).toBe(8);
    expect(penalty.missingPlanner).toBe(0);
  });

  it("家族のかたまりは max(0, 人数-2) × 4", () => {
    expect(calculateTeamPenalty(members(["ISTJ", "ESFJ"]), 0).familyClustering).toBe(0);
    expect(calculateTeamPenalty(members(["ISTJ", "ESFJ", "ISFJ"]), 0).familyClustering).toBe(4);
    expect(
      calculateTeamPenalty(members(["ISTJ", "ESFJ", "ISFJ", "ESTJ"]), 0).familyClustering,
    ).toBe(8);
  });

  it("同一コードの重複は max(0, 人数-1) × 2", () => {
    expect(calculateTeamPenalty(members(["ISTJ", "ENFP"]), 0).duplicateCodes).toBe(0);
    expect(calculateTeamPenalty(members(["ISTJ", "ISTJ"]), 0).duplicateCodes).toBe(2);
    expect(calculateTeamPenalty(members(["ISTJ", "ISTJ", "ISTJ"]), 0).duplicateCodes).toBe(4);
  });

  it("E比率のずれは差 × 2", () => {
    // 全員 E のチーム、クラス全体は 0.5 → |1.0 - 0.5| × 2 = 1.0
    expect(calculateTeamPenalty(members(["ESTJ", "ENFP"]), 0.5).extraversionGap).toBe(1);
  });

  it("空チームはちょうど16点（E比率の項は載せない）", () => {
    // 空チームにE比率は存在しない。0（＝全員I）とみなすと、空チームの評価値がクラスの
    // E比率に応じて上下し、空チームへ置く優先度が理由なく変わる。
    for (const classRatio of [0, 0.5, 1]) {
      const penalty = calculateTeamPenalty([], classRatio);
      expect(penalty.missingPlanner).toBe(8);
      expect(penalty.missingCarer).toBe(8);
      expect(penalty.extraversionGap).toBe(0);
      expect(penalty.total).toBe(16);
    }
  });

  it("5項目が合成される（家族とコードは二重に乗る）", () => {
    // 全員 ISTJ の4人・クラスE比0 → F不在8 + family(4-2)*4=8 + code(4-1)*2=6 + E比0
    expect(calculateTeamPenalty(members(["ISTJ", "ISTJ", "ISTJ", "ISTJ"]), 0)).toMatchObject({
      missingPlanner: 0,
      missingCarer: 8,
      familyClustering: 8,
      duplicateCodes: 6,
      extraversionGap: 0,
      total: 22,
    });
  });

  it("比較用の値は整数で、独立に計算した期待値と一致する", () => {
    // ESTJ + ENFP: J も F もいる（0点）、家族は leader/heart で各1人（0点）、コード重複なし（0点）。
    // 残るは E比率のみ。チームは全員 E なので 1.0、クラス 1/3 → |1 - 1/3| × 2 = 4/3。
    const penalty = calculateTeamPenalty(members(["ESTJ", "ENFP"]), 1 / 3);
    expect(Number.isInteger(penalty.totalScaled)).toBe(true);
    expect(penalty.totalScaled).toBe(Math.round((4 / 3) * PENALTY_SCALE));
  });

  it("倍率が、実運用のクラス規模で異なるペナルティを潰さない", () => {
    // 1000人クラス・6人チームでの E比率の最小刻みは 1/(6×1000)。倍率が小さすぎると
    // 本来ちがう2つの配置が同点に潰れ、同点規則へ誤って流れる。
    const gap = 2 / (6 * 1000);
    expect(Math.round(gap * PENALTY_SCALE)).toBeGreaterThan(0);
  });
});

describe("calculateExtraversionRatio", () => {
  it("空なら0（0除算しない）", () => {
    expect(calculateExtraversionRatio([])).toBe(0);
  });

  it("E の人数比を返す", () => {
    expect(
      calculateExtraversionRatio([
        profileOfCode("a", "ESTJ"),
        profileOfCode("b", "ISTJ"),
        profileOfCode("c", "ISTJ"),
        profileOfCode("d", "ISTJ"),
      ]),
    ).toBe(0.25);
  });
});

/* ---------------- チーム編成 ---------------- */

function classOf(count: number): StatsProfile[] {
  return Array.from({ length: count }, (_, index) =>
    profileOfCode(`s${String(index).padStart(2, "0")}`, PERSONALITY_TYPES[index % 16]!.code),
  );
}

describe("createBalancedTeams — 定員", () => {
  const capacitiesFor = (count: number, teamSize: number) =>
    createBalancedTeams(classOf(count), teamSize).teams.map((team) => team.capacity);

  it("均等割りになり、定員と実人数が一致する", () => {
    expect(capacitiesFor(20, 4)).toEqual([4, 4, 4, 4, 4]);
    expect(capacitiesFor(10, 4)).toEqual([4, 3, 3]);
    expect(capacitiesFor(9, 4)).toEqual([3, 3, 3]);
    expect(capacitiesFor(7, 3)).toEqual([3, 2, 2]);

    const plan = createBalancedTeams(classOf(10), 4);
    expect(plan.teams.map((team) => team.members.length)).toEqual(
      plan.teams.map((team) => team.capacity),
    );
  });

  it("チーム間の人数差は最大1", () => {
    for (let count = 6; count <= 30; count += 1) {
      for (let size = 2; size <= 6; size += 1) {
        const sizes = capacitiesFor(count, size);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("teamSize=2 で人数が奇数なら1人チームが生じる（設計書 §6.1 の断定は成り立たない）", () => {
    // 2人組に奇数人は割り切れず数学的に回避できない。式が正典なので式どおりの挙動を固定する。
    expect(capacitiesFor(3, 2)).toEqual([2, 1]);
    expect(capacitiesFor(5, 2)).toEqual([2, 2, 1]);
  });

  it("1人チームには足りない役割を突きつけず、教師に注記を出す", () => {
    const plan = createBalancedTeams(classOf(5), 2);
    const solo = plan.teams.filter((team) => team.isSolo);
    expect(solo).toHaveLength(1);
    // 1人では J も F も欠けるが、本人に打つ手が無いので警告チップは出さない
    expect(solo[0]?.missingRoles).toEqual([]);
    expect(solo[0]?.members).toHaveLength(1);
    // ペナルティ自体は素の値のまま（編成が1人チームを避けようとするために必要）
    expect(solo[0]?.penalty.total).toBeGreaterThan(0);
    expect(plan.notice).not.toBeNull();
  });

  it("割り切れる人数なら注記を出さず、1人チームも無い", () => {
    const plan = createBalancedTeams(classOf(12), 4);
    expect(plan.notice).toBeNull();
    expect(plan.teams.every((team) => !team.isSolo)).toBe(true);
  });
});

describe("createBalancedTeams — 決定性", () => {
  const idsOf = (plan: ReturnType<typeof createBalancedTeams>) =>
    plan.teams.map((team) => team.members.map((member) => member.id).sort());

  it("同じ入力からは同じ編成", () => {
    const profiles = classOf12();
    expect(JSON.stringify(createBalancedTeams(profiles, 4))).toBe(
      JSON.stringify(createBalancedTeams(profiles, 4)),
    );
  });

  it("入力の並び順を変えても同じ編成になる", () => {
    const forward = createBalancedTeams(classOf12(), 4);
    const reversed = createBalancedTeams([...classOf12()].reverse(), 4);
    const byEmail = createBalancedTeams(
      [...classOf12()].sort((left, right) => right.email.localeCompare(left.email)),
      4,
    );
    expect(idsOf(reversed)).toEqual(idsOf(forward));
    expect(idsOf(byEmail)).toEqual(idsOf(forward));
  });

  it("同名の学生がいても、入力順に依存しない（最終キーが id）", () => {
    // 同じ集合の並べ替えでなければ決定性の検証にならない。profile を1度だけ作り、
    // 配列の順序だけを変える（id とタイプの対応は変えない）。
    const codes: PersonalityTypeCode[] = ["ISTJ", "ISTJ", "ENFP", "ENFP"];
    const roster = ["z1", "z2", "z3", "z4"].map((id, index) =>
      profileOfCode(id, codes[index]!, { name: "同じ名前" }),
    );
    const sorted = (plan: ReturnType<typeof createBalancedTeams>) => idsOf(plan).sort();
    expect(sorted(createBalancedTeams([...roster].reverse(), 2))).toEqual(
      sorted(createBalancedTeams(roster, 2)),
    );
  });

  it("貪欲の同点規則が実際に効く（人数の少ないチーム → 番号の小さいチーム）", () => {
    // 全員同じタイプなので、どのチームに入れても家族・コード・E比の差は出ない。
    // 決めるのは同点規則だけ。1人目は空チーム同士の同点で番号1、以降は人数の少ない方へ。
    const roster = ["a", "b", "c", "d"].map((id) => profileOfCode(id, "ISTJ"));
    const plan = createBalancedTeams(roster, 2);
    expect(plan.teams.map((team) => team.members.map((member) => member.id))).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  it("打ち切りフラグは適用回数の上限とだけ連動する", () => {
    for (const count of [12, 20, 32]) {
      const plan = createBalancedTeams(classOf(count), 4);
      expect(plan.truncated).toBe(plan.swapsApplied === 200);
      expect(plan.swapsApplied).toBeLessThanOrEqual(200);
    }
  });
});

describe("createBalancedTeams — 整合性", () => {
  it("全員がちょうど1回だけ配置される", () => {
    const profiles = classOf12();
    const plan = createBalancedTeams(profiles, 4);
    const assigned = plan.teams.flatMap((team) => team.members.map((member) => member.id));
    expect(assigned).toHaveLength(profiles.length);
    expect(new Set(assigned).size).toBe(profiles.length);
    expect([...assigned].sort()).toEqual(profiles.map((profile) => profile.id).sort());
  });

  it("バランスの取れた12人では、総ペナルティ0まで到達する", () => {
    const plan = createBalancedTeams(classOf12(), 4);
    for (const team of plan.teams) {
      expect(team.missingRoles).toEqual([]);
      // 家族3人以上のかたまりも、同一コードの重複も無い
      expect(team.penalty.familyClustering).toBe(0);
      expect(team.penalty.duplicateCodes).toBe(0);
    }
    expect(plan.totalPenalty).toBe(0);
    expect(plan.swapsApplied).toBe(1);
    expect(plan.truncated).toBe(false);
  });

  it("全員同じタイプなら改善できず、気づかい役の不足が出る", () => {
    const profiles = Array.from({ length: 8 }, (_, index) => profileOfCode(`s${index}`, "ISTJ"));
    const plan = createBalancedTeams(profiles, 4);
    expect(plan.swapsApplied).toBe(0);
    expect(plan.totalPenalty).toBe(44); // 22点 × 2チーム
    for (const team of plan.teams) {
      expect(team.missingRoles).toEqual(["carer"]);
    }
  });

  it("家族の内訳と双極バーを持つ", () => {
    const plan = createBalancedTeams(classOf12(), 4);
    for (const team of plan.teams) {
      const familyTotal = Object.values(team.familyCounts).reduce((sum, count) => sum + count, 0);
      expect(familyTotal).toBe(team.members.length);
      expect(team.axisAverages).toHaveLength(4);
      expect(team.axisAverages.every((item) => item.average !== null)).toBe(true);
    }
  });

  it("大きめのクラスでも上限内に収まり、案が壊れない", () => {
    const plan = createBalancedTeams(classOf(32), 4);
    expect(plan.canBuild).toBe(true);
    expect(plan.swapsApplied).toBeLessThanOrEqual(200);
    const assigned = plan.teams.flatMap((team) => team.members.map((member) => member.id));
    expect(new Set(assigned).size).toBe(32);
  });
});

describe("createBalancedTeams — 入力の境界", () => {
  it("人数が足りなければ案を作らない", () => {
    const plan = createBalancedTeams(classOf(3), 4);
    expect(plan.canBuild).toBe(false);
    expect(plan.reason).not.toBeNull();
    expect(plan.reason).toContain("4");
    expect(plan.teams).toEqual([]);
  });

  it("ちょうど人数が足りれば作る", () => {
    expect(createBalancedTeams(classOf(4), 4).canBuild).toBe(true);
  });

  it("空入力でも例外にせず canBuild:false", () => {
    expect(createBalancedTeams([], 4).canBuild).toBe(false);
  });

  it("クラスに学生が1人しかいなくても、例外にせず理由を返す", () => {
    for (const size of [2, 6]) {
      const plan = createBalancedTeams(classOf(1), size);
      expect(plan.canBuild).toBe(false);
      expect(plan.reason).not.toBeNull();
      expect(plan.teams).toEqual([]);
      expect(plan.notice).toBeNull();
    }
  });

  it("teamSize が範囲外・整数でなければ RangeError", () => {
    const profiles = classOf12();
    for (const size of [1, 7, 2.5, Number.NaN]) {
      expect(() => createBalancedTeams(profiles, size)).toThrow(RangeError);
    }
  });
});

describe("buildTeamSuggestions — 手入れ替え後の再計算（07 §6.4）", () => {
  it("入れ替えた構成でペナルティと警告が計算し直される", () => {
    const cohort = classOf12();
    const plan = createBalancedTeams(cohort, 4);
    const groups = plan.teams.map((team) => [...team.members]);

    const donorIndex = groups[0]!.findIndex(
      (member) => getPoleFromCode(member.personality_type, "tf") === "F",
    );
    const receiverIndex = groups[1]!.findIndex(
      (member) => getPoleFromCode(member.personality_type, "tf") === "T",
    );
    expect(donorIndex).toBeGreaterThanOrEqual(0);
    expect(receiverIndex).toBeGreaterThanOrEqual(0);

    const donor = groups[0]![donorIndex]!;
    groups[0]![donorIndex] = groups[1]![receiverIndex]!;
    groups[1]![receiverIndex] = donor;

    const rebuilt = buildTeamSuggestions(groups, cohort);
    const firstTeam = rebuilt[0]!;
    const hasCarer = firstTeam.members.some(
      (member) => getPoleFromCode(member.personality_type, "tf") === "F",
    );
    expect(firstTeam.missingRoles.includes("carer")).toBe(!hasCarer);
    expect(Object.values(firstTeam.familyCounts).reduce((sum, count) => sum + count, 0)).toBe(
      firstTeam.members.length,
    );
  });
});

/* ---------------- KPI・履歴 ---------------- */

describe("calculateDashboardKpis", () => {
  const now = new Date("2026-07-27T00:00:00Z");
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it("回答済み・未回答・登録数を数える", () => {
    const profiles = [
      profileOfCode("a", "ISTJ"),
      { ...profileOfCode("b", "INFJ"), answers: [] as PersonalityAnswer[] },
    ];
    expect(calculateDashboardKpis(profiles, [], now)).toMatchObject({
      answered: 1,
      unanswered: 1,
      registered: 2,
    });
  });

  it("直近7日の境界を数える（ちょうど7日前は含む）", () => {
    const results = [
      { created_at: daysAgo(6) },
      { created_at: daysAgo(8) },
      { created_at: daysAgo(7) },
    ];
    expect(calculateDashboardKpis([], results, now).recentAnswers).toBe(2);
  });
});

describe("latestResultsByProfile", () => {
  const row = (id: string, profileId: string, createdAt: string) => ({
    id,
    profile_id: profileId,
    personality_type: "ISTJ" as PersonalityTypeCode,
    answers: answersForCode("ISTJ"),
    scores: scoresForCode("ISTJ"),
    personality_version: 3,
    answer_language: null,
    language_switched: false,
    created_at: createdAt,
  });

  it("空なら空", () => {
    expect(latestResultsByProfile([])).toEqual({});
  });

  it("profile_id ごとに最新を残す", () => {
    const latest = latestResultsByProfile([
      row("r1", "p1", "2026-07-01T00:00:00Z"),
      row("r2", "p1", "2026-07-20T00:00:00Z"),
      row("r3", "p2", "2026-07-10T00:00:00Z"),
    ]);
    expect(latest.p1?.id).toBe("r2");
    expect(latest.p2?.id).toBe("r3");
  });

  it("created_at が同値なら id で決着し、入力順に依存しない", () => {
    const same = "2026-07-20T00:00:00Z";
    expect(latestResultsByProfile([row("r1", "p1", same), row("r2", "p1", same)]).p1?.id).toBe(
      "r2",
    );
    expect(latestResultsByProfile([row("r2", "p1", same), row("r1", "p1", same)]).p1?.id).toBe(
      "r2",
    );
  });
});

describe("calculateResultChange", () => {
  const result = (code: PersonalityTypeCode, version = 3) => ({
    personality_type: code,
    scores: scoresForCode(code),
    personality_version: version,
  });

  it("版が違えば比較しない", () => {
    expect(calculateResultChange(result("ISTJ", 3), result("ISTJ", 2))).toEqual({
      comparable: false,
      reason: "version-mismatch",
    });
  });

  it("家族が変わったかを、コードの変化と別に返す", () => {
    expect(calculateResultChange(result("INTJ"), result("ISTJ"))).toMatchObject({
      comparable: true,
      change: {
        typeChanged: true,
        familyChanged: true,
        previousFamily: "leader",
        currentFamily: "idea",
      },
    });

    expect(calculateResultChange(result("ISFJ"), result("ISTJ"))).toMatchObject({
      comparable: true,
      change: { typeChanged: true, familyChanged: false },
    });
  });

  it("差分は左極側の増減で、負の値も出る", () => {
    const current = {
      ...result("ISTJ"),
      scores: { ei: 1, sn: 5, tf: 3, jp: 5 } as PersonalityScores,
    };
    const previous = {
      ...result("ISTJ"),
      scores: { ei: 4, sn: 0, tf: 3, jp: 0 } as PersonalityScores,
    };
    const comparison = calculateResultChange(current, previous);
    expect(comparison.comparable && comparison.change.scoreDeltas).toEqual({
      ei: -3,
      sn: 5,
      tf: 0,
      jp: 5,
    });
  });
});
