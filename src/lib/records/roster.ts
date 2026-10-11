/**
 * 生徒の 一覧 —— 学習の きろくを 開いて 最初に 見る 表（2026-10-11・願い #599）
 *
 * 先生が まず 知りたいのは「どの 生徒に フォローが 要るか」と「全体の 進み」である
 *（「どの生徒にフォローが必要かよくわからない。そういうことを理解できるのが学習の記録で
 * あるべき」「進捗は各教材ごとよりも全体で把握できれば良い」）。
 *
 * ## フォローの 印は 決まった 条件だけ（AI に まかせない）
 * 2026-10-11 に 先生が えらんだ 3つ。同じ 記録なら いつ 開いても 同じ 印が 出る。
 *   1. 初回の 点が 低い … もんだいセットの 1回目が 合格ライン 未満の セットが 2つ 以上
 *   2. ことばで 足ぶみ … 同じ ことばの テストで 3回 以上 不合格の まま（DB の view が 数える）
 *   3. 会話で つまずき … ミーティングの 評価つきの 発言の 半分 以上が miss
 * 「7日 動きなし」は えらばれなかった ので 入れない。「AIの 疑い」（N4・N3 を 超える
 * 言葉づかい）は 授業ごとの 定期タスクが 見る（画面の 機械判定では ない）。
 *
 * ## 全体の 進み
 * 地図に 出る ステージの 教材だけで 数える（学習者が 見て いる 道と そろえる）。
 * 教材ごとの 表は 奥に 残して あるので、ここでは 1人 1本の 棒に まとめる。
 */

import type { ProfileRow } from "@/lib/profile-db";
import type { LearnerQuizFirstRow, LearnerSummaryRow } from "@/lib/records/records-db";
import { matchesProfile, type RecordFilter } from "@/lib/records/table";
import type { UnitIndex } from "@/lib/records/units";
import { formatSchool, isStaff, STAFF_AFFILIATION } from "@/lib/school";

/** 印の 条件の 数。画面の 説明文も ここから 読む（書き分けると 片方だけ 直る）。 */
export const FOLLOW_RULES = {
  /** 初回の 点が 合格ライン 未満の セットが この 数 以上で 印。 */
  firstLowSets: 2,
  /** 会話の miss の 割合が これ 以上で 印。 */
  talkMissRatio: 0.5,
  /** 発言が これより 少ない ときは 割合を 見ない（1回 miss しただけで 100% に ならない ように）。 */
  talkMinGraded: 4,
} as const;

/** 合格ラインが 教材に 無い ときの 値（スキーマの 既定と 同じ）。 */
const DEFAULT_PASS_RATE = 70;

export type FollowFlag =
  | { readonly kind: "first-low"; readonly sets: number }
  | { readonly kind: "word-stuck"; readonly sets: number }
  | { readonly kind: "talk-miss"; readonly ratio: number };

export interface LowSet {
  readonly id: string;
  readonly title: string;
  /** 初回の 正答の 割合（0〜1）。 */
  readonly ratio: number;
  /** 合格ライン（%）。 */
  readonly passRate: number;
}

export interface RosterRow {
  readonly profileId: string;
  readonly name: string;
  readonly school: string;
  readonly progress: {
    readonly done: number;
    readonly total: number;
    readonly stagesDone: number;
    readonly stagesTotal: number;
  };
  /** もんだいセットの 初回の 平均（0〜1）。1つも 解いて いなければ null。 */
  readonly firstAverage: number | null;
  readonly quizSets: number;
  readonly lowSets: readonly LowSet[];
  readonly word: { readonly sets: number; readonly passed: number; readonly stuck: number };
  readonly talk: { readonly graded: number; readonly miss: number };
  readonly certificates: number;
  readonly lastAt: string | null;
  readonly flags: readonly FollowFlag[];
}

/**
 * 一覧に 出す 生徒 ＝ 所属・期生・メンバーの 絞り込みに 合う 人。
 *
 * 先生（管理者）と 講師・スタッフは 出さない——試しに 触った 記録で 名簿が 汚れ、
 * 「フォローが 要る 人」に 先生が 並ぶ。ただし **名指しで えらんだ 人**と、
 * 所属で「講師・スタッフ」を えらんだ ときは 出す（見たい と 言って いる）。
 */
export function rosterStudents(
  profiles: readonly ProfileRow[],
  filter: RecordFilter,
): ProfileRow[] {
  return profiles.filter((profile) => {
    if (!matchesProfile(profile, filter)) return false;
    if (filter.profileId !== "") return true;
    if (profile.is_admin) return false;
    return filter.university === STAFF_AFFILIATION || !isStaff(profile.university);
  });
}

/** 1人ぶんの 印。 */
export function followUpFlags(row: Omit<RosterRow, "flags">): FollowFlag[] {
  const flags: FollowFlag[] = [];
  if (row.lowSets.length >= FOLLOW_RULES.firstLowSets) {
    flags.push({ kind: "first-low", sets: row.lowSets.length });
  }
  if (row.word.stuck > 0) flags.push({ kind: "word-stuck", sets: row.word.stuck });
  if (row.talk.graded >= FOLLOW_RULES.talkMinGraded) {
    const ratio = row.talk.miss / row.talk.graded;
    if (ratio >= FOLLOW_RULES.talkMissRatio) flags.push({ kind: "talk-miss", ratio });
  }
  return flags;
}

/** 印の 短い 言葉（表の 中に 出す）。 */
export function flagLabel(flag: FollowFlag): string {
  switch (flag.kind) {
    case "first-low":
      return `初回の 点が 低い（${flag.sets}セット）`;
    case "word-stuck":
      return `ことばで 足ぶみ（${flag.sets}セット）`;
    case "talk-miss":
      return `会話で つまずき（miss ${Math.round(flag.ratio * 100)}%）`;
  }
}

/**
 * 生徒の 一覧を 組み立てる。
 *
 * 並びは **印の 多い 順**、同じなら 名前順。フォローが 要る 人が いちばん 上に 来る。
 * 記録が 1行も 無い 生徒も 出す（まだ 何も して いない ことが 分かる ように）。
 */
export function buildRoster(
  students: readonly ProfileRow[],
  summaries: readonly LearnerSummaryRow[],
  quizFirst: readonly LearnerQuizFirstRow[],
  index: Pick<UnitIndex, "stages" | "units" | "passRates">,
): RosterRow[] {
  const summaryOf = new Map(summaries.map((row) => [row.profile_id, row]));
  const titleOf = new Map(index.units.map((unit) => [unit.id, unit.title]));

  // 地図の ステージと その 教材（全体の 進みの 分母）
  const mapStages = index.stages.filter((stage) => stage.onMap);
  const unitsByStage = new Map(
    mapStages.map((stage) => [
      stage.id,
      index.units.filter((unit) => unit.stageId === stage.id).map((unit) => unit.id),
    ]),
  );
  const stagesWithUnits = mapStages.filter(
    (stage) => (unitsByStage.get(stage.id)?.length ?? 0) > 0,
  );
  const total = stagesWithUnits.reduce(
    (sum, stage) => sum + (unitsByStage.get(stage.id)?.length ?? 0),
    0,
  );

  const quizByProfile = new Map<string, LearnerQuizFirstRow[]>();
  for (const row of quizFirst) {
    // 合格ラインの ある もんだいセットだけ（ページの 書きこみフォームの 記録も 同じ 表に 入る）
    if (!(row.quiz_set_id in index.passRates) || row.first_max <= 0) continue;
    const list = quizByProfile.get(row.profile_id) ?? [];
    list.push(row);
    quizByProfile.set(row.profile_id, list);
  }

  const rows = students.map((profile): RosterRow => {
    const summary = summaryOf.get(profile.id);
    const completed = new Set(summary?.completed_ids ?? []);
    const done = stagesWithUnits.reduce(
      (sum, stage) =>
        sum + (unitsByStage.get(stage.id) ?? []).filter((id) => completed.has(id)).length,
      0,
    );
    const stagesDone = stagesWithUnits.filter((stage) =>
      (unitsByStage.get(stage.id) ?? []).every((id) => completed.has(id)),
    ).length;

    const quiz = quizByProfile.get(profile.id) ?? [];
    const ratios = quiz.map((row) => row.first_score / row.first_max);
    const lowSets = quiz
      .map((row) => ({
        id: row.quiz_set_id,
        title: titleOf.get(row.quiz_set_id) ?? row.quiz_set_id,
        ratio: row.first_score / row.first_max,
        passRate: index.passRates[row.quiz_set_id] ?? DEFAULT_PASS_RATE,
      }))
      .filter((set) => set.ratio * 100 < set.passRate)
      .toSorted((a, b) => a.ratio - b.ratio);

    const base = {
      profileId: profile.id,
      name: profile.display_name || profile.email,
      school: formatSchool(profile),
      progress: { done, total, stagesDone, stagesTotal: stagesWithUnits.length },
      firstAverage:
        ratios.length === 0 ? null : ratios.reduce((sum, value) => sum + value, 0) / ratios.length,
      quizSets: quiz.length,
      lowSets,
      word: {
        sets: summary?.word_sets ?? 0,
        passed: summary?.word_passed_sets ?? 0,
        stuck: summary?.word_stuck_sets ?? 0,
      },
      talk: { graded: summary?.talk_graded ?? 0, miss: summary?.talk_miss ?? 0 },
      certificates: summary?.certificates ?? 0,
      lastAt: summary?.last_at ?? null,
    };
    return { ...base, flags: followUpFlags(base) };
  });

  return rows.toSorted(
    (a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name, "ja"),
  );
}
