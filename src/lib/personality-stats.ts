import type {
  PersonalityAnswer,
  PersonalityScores,
  PersonalityTypeId,
} from "@/content/personality";
import type { Gender } from "@/lib/profile";
import type { PersonalityResultRow, ProfileRow } from "@/lib/profile-db";

export const PERSONALITY_AXES = ["leader", "idea", "heart", "challenge"] as const;
export const PERSONALITY_ANSWERS = ["yes", "neutral", "no"] as const;

export type SampleMode = "empty" | "counts-only" | "full";

export type StatsProfile = Pick<
  ProfileRow,
  "id" | "display_name" | "email" | "gender" | "personality_type" | "answers" | "scores"
>;

export interface TypeDistributionItem {
  type: PersonalityTypeId;
  count: number;
  percentage: number;
}

export interface TypeDistribution {
  respondentCount: number;
  sampleMode: SampleMode;
  items: TypeDistributionItem[];
}

export interface AxisAverageItem {
  axis: PersonalityTypeId;
  average: number;
}

export interface AxisAverages {
  respondentCount: number;
  sampleMode: SampleMode;
  items: AxisAverageItem[];
}

export interface AnswerCount {
  answer: PersonalityAnswer;
  count: number;
  percentage: number;
}

export interface QuestionStat {
  questionId: number;
  total: number;
  answers: AnswerCount[];
}

export interface QuestionStats {
  respondentCount: number;
  sampleMode: SampleMode;
  items: QuestionStat[];
}

export interface TeamSuggestion {
  number: number;
  members: StatsProfile[];
  scoreTotals: PersonalityScores;
}

export interface TeamPlan {
  canBuild: boolean;
  reason: string | null;
  teamSize: number;
  teams: TeamSuggestion[];
}

export interface DashboardKpis {
  answered: number;
  unanswered: number;
  registered: number;
  recentAnswers: number;
}

export type GenderTypeMatrix = Record<
  PersonalityTypeId,
  Record<Gender, number> & { total: number }
>;

export interface PersonalityResultChange {
  typeChanged: boolean;
  previousType: PersonalityTypeId;
  currentType: PersonalityTypeId;
  scoreDeltas: PersonalityScores;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getSampleMode(respondentCount: number): SampleMode {
  if (respondentCount === 0) return "empty";
  return respondentCount <= 2 ? "counts-only" : "full";
}

export function hasCompletedPersonality(profile: Pick<StatsProfile, "answers">): boolean {
  return profile.answers.length === 20;
}

export function selectCompletedProfiles(profiles: readonly StatsProfile[]): StatsProfile[] {
  return profiles.filter(hasCompletedPersonality);
}

export function calculateTypeDistribution(profiles: readonly StatsProfile[]): TypeDistribution {
  const respondentCount = profiles.length;
  const counts = Object.fromEntries(PERSONALITY_AXES.map((type) => [type, 0])) as Record<
    PersonalityTypeId,
    number
  >;
  for (const profile of profiles) counts[profile.personality_type] += 1;

  const order = new Map(PERSONALITY_AXES.map((type, index) => [type, index]));
  const items = PERSONALITY_AXES.map((type) => ({
    type,
    count: counts[type],
    percentage: respondentCount === 0 ? 0 : roundOne((counts[type] / respondentCount) * 100),
  })).sort(
    (left, right) =>
      right.count - left.count || (order.get(left.type) ?? 0) - (order.get(right.type) ?? 0),
  );

  return { respondentCount, sampleMode: getSampleMode(respondentCount), items };
}

export function calculateAxisAverages(profiles: readonly StatsProfile[]): AxisAverages {
  const respondentCount = profiles.length;
  const items = PERSONALITY_AXES.map((axis) => ({
    axis,
    average:
      respondentCount === 0
        ? 0
        : roundOne(
            profiles.reduce((total, profile) => total + profile.scores[axis], 0) / respondentCount,
          ),
  }));
  return { respondentCount, sampleMode: getSampleMode(respondentCount), items };
}

export function calculateQuestionStats(profiles: readonly StatsProfile[]): QuestionStats {
  const respondentCount = profiles.length;
  const items = Array.from({ length: 20 }, (_, questionIndex) => {
    const counts: Record<PersonalityAnswer, number> = { yes: 0, neutral: 0, no: 0 };
    for (const profile of profiles) {
      const answer = profile.answers[questionIndex];
      if (answer) counts[answer] += 1;
    }
    const total = PERSONALITY_ANSWERS.reduce((sum, answer) => sum + counts[answer], 0);
    return {
      questionId: questionIndex + 1,
      total,
      answers: PERSONALITY_ANSWERS.map((answer) => ({
        answer,
        count: counts[answer],
        percentage: total === 0 ? 0 : roundOne((counts[answer] / total) * 100),
      })),
    };
  });
  return { respondentCount, sampleMode: getSampleMode(respondentCount), items };
}

function emptyScores(): PersonalityScores {
  return { leader: 0, idea: 0, heart: 0, challenge: 0 };
}

export function createBalancedTeams(profiles: readonly StatsProfile[], teamSize: number): TeamPlan {
  if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 6) {
    throw new RangeError("teamSize must be an integer from 2 to 6.");
  }
  if (profiles.length < teamSize) {
    return {
      canBuild: false,
      reason: `回答ずみの学生が${teamSize}人未満のため、チーム案を作れません。`,
      teamSize,
      teams: [],
    };
  }

  const teamCount = Math.ceil(profiles.length / teamSize);
  const teams: TeamSuggestion[] = Array.from({ length: teamCount }, (_, index) => ({
    number: index + 1,
    members: [],
    scoreTotals: emptyScores(),
  }));
  let cursor = 0;

  for (const type of PERSONALITY_AXES) {
    const members = profiles
      .filter((profile) => profile.personality_type === type)
      .toSorted((left, right) => left.display_name.localeCompare(right.display_name, "ja"));
    for (const member of members) {
      const eligible = teams.filter((team) => team.members.length < teamSize);
      const minimumTypeCount = Math.min(
        ...eligible.map(
          (team) => team.members.filter((candidate) => candidate.personality_type === type).length,
        ),
      );
      const diverse = eligible.filter(
        (team) =>
          team.members.filter((candidate) => candidate.personality_type === type).length ===
          minimumTypeCount,
      );
      const minimumSize = Math.min(...diverse.map((team) => team.members.length));
      const smallest = diverse.filter((team) => team.members.length === minimumSize);
      const team =
        Array.from({ length: teams.length }, (_, offset) => teams[(cursor + offset) % teams.length])
          .filter((candidate): candidate is TeamSuggestion => Boolean(candidate))
          .find((candidate) => smallest.includes(candidate)) ?? smallest[0]!;

      team.members.push(member);
      for (const axis of PERSONALITY_AXES) {
        team.scoreTotals[axis] += member.scores[axis];
      }
      cursor = team.number % teams.length;
    }
  }

  return { canBuild: true, reason: null, teamSize, teams };
}

export function calculateDashboardKpis(
  profiles: readonly StatsProfile[],
  results: readonly Pick<PersonalityResultRow, "created_at">[],
  now = new Date(),
): DashboardKpis {
  const answered = profiles.filter(hasCompletedPersonality).length;
  const threshold = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return {
    answered,
    unanswered: profiles.length - answered,
    registered: profiles.length,
    recentAnswers: results.filter((result) => new Date(result.created_at).getTime() >= threshold)
      .length,
  };
}

export function calculateGenderTypeMatrix(profiles: readonly StatsProfile[]): GenderTypeMatrix {
  const matrix: GenderTypeMatrix = {
    leader: { male: 0, female: 0, total: 0 },
    idea: { male: 0, female: 0, total: 0 },
    heart: { male: 0, female: 0, total: 0 },
    challenge: { male: 0, female: 0, total: 0 },
  };
  for (const profile of profiles) {
    matrix[profile.personality_type][profile.gender] += 1;
    matrix[profile.personality_type].total += 1;
  }
  return matrix;
}

export function latestResultsByProfile(
  results: readonly PersonalityResultRow[],
): Record<string, PersonalityResultRow> {
  const latest: Record<string, PersonalityResultRow> = {};
  for (const result of results) {
    const current = latest[result.profile_id];
    if (
      !current ||
      new Date(result.created_at).getTime() > new Date(current.created_at).getTime()
    ) {
      latest[result.profile_id] = result;
    }
  }
  return latest;
}

export function calculateResultChange(
  current: Pick<PersonalityResultRow, "personality_type" | "scores">,
  previous: Pick<PersonalityResultRow, "personality_type" | "scores">,
): PersonalityResultChange {
  return {
    typeChanged: current.personality_type !== previous.personality_type,
    previousType: previous.personality_type,
    currentType: current.personality_type,
    scoreDeltas: {
      leader: current.scores.leader - previous.scores.leader,
      idea: current.scores.idea - previous.scores.idea,
      heart: current.scores.heart - previous.scores.heart,
      challenge: current.scores.challenge - previous.scores.challenge,
    },
  };
}
