/**
 * 教師向けの集計とチーム編成。
 * 仕様: docs/design/07_性格タイプ設計_MBTI16.md §4・§6・§7、docs/design/06_性格診断レポート設計.md
 *
 * v3（MBTI 4軸16タイプ）。分布は「4家族＋家族内16コード」の入れ子、軸は双極0〜5（中央2.5）、
 * 回答は Ⓐ/Ⓑ の2値。
 *
 * 値域の正典は `@/content/personality` に一本化してある。このファイルで軸・回答値・タイプの
 * 一覧を再定義しない（AGENTS.md「再実装しない」）。
 */

import {
  PERSONALITY_AXES,
  PERSONALITY_AXIS_META,
  PERSONALITY_FAMILIES,
  PERSONALITY_QUESTIONS,
  PERSONALITY_TYPES,
  getFamilyForCode,
  getPoleFromCode,
  isPersonalityScores,
  isPersonalityTypeCode,
  type PersonalityAnswer,
  type PersonalityAxis,
  type PersonalityFamilyId,
  type PersonalityPole,
  type PersonalityScores,
  type PersonalityTypeCode,
} from "@/content/personality";
import type { Gender } from "@/lib/profile";
import type { PersonalityResultRow, ProfileRow } from "@/lib/profile-db";

/** 集計内部でのみ使う回答の並び。UIは QuestionStat.answers の順から凡例を作れる。 */
const ANSWER_ORDER: readonly PersonalityAnswer[] = ["a", "b"];

const FAMILY_INDEX = new Map(PERSONALITY_FAMILIES.map((family, index) => [family.id, index]));
const CODE_INDEX = new Map(PERSONALITY_TYPES.map((type, index) => [type.code, index]));

export type SampleMode = "empty" | "counts-only" | "full";

export type StatsProfile = Pick<
  ProfileRow,
  | "id"
  | "display_name"
  | "email"
  | "gender"
  | "personality_type"
  | "answers"
  | "scores"
  | "personality_version"
>;

/**
 * 診断が終わっている行。**集計と編成はこれだけを見る**（2026-08-24）。
 *
 * ログインした時点で profiles に行ができるようになったので、`personality_type` が
 * null の「登録しただけ」の行が正当に存在する。集計に混ぜないことを型で強制する
 * ため、`selectCompletedProfiles` / `hasCompletedPersonality` を通した行だけが
 * この型になる。
 */
export type CompletedProfile = StatsProfile & { personality_type: PersonalityTypeCode };

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getSampleMode(respondentCount: number): SampleMode {
  if (respondentCount === 0) return "empty";
  return respondentCount <= 2 ? "counts-only" : "full";
}

/** 06 §6: 1〜2人のサンプルでは割合(%)を出さない。型で強制するため null を返す。 */
function percentageOf(count: number, total: number, mode: SampleMode): number | null {
  if (mode !== "full" || total === 0) return null;
  return roundOne((count / total) * 100);
}

/**
 * 集計に載せてよい行か。
 * 長さだけを見ると v2 の `["yes", ...]` 20件が「完成」として通り、設問別集計の総数が
 * 静かに0になる（人数だけ数えられて中身が数えられない）。値の中身まで検証する。
 */
export function hasCompletedPersonality<
  T extends Pick<StatsProfile, "answers" | "scores" | "personality_type">,
>(profile: T): profile is T & { personality_type: PersonalityTypeCode } {
  return (
    // 型も見る。ここを通した行は下流で getPoleFromCode / getFamilyForCode に渡るので、
    // 旧4値や未知文字列を通すと誤った極に数えられるか、編成が例外で落ちる。
    isPersonalityTypeCode(profile.personality_type) &&
    Array.isArray(profile.answers) &&
    profile.answers.length === PERSONALITY_QUESTIONS.length &&
    profile.answers.every((answer) => answer === "a" || answer === "b") &&
    isPersonalityScores(profile.scores)
  );
}

/**
 * @param version 指定すると、その版の回答だけに絞る（07 §7 の「版が同じもの同士」）。
 *   `PERSONALITY_VERSION` をこのモジュールに import しないのは、その定数を持つ profile-db が
 *   `@supabase/ssr` を引き込み、純関数のテストにSupabaseが混入するため。呼び出し側が渡す。
 */
export function selectCompletedProfiles(
  profiles: readonly StatsProfile[],
  version?: number,
): CompletedProfile[] {
  return profiles.filter(
    (profile): profile is CompletedProfile =>
      hasCompletedPersonality(profile) &&
      (version === undefined || profile.personality_version === version),
  );
}

/* ---------------- タイプ分布（4家族 ＋ 家族内16コード） ---------------- */

export interface TypeCodeCount {
  code: PersonalityTypeCode;
  count: number;
  /** 回答者全体に対する割合。家族内比率ではない。counts-only / empty では null。 */
  percentage: number | null;
}

export interface FamilyDistributionItem {
  family: PersonalityFamilyId;
  count: number;
  percentage: number | null;
  /** 常に4件・PERSONALITY_TYPES の表順（0件のコードも出す）。 */
  codes: TypeCodeCount[];
}

export interface TypeDistribution {
  respondentCount: number;
  sampleMode: SampleMode;
  /** 常に4件・件数降順（同数は PERSONALITY_FAMILIES の定義順）。 */
  families: FamilyDistributionItem[];
}

export function calculateTypeDistribution(profiles: readonly CompletedProfile[]): TypeDistribution {
  const respondentCount = profiles.length;
  const sampleMode = getSampleMode(respondentCount);

  const codeCounts = new Map<PersonalityTypeCode, number>();
  for (const profile of profiles) {
    const code = profile.personality_type;
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
  }

  const families = PERSONALITY_FAMILIES.map((family): FamilyDistributionItem => {
    // 家族内は件数降順にせず定義順で固定する。20人規模では16コード中10前後が0件になり、
    // 件数降順だと行が毎回入れ替わって読めなくなるため。
    const codes = PERSONALITY_TYPES.filter((type) => type.familyId === family.id).map(
      (type): TypeCodeCount => {
        const count = codeCounts.get(type.code) ?? 0;
        return {
          code: type.code,
          count,
          percentage: percentageOf(count, respondentCount, sampleMode),
        };
      },
    );
    const count = codes.reduce((total, item) => total + item.count, 0);
    return {
      family: family.id,
      count,
      percentage: percentageOf(count, respondentCount, sampleMode),
      codes,
    };
  }).sort(
    (left, right) =>
      right.count - left.count ||
      (FAMILY_INDEX.get(left.family) ?? 0) - (FAMILY_INDEX.get(right.family) ?? 0),
  );

  return { respondentCount, sampleMode, families };
}

/* ---------------- 軸平均（双極0〜5・中央2.5） ---------------- */

export interface AxisAverageItem {
  axis: PersonalityAxis;
  /** 左極（E/S/T/J）側の平均。0〜5・中央2.5。回答者0人のとき null。 */
  average: number | null;
  /** 平均がどちらに寄っているか。ちょうど2.5、または average が null なら null。 */
  leaning: PersonalityPole | null;
  /** 左極の人数。 */
  firstPoleCount: number;
  /** 右極の人数。 */
  secondPoleCount: number;
}

export interface AxisAverages {
  respondentCount: number;
  sampleMode: SampleMode;
  /** 常に4件・PERSONALITY_AXES の順（ei→sn→tf→jp）。 */
  items: AxisAverageItem[];
}

/**
 * 空サンプルで average を 0 にしない。v3 の 0 は中立ではなく「I=5/N=5/F=5/P=5」の最大偏りで、
 * 双極バー上「クラス全員が INFP」と読めてしまう（07 §6.4 の誤読防止規律に既定値が抵触する）。
 *
 * 平均だけだと二峰性が隠れる（[5,0,5,0] と [3,2,3,2] はどちらも2.5）ので、極ごとの人数も返す。
 */
export function calculateAxisAverages(profiles: readonly CompletedProfile[]): AxisAverages {
  const respondentCount = profiles.length;

  const items = PERSONALITY_AXES.map((axis): AxisAverageItem => {
    const [first, second] = PERSONALITY_AXIS_META[axis].poles;
    let sum = 0;
    let counted = 0;
    let firstPoleCount = 0;

    for (const profile of profiles) {
      const value = profile.scores[axis];
      // 未診断や v2 の残骸が1件混ざるだけで平均が全部 NaN になるので、非有限は数えない。
      if (!Number.isFinite(value)) continue;
      sum += value;
      counted += 1;
      // 極の判定はコードから取る（管理者が personality_type だけ手で変えた行でも
      // 画面のチップと判定が食い違わないようにする）。
      if (getPoleFromCode(profile.personality_type, axis) === first) {
        firstPoleCount += 1;
      }
    }

    if (counted === 0) {
      return { axis, average: null, leaning: null, firstPoleCount: 0, secondPoleCount: 0 };
    }

    // 寄りの判定は丸める前の実平均で行う。表示用に丸めた値で判定すると、
    // 実平均 2.462（13人・合計32）が 2.5 に丸まって「どちらでもない」に化ける。
    const exact = sum / counted;
    // しきい値2.5は集計の「寄り」であって、個人の極を決める getPole のしきい値3とは別物。
    const leaning = exact === 2.5 ? null : exact > 2.5 ? first : second;
    return {
      axis,
      average: roundOne(exact),
      leaning,
      firstPoleCount,
      secondPoleCount: counted - firstPoleCount,
    };
  });

  return { respondentCount, sampleMode: getSampleMode(respondentCount), items };
}

/* ---------------- 設問別分布（Ⓐ/Ⓑ） ---------------- */

export interface AnswerCount {
  answer: PersonalityAnswer;
  /** この選択肢が数える極。設問ごとに Ⓐ/Ⓑ どちらが左極かは入れ替わる（07 §3.1）。 */
  pole: PersonalityPole;
  count: number;
  percentage: number | null;
}

export interface QuestionStat {
  questionId: number;
  axis: PersonalityAxis;
  total: number;
  /** 常に2件・[a, b] の順。 */
  answers: AnswerCount[];
}

export interface QuestionStats {
  respondentCount: number;
  sampleMode: SampleMode;
  items: QuestionStat[];
}

/**
 * 各選択肢に `pole` を持たせるのは、Ⓐの極が設問ごとに入れ替わるため
 * （Q1 は a=E、Q5 は a=I）。「Ⓐの割合」を20行並べただけでは行間で比較できず、
 * 同じ色の棒が正反対の意味になる。UIが極で読めるようにする。
 */
export function calculateQuestionStats(profiles: readonly StatsProfile[]): QuestionStats {
  const respondentCount = profiles.length;
  const sampleMode = getSampleMode(respondentCount);

  const items = PERSONALITY_QUESTIONS.map((question, questionIndex): QuestionStat => {
    const counts: Record<PersonalityAnswer, number> = { a: 0, b: 0 };
    for (const profile of profiles) {
      const answer = profile.answers[questionIndex];
      // 未知の値（v2 の "yes" 等）は数えない。カウンタに動的キーを生やさない。
      if (answer === "a" || answer === "b") counts[answer] += 1;
    }
    const total = ANSWER_ORDER.reduce((sum, answer) => sum + counts[answer], 0);

    return {
      questionId: question.id,
      axis: question.axis,
      total,
      answers: ANSWER_ORDER.map((answer) => ({
        answer,
        pole: answer === "a" ? question.a.pole : question.b.pole,
        count: counts[answer],
        percentage: percentageOf(counts[answer], total, sampleMode),
      })),
    };
  });

  return { respondentCount, sampleMode, items };
}

/* ---------------- チーム編成 v2（07 §6） ---------------- */

export type TeamRoleGap = "planner" | "carer";

/** 警告チップの文言（07 §6.4）。教師向けなのでふりがな不要。 */
export const TEAM_ROLE_GAP_LABELS: Readonly<Record<TeamRoleGap, string>> = {
  planner: "段取り",
  carer: "気づかい",
};

export interface TeamPenaltyBreakdown {
  /** J が0人なら 8。 */
  missingPlanner: number;
  /** F が0人なら 8。 */
  missingCarer: number;
  /** 家族ごとに max(0, 人数 - 2) × 4 の総和。 */
  familyClustering: number;
  /** コードごとに max(0, 人数 - 1) × 2 の総和。 */
  duplicateCodes: number;
  /** abs(チームのE人数比 - クラス全体のE人数比) × 2。 */
  extraversionGap: number;
  /** 表示用の合計。 */
  total: number;
  /**
   * 比較用の整数（total × PENALTY_SCALE）。**貪欲・swap の比較はこの値だけを見る。**
   *
   * E比率の項が無限小数（7/24 など）になるため、浮動小数で比較すると
   * 数学的に等しい配置でも「改善した」と誤認して同じ入れ替えを延々繰り返し、
   * 同点規則（§6.3-2）も丸め誤差で一度も発火しない。
   *
   * 倍率が小さすぎると、本来ちがうペナルティまで同点に潰れる。E比率の差の最小刻みは
   * 1/(チーム人数 × クラス人数) なので、6人チーム・1000人クラスでも 1.7e-4。
   * 10^6 倍なら分解能 1e-6 で、実運用のクラス規模では潰れない。
   */
  totalScaled: number;
}

/** ペナルティを整数で持つための倍率。 */
export const PENALTY_SCALE = 1_000_000;

export function calculateExtraversionRatio(
  profiles: readonly Pick<CompletedProfile, "personality_type">[],
): number {
  if (profiles.length === 0) return 0;
  const extraverts = profiles.filter(
    (profile) => getPoleFromCode(profile.personality_type, "ei") === "E",
  ).length;
  return extraverts / profiles.length;
}

/**
 * 07 §6.2 のペナルティ。重みの大小が優先度を表す（辞書式の段階フィルタにしない）。
 *
 * 空チームは「J が0人・F が0人」ちょうど16点になる（E比率の項は0）。これは意図した定義で、
 * 貪欲配置が自然と空チームから埋めるようにするために必要。
 * （空チームを0点にすると、既存チームに置くほうが常に得になり全員が1チームに吸い込まれる。）
 */
export function calculateTeamPenalty(
  members: readonly Pick<CompletedProfile, "personality_type">[],
  classExtraversionRatio: number,
): TeamPenaltyBreakdown {
  const missingPlanner = members.some(
    (member) => getPoleFromCode(member.personality_type, "jp") === "J",
  )
    ? 0
    : 8;
  const missingCarer = members.some(
    (member) => getPoleFromCode(member.personality_type, "tf") === "F",
  )
    ? 0
    : 8;

  let familyClustering = 0;
  for (const family of PERSONALITY_FAMILIES) {
    const count = members.filter(
      (member) => getFamilyForCode(member.personality_type).id === family.id,
    ).length;
    familyClustering += Math.max(0, count - 2) * 4;
  }

  const codeCounts = new Map<PersonalityTypeCode, number>();
  for (const member of members) {
    codeCounts.set(member.personality_type, (codeCounts.get(member.personality_type) ?? 0) + 1);
  }
  let duplicateCodes = 0;
  for (const count of codeCounts.values()) duplicateCodes += Math.max(0, count - 1) * 2;

  // 空チームには E比率が存在しない。0（＝全員I）とみなすと、空チームの評価値が
  // クラスのE比率に応じて上下し、空チームへ置く優先度が理由なく変わる。0点で固定する。
  const gapScaled =
    members.length === 0
      ? 0
      : Math.round(
          Math.abs(calculateExtraversionRatio(members) - classExtraversionRatio) *
            2 *
            PENALTY_SCALE,
        );

  const totalScaled =
    (missingPlanner + missingCarer + familyClustering + duplicateCodes) * PENALTY_SCALE + gapScaled;

  return {
    missingPlanner,
    missingCarer,
    familyClustering,
    duplicateCodes,
    extraversionGap: gapScaled / PENALTY_SCALE,
    total: totalScaled / PENALTY_SCALE,
    totalScaled,
  };
}

export interface TeamSuggestion {
  number: number;
  /** §6.1 の均等割り定員。チームごとに異なりうる（差は最大1）。 */
  capacity: number;
  members: CompletedProfile[];
  familyCounts: Record<PersonalityFamilyId, number>;
  /** 双極バー用（0〜5・中央2.5）。 */
  axisAverages: AxisAverageItem[];
  /**
   * J不在 → "planner"、F不在 → "carer"。この順。
   * **1人チームでは常に空にする**（下記 isSolo 参照）。
   */
  missingRoles: TeamRoleGap[];
  /**
   * 1人だけのチームか。teamSize=2 で人数が奇数のときに構造的に生じる（07 §6.1）。
   * 1人に「足りない役割: 段取り」と突きつけても打つ手が無いので、警告チップは出さない。
   * ペナルティ自体は素の値のまま返す（編成アルゴリズムはこれを使って1人チームを避けようとする）。
   */
  isSolo: boolean;
  penalty: TeamPenaltyBreakdown;
}

/**
 * 任意のメンバー割当から表示データを組み立て直す純関数。
 * 教師が画面で2人を入れ替えたあとの再計算（07 §6.4）に使う。
 */
export function buildTeamSuggestions(
  groups: readonly (readonly CompletedProfile[])[],
  cohort: readonly CompletedProfile[],
  capacities?: readonly number[],
): TeamSuggestion[] {
  const classExtraversion = calculateExtraversionRatio(cohort);

  return groups.map((members, index) => {
    const penalty = calculateTeamPenalty(members, classExtraversion);
    const familyCounts: Record<PersonalityFamilyId, number> = {
      leader: 0,
      idea: 0,
      heart: 0,
      challenge: 0,
    };
    for (const member of members) {
      familyCounts[getFamilyForCode(member.personality_type).id] += 1;
    }

    const isSolo = members.length === 1;
    const missingRoles: TeamRoleGap[] = [];
    if (!isSolo) {
      if (penalty.missingPlanner > 0) missingRoles.push("planner");
      if (penalty.missingCarer > 0) missingRoles.push("carer");
    }

    return {
      number: index + 1,
      capacity: capacities?.[index] ?? members.length,
      members: [...members],
      familyCounts,
      axisAverages: calculateAxisAverages(members).items,
      missingRoles,
      isSolo,
      penalty,
    };
  });
}

export interface TeamPlan {
  canBuild: boolean;
  reason: string | null;
  /**
   * 案は作れたが、教師に一言伝えたいことがある場合の注記。
   * いまは1人チームが生じたときだけ入る（指定サイズで割り切れない人数）。
   */
  notice: string | null;
  /** 指定サイズ（2〜6）。定員そのものではない——定員は §6.1 で均等割りされる。 */
  teamSize: number;
  teams: TeamSuggestion[];
  totalPenalty: number;
  /** 実際に適用した入れ替えの回数（走査回数ではない）。 */
  swapsApplied: number;
  /** 上限で打ち切ったか（07 §6.3-4）。true でも案はそのまま提示する。 */
  truncated: boolean;
}

const MAX_SWAPS = 200;

/**
 * 07 §6 のチーム編成。決定的（乱数なし・同じ入力からは常に同じ編成）。
 *
 * 入力は `selectCompletedProfiles` 済みであることを前提とする。
 *
 * ※ 07 §6.1 は「1人チームは構造的に生じない」と書いているが、teamSize=2 かつ人数が奇数の
 *    ときは定員式どおりに1人チームが生じる（n=5 なら [2,2,1]）。2人組に奇数人は割り切れず
 *    数学的に回避できない。式が正典なので式どおりに実装し、挙動をテストで固定してある。
 */
export function createBalancedTeams(
  profiles: readonly CompletedProfile[],
  teamSize: number,
): TeamPlan {
  if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 6) {
    throw new RangeError("teamSize must be an integer from 2 to 6.");
  }
  if (profiles.length < teamSize) {
    return {
      canBuild: false,
      reason: `回答ずみの学生が${teamSize}人未満のため、チーム案を作れません。`,
      notice: null,
      teamSize,
      teams: [],
      totalPenalty: 0,
      swapsApplied: 0,
      truncated: false,
    };
  }

  // 1. チーム数と定員（均等割り・人数差は最大1・合計は必ず人数と一致）
  const total = profiles.length;
  const teamCount = Math.ceil(total / teamSize);
  const base = Math.floor(total / teamCount);
  const remainder = total - base * teamCount;
  const capacities = Array.from({ length: teamCount }, (_, index) =>
    index < remainder ? base + 1 : base,
  );

  const classExtraversion = calculateExtraversionRatio(profiles);

  // 2. 決定的な並べ替え。localeCompare は別々の名前を同値と判定することがある
  //    （「ふぁん」と「ファン」など）ので、最後に必ず id で決着させる。
  const ordered = [...profiles].sort(
    (left, right) =>
      (FAMILY_INDEX.get(getFamilyForCode(left.personality_type).id) ?? 0) -
        (FAMILY_INDEX.get(getFamilyForCode(right.personality_type).id) ?? 0) ||
      (CODE_INDEX.get(left.personality_type) ?? 0) -
        (CODE_INDEX.get(right.personality_type) ?? 0) ||
      left.display_name.localeCompare(right.display_name, "ja") ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );

  // 3. 貪欲配置
  const groups: CompletedProfile[][] = capacities.map(() => []);
  const penalties = groups.map((members) => calculateTeamPenalty(members, classExtraversion));

  for (const student of ordered) {
    let best = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    let bestPenalty = penalties[0]!;

    for (let index = 0; index < groups.length; index += 1) {
      const members = groups[index]!;
      if (members.length >= capacities[index]!) continue;

      const next = calculateTeamPenalty([...members, student], classExtraversion);
      const delta = next.totalScaled - penalties[index]!.totalScaled;

      // 同点なら人数の少ないチーム、さらに同点ならチーム番号の小さい方（先に見た方を残す）。
      // 整数比較なので、この同点規則が実際に発火する。
      if (
        best === -1 ||
        delta < bestDelta ||
        (delta === bestDelta && members.length < groups[best]!.length)
      ) {
        best = index;
        bestDelta = delta;
        bestPenalty = next;
      }
    }

    groups[best]!.push(student);
    penalties[best] = bestPenalty;
  }

  // 4. 局所改善。2人の入れ替えは人数を変えないので定員は常に守られる。
  //    整数で持っているため、変化する2チームだけの差分更新でも誤差が溜まらない。
  let swapsApplied = 0;
  let truncated = false;

  let improving = true;
  while (improving) {
    improving = false;

    scan: for (let a = 0; a < groups.length; a += 1) {
      for (let b = a + 1; b < groups.length; b += 1) {
        for (let p = 0; p < groups[a]!.length; p += 1) {
          for (let q = 0; q < groups[b]!.length; q += 1) {
            const left = groups[a]!;
            const right = groups[b]!;
            const before = penalties[a]!.totalScaled + penalties[b]!.totalScaled;

            const swappedLeft = [...left];
            const swappedRight = [...right];
            swappedLeft[p] = right[q]!;
            swappedRight[q] = left[p]!;

            const nextLeft = calculateTeamPenalty(swappedLeft, classExtraversion);
            const nextRight = calculateTeamPenalty(swappedRight, classExtraversion);

            // 厳密な減少のみ改善とみなす。<= にすると同点の往復で振動して止まらない。
            if (nextLeft.totalScaled + nextRight.totalScaled >= before) continue;

            groups[a] = swappedLeft;
            groups[b] = swappedRight;
            penalties[a] = nextLeft;
            penalties[b] = nextRight;
            swapsApplied += 1;
            improving = true;

            if (swapsApplied >= MAX_SWAPS) {
              truncated = true;
              improving = false;
              break scan;
            }
            // 最初の改善を採用して、走査を先頭からやり直す。
            break scan;
          }
        }
      }
    }
  }

  const teams = buildTeamSuggestions(groups, profiles, capacities);
  // 1人チームは teamSize=2・奇数人のときに構造的に生じる（数学的に回避できない）。
  // 黙って出すと教師が意図した編成だと誤解するので、注記で伝える。
  const soloTeams = teams.filter((team) => team.isSolo).length;
  return {
    canBuild: true,
    reason: null,
    notice:
      soloTeams > 0
        ? `${teamSize}人ずつでは割り切れない人数のため、1人だけのチームが${soloTeams}つできます。`
        : null,
    teamSize,
    teams,
    totalPenalty: teams.reduce((sum, team) => sum + team.penalty.total, 0),
    swapsApplied,
    truncated,
  };
}

/* ---------------- KPI・性別クロス・履歴 ---------------- */

export interface DashboardKpis {
  answered: number;
  unanswered: number;
  registered: number;
  recentAnswers: number;
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

/**
 * 性別×**家族**の 4×2（07 §7）。16コード×2にすると32セルの大半が0か1になり、
 * 学生名簿と併置される画面では個人が特定できてしまう。
 */
export type GenderFamilyMatrix = Record<
  PersonalityFamilyId,
  Record<Gender, number> & { total: number }
>;

export function calculateGenderFamilyMatrix(
  profiles: readonly CompletedProfile[],
): GenderFamilyMatrix {
  const matrix: GenderFamilyMatrix = {
    leader: { male: 0, female: 0, total: 0 },
    idea: { male: 0, female: 0, total: 0 },
    heart: { male: 0, female: 0, total: 0 },
    challenge: { male: 0, female: 0, total: 0 },
  };
  for (const profile of profiles) {
    // せいべつが空の行は数えない。DBの profiles_answered_row_is_complete が
    // 「答えがそろった行は必ず性別を持つ」を保証するので、ここに来るのは壊れた1行だけ。
    // その1行で先生の画面を落とすより、数から外すほうがましだと決めた。
    if (!profile.gender) continue;
    const family = getFamilyForCode(profile.personality_type).id;
    matrix[family][profile.gender] += 1;
    matrix[family].total += 1;
  }
  return matrix;
}

/**
 * profile_id ごとに最新の1件。created_at が同値のときは id で必ず決着させる
 * （同値のまま行順に任せると、DBの返す任意順で「最新」が変わる）。
 */
export function latestResultsByProfile(
  results: readonly PersonalityResultRow[],
): Record<string, PersonalityResultRow> {
  const latest: Record<string, PersonalityResultRow> = {};
  for (const result of results) {
    const current = latest[result.profile_id];
    if (!current) {
      latest[result.profile_id] = result;
      continue;
    }
    const time = new Date(result.created_at).getTime();
    const currentTime = new Date(current.created_at).getTime();
    if (time > currentTime || (time === currentTime && result.id > current.id)) {
      latest[result.profile_id] = result;
    }
  }
  return latest;
}

export interface PersonalityResultChange {
  typeChanged: boolean;
  /** 家族（学習者に見えるアイデンティティ）が変わったか。 */
  familyChanged: boolean;
  previousType: PersonalityTypeCode;
  currentType: PersonalityTypeCode;
  previousFamily: PersonalityFamilyId;
  currentFamily: PersonalityFamilyId;
  /** 左極（E/S/T/J）側の増減。-5〜+5。 */
  scoreDeltas: PersonalityScores;
}

/** 07 §7 の逐語。教師向け画面の文言。 */
export const VERSION_MISMATCH_MESSAGE = "診断方式が変わったため比較できません";

export type PersonalityResultComparison =
  | { comparable: true; change: PersonalityResultChange }
  | { comparable: false; reason: "version-mismatch" };

/**
 * 版が同じ結果同士だけ差分を出す（07 §7）。
 * 版が違うと 0〜10 と 0〜5 を引き算した無意味な値が画面に出るため、
 * null ではなく理由つきの判別可能ユニオンで返す（UIが「初回」と取り違えないように）。
 */
export function calculateResultChange(
  current: Pick<PersonalityResultRow, "personality_type" | "scores" | "personality_version">,
  previous: Pick<PersonalityResultRow, "personality_type" | "scores" | "personality_version">,
): PersonalityResultComparison {
  if (current.personality_version !== previous.personality_version) {
    return { comparable: false, reason: "version-mismatch" };
  }

  const scoreDeltas: PersonalityScores = { ei: 0, sn: 0, tf: 0, jp: 0 };
  for (const axis of PERSONALITY_AXES) {
    scoreDeltas[axis] = current.scores[axis] - previous.scores[axis];
  }

  const previousFamily = getFamilyForCode(previous.personality_type).id;
  const currentFamily = getFamilyForCode(current.personality_type).id;

  return {
    comparable: true,
    change: {
      typeChanged: current.personality_type !== previous.personality_type,
      familyChanged: currentFamily !== previousFamily,
      previousType: previous.personality_type,
      currentType: current.personality_type,
      previousFamily,
      currentFamily,
      scoreDeltas,
    },
  };
}
