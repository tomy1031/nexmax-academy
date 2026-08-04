/**
 * 教師向け 授業サポート表示 — 個別カードの決定的な組み立て。
 * 仕様: docs/design/08_授業サポート表示設計.md §3
 *
 * 純関数のみ。Supabase を import しない（`personality-stats.ts` が `PERSONALITY_VERSION` を
 * 引数で受けているのと同じ理由。純関数のテストに Supabase を混入させない）。
 * 実行時に AI を呼ばない・生成しない・保存しない（08 §1）。
 */

import {
  PERSONALITY_AXES,
  PERSONALITY_QUESTIONS,
  getCloseAxes,
  getPole,
  pickPersonalityCode,
  type PersonalityAxis,
} from "@/content/personality";
import { TEACHING_HINTS, type TeachingHint } from "@/content/teaching-hints";
import {
  calculateQuestionStats,
  hasCompletedPersonality,
  type StatsProfile,
} from "@/lib/personality-stats";

export interface StudentHints {
  /** 0〜3件。**0件は正規の出力**（08 §3.4）。 */
  readonly hints: readonly TeachingHint[];
  /** 僅差の軸を「教室で確かめること」に変換するための材料。 */
  readonly closeAxes: readonly PersonalityAxis[];
  /** 偏り設問のせいで決定的から外した軸（08 §3.3）。画面に理由を出す。 */
  readonly droppedBySkew: readonly PersonalityAxis[];
}

/**
 * 偏り判定を行う最小コホート人数（08 §3.3）。
 * n=5 で五分五分の設問が「一方80%以上」になる確率は 37.5% あり、小規模では設問の
 * 1/4〜1/3 が雑音で「使えない」に落ちて材料が消える。n<8 では偏り判定をしない。
 */
export const SKEW_MIN_RESPONDENTS = 8;

/** 一方がこの比以上なら偏り設問とする（08 §3.3）。 */
export const SKEW_THRESHOLD = 0.8;

/**
 * 決定的とみなす差（自分の極 − 反対の極）。5問で 5-0 / 4-1 に相当する（差3以上）。
 * 偏り設問を除いた数え直しにも同じ強さを要求する。08 §3.3 の例（Q13 の偏りを除くと
 * 実質 3-1 = 差2 の軸）は、この基準で決定的から外れる。
 */
const DECISIVE_MARGIN = 3;

const EMPTY: StudentHints = { hints: [], closeAxes: [], droppedBySkew: [] };

/**
 * 偏り設問の id 集合。
 * 回答者が SKEW_MIN_RESPONDENTS 未満のコホートでは判定せず、空集合を返す。
 * `calculateQuestionStats` の `percentage` は回答者2人以下で null になるため、
 * count / total から自前で比を出す（08 §3.3）。
 */
export function findSkewedQuestionIds(cohort: readonly StatsProfile[]): ReadonlySet<number> {
  const completed = cohort.filter(hasCompletedPersonality);
  if (completed.length < SKEW_MIN_RESPONDENTS) return new Set();

  const stats = calculateQuestionStats(completed);
  const skewed = new Set<number>();
  for (const item of stats.items) {
    if (item.total === 0) continue;
    const top = Math.max(...item.answers.map((answer) => answer.count));
    if (top / item.total >= SKEW_THRESHOLD) skewed.add(item.questionId);
  }
  return skewed;
}

/**
 * 個別カードに出す内容を決定的に組み立てる。
 *
 * - 壊れた行では throw しない（`hasCompletedPersonality` で先に絞る。08 §6.2-10）
 * - 手動でタイプを変えた行には何も出さない（教師が既に否定したデータで押し返さない。08 §3.5）
 * - 決定的（5-0 / 4-1）で、かつ偏り設問を除いて数え直しても決定的な軸だけを使う（08 §3.3）
 * - 個別には add-scaffold を返さない（足場は本人が選べる形にする。08 §2.2）
 * - 全軸 3-2 なら hints は空配列。「言えることがない」は正規の出力（08 §3.4）
 */
export function buildStudentHints(
  student: StatsProfile,
  cohort: readonly StatsProfile[],
): StudentHints {
  if (!hasCompletedPersonality(student)) return EMPTY;

  // 手動変更行。回答に基づく表示を一切しない（closeAxes も出さない。08 §3.5）。
  if (pickPersonalityCode(student.scores) !== student.personality_type) return EMPTY;

  const closeAxes = getCloseAxes(student.scores);
  const decisiveAxes = PERSONALITY_AXES.filter((axis) => !closeAxes.includes(axis));

  const skewedIds = findSkewedQuestionIds(cohort);
  const droppedBySkew: PersonalityAxis[] = [];
  const usableAxes: PersonalityAxis[] = [];

  for (const axis of decisiveAxes) {
    if (isDecisiveWithoutSkew(student, axis, skewedIds)) {
      usableAxes.push(axis);
    } else {
      droppedBySkew.push(axis);
    }
  }

  // 軸ごとに個別で出せる hint（add-scaffold 以外）を1件だけ引く。
  // 台帳の掲載順を優先順とする。カードは最大3件（08 §3.2）。
  const hints: TeachingHint[] = [];
  for (const axis of usableAxes) {
    if (hints.length >= 3) break;
    const pole = getPole(student.scores, axis);
    const hint = TEACHING_HINTS.find(
      (item) => item.axis === axis && item.pole === pole && item.direction !== "add-scaffold",
    );
    if (hint) hints.push(hint);
  }

  return { hints, closeAxes, droppedBySkew };
}

/**
 * 偏り設問を除いた残りの設問だけで数え直しても決定的か（08 §3.3）。
 * 偏り設問は個人を区別する力がほぼ無い（測っているのは教室の規範）ので、
 * その軸の得点から外し、残りで「自分の極 − 反対の極 ≥ DECISIVE_MARGIN」を要求する。
 */
function isDecisiveWithoutSkew(
  student: StatsProfile,
  axis: PersonalityAxis,
  skewedIds: ReadonlySet<number>,
): boolean {
  const pole = getPole(student.scores, axis);
  let own = 0;
  let opposite = 0;

  PERSONALITY_QUESTIONS.forEach((question, index) => {
    if (question.axis !== axis || skewedIds.has(question.id)) return;
    const chosen = student.answers[index] === "a" ? question.a.pole : question.b.pole;
    if (chosen === pole) own += 1;
    else opposite += 1;
  });

  return own - opposite >= DECISIVE_MARGIN;
}
