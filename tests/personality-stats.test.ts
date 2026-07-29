import { describe, expect, it } from "vitest";
import type {
  PersonalityAnswer,
  PersonalityScores,
  PersonalityTypeId,
} from "../src/content/personality";
import {
  calculateAxisAverages,
  calculateQuestionStats,
  calculateTypeDistribution,
  createBalancedTeams,
  getSampleMode,
  type StatsProfile,
} from "../src/lib/personality-stats";

const ZERO_SCORES: PersonalityScores = {
  leader: 0,
  idea: 0,
  heart: 0,
  challenge: 0,
};

function profile(
  id: string,
  type: PersonalityTypeId,
  answer: PersonalityAnswer,
  scores: Partial<PersonalityScores> = {},
): StatsProfile {
  return {
    id,
    display_name: `学生${id}`,
    email: `${id}@example.com`,
    gender: Number(id.replace(/\D/g, "")) % 2 === 0 ? "female" : "male",
    personality_type: type,
    answers: Array.from({ length: 20 }, () => answer),
    scores: { ...ZERO_SCORES, ...scores },
  };
}

describe("calculateTypeDistribution", () => {
  it("returns an empty presentation for no profiles", () => {
    const result = calculateTypeDistribution([]);
    expect(result.respondentCount).toBe(0);
    expect(result.sampleMode).toBe("empty");
    expect(result.items.every((item) => item.count === 0 && item.percentage === 0)).toBe(true);
  });

  it("uses counts-only presentation for one profile", () => {
    const result = calculateTypeDistribution([profile("1", "heart", "yes")]);
    expect(result.sampleMode).toBe("counts-only");
    expect(result.items[0]).toMatchObject({ type: "heart", count: 1, percentage: 100 });
  });

  it("sorts a normal distribution by count and exposes percentages", () => {
    const result = calculateTypeDistribution([
      profile("1", "leader", "yes"),
      profile("2", "leader", "neutral"),
      profile("3", "idea", "no"),
    ]);
    expect(result.sampleMode).toBe("full");
    expect(result.items[0]).toMatchObject({ type: "leader", count: 2, percentage: 66.7 });
    expect(result.items[1]).toMatchObject({ type: "idea", count: 1, percentage: 33.3 });
  });
});

describe("少数データ規則", () => {
  it("uses counts only for both one and two respondents", () => {
    expect(getSampleMode(1)).toBe("counts-only");
    expect(getSampleMode(2)).toBe("counts-only");
    expect(getSampleMode(3)).toBe("full");
  });
});

describe("calculateAxisAverages", () => {
  it("returns zero averages for no profiles", () => {
    const result = calculateAxisAverages([]);
    expect(result.sampleMode).toBe("empty");
    expect(result.items.map((item) => item.average)).toEqual([0, 0, 0, 0]);
  });

  it("returns the one profile's scores and counts-only mode", () => {
    const result = calculateAxisAverages([
      profile("1", "leader", "yes", { leader: 10, idea: 4, heart: 6, challenge: 2 }),
    ]);
    expect(result.sampleMode).toBe("counts-only");
    expect(result.items.map((item) => item.average)).toEqual([10, 4, 6, 2]);
  });

  it("averages every axis for a normal sample", () => {
    const result = calculateAxisAverages([
      profile("1", "leader", "yes", { leader: 10, idea: 2, heart: 4, challenge: 6 }),
      profile("2", "idea", "neutral", { leader: 4, idea: 8, heart: 6, challenge: 2 }),
      profile("3", "heart", "no", { leader: 7, idea: 5, heart: 8, challenge: 4 }),
    ]);
    expect(result.sampleMode).toBe("full");
    expect(result.items.map((item) => item.average)).toEqual([7, 5, 6, 4]);
  });
});

describe("calculateQuestionStats", () => {
  it("returns twenty empty rows for no profiles", () => {
    const result = calculateQuestionStats([]);
    expect(result.sampleMode).toBe("empty");
    expect(result.items).toHaveLength(20);
    expect(result.items.every((item) => item.total === 0)).toBe(true);
  });

  it("uses counts-only mode for one profile", () => {
    const result = calculateQuestionStats([profile("1", "heart", "neutral")]);
    expect(result.sampleMode).toBe("counts-only");
    expect(result.items[0]?.answers).toEqual([
      { answer: "yes", count: 0, percentage: 0 },
      { answer: "neutral", count: 1, percentage: 100 },
      { answer: "no", count: 0, percentage: 0 },
    ]);
  });

  it("aggregates all three answers for a normal sample", () => {
    const result = calculateQuestionStats([
      profile("1", "leader", "yes"),
      profile("2", "idea", "neutral"),
      profile("3", "heart", "no"),
    ]);
    expect(result.sampleMode).toBe("full");
    expect(result.items[19]?.answers).toEqual([
      { answer: "yes", count: 1, percentage: 33.3 },
      { answer: "neutral", count: 1, percentage: 33.3 },
      { answer: "no", count: 1, percentage: 33.3 },
    ]);
  });
});

describe("createBalancedTeams", () => {
  it("does not create a plan for an empty sample", () => {
    const result = createBalancedTeams([], 4);
    expect(result).toMatchObject({ canBuild: false, teams: [] });
  });

  it("does not create a plan for one profile", () => {
    const result = createBalancedTeams([profile("1", "leader", "yes")], 4);
    expect(result.canBuild).toBe(false);
    expect(result.reason).toContain("4人未満");
  });

  it("round-robins types and totals scores for a normal sample", () => {
    const profiles = [
      profile("1", "leader", "yes", { leader: 10 }),
      profile("2", "leader", "yes", { leader: 8 }),
      profile("3", "idea", "yes", { idea: 10 }),
      profile("4", "idea", "yes", { idea: 8 }),
      profile("5", "heart", "yes", { heart: 10 }),
      profile("6", "heart", "yes", { heart: 8 }),
      profile("7", "challenge", "yes", { challenge: 10 }),
      profile("8", "challenge", "yes", { challenge: 8 }),
    ];
    const result = createBalancedTeams(profiles, 4);
    expect(result.canBuild).toBe(true);
    expect(result.teams).toHaveLength(2);
    for (const team of result.teams) {
      expect(team.members).toHaveLength(4);
      expect(new Set(team.members.map((member) => member.personality_type)).size).toBe(4);
      expect(
        Object.values(team.scoreTotals).reduce((sum, score) => sum + score, 0),
      ).toBeGreaterThan(0);
    }
  });
});
