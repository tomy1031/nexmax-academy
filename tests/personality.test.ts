import { describe, expect, it } from "vitest";
import {
  PERSONALITY_QUESTIONS,
  calculatePersonalityScores,
  pickPersonalityType,
  scorePersonality,
  type PersonalityAnswer,
} from "../src/content/personality";

function answersFor(
  values: Partial<Record<(typeof PERSONALITY_QUESTIONS)[number]["axis"], PersonalityAnswer>>,
): PersonalityAnswer[] {
  return PERSONALITY_QUESTIONS.map((question) => values[question.axis] ?? "no");
}

describe("personality v2 scoring", () => {
  it("has 20 questions with five questions per axis", () => {
    expect(PERSONALITY_QUESTIONS).toHaveLength(20);
    for (const axis of ["leader", "idea", "heart", "challenge"] as const) {
      expect(PERSONALITY_QUESTIONS.filter((question) => question.axis === axis)).toHaveLength(5);
    }
  });

  it("scores yes=2, neutral=1, no=0 with a 0 to 10 boundary", () => {
    expect(calculatePersonalityScores(answersFor({}))).toEqual({
      leader: 0,
      idea: 0,
      heart: 0,
      challenge: 0,
    });
    expect(calculatePersonalityScores(answersFor({ leader: "yes", idea: "neutral" }))).toEqual({
      leader: 10,
      idea: 5,
      heart: 0,
      challenge: 0,
    });
    expect(
      calculatePersonalityScores(
        answersFor({
          leader: "yes",
          idea: "yes",
          heart: "yes",
          challenge: "yes",
        }),
      ),
    ).toEqual({
      leader: 10,
      idea: 10,
      heart: 10,
      challenge: 10,
    });
  });

  it("selects the unique highest axis", () => {
    expect(scorePersonality(answersFor({ idea: "yes", heart: "neutral" }))).toBe("idea");
  });

  it("uses heart > challenge > idea > leader for ties", () => {
    expect(pickPersonalityType({ leader: 8, idea: 8, heart: 8, challenge: 8 })).toBe("heart");
    expect(pickPersonalityType({ leader: 8, idea: 8, heart: 2, challenge: 8 })).toBe("challenge");
    expect(pickPersonalityType({ leader: 8, idea: 8, heart: 2, challenge: 2 })).toBe("idea");
  });

  it("rejects incomplete answers", () => {
    expect(() => scorePersonality(["yes"])).toThrow("20もん");
  });
});
