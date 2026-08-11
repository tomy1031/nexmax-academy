/**
 * 学校と 何期生（願い #27）。
 *
 * 先生がクラスを見分けるための情報。学習者が自分で選ぶので、選べる値は
 * ここだけに置く（画面ごとに一覧を書くと、増えたときに片方だけ直る）。
 */

export const UNIVERSITIES = ["AUPP", "CADT"] as const;
export type University = (typeof UNIVERSITIES)[number];

/** 期生は1〜5。0 は「まだ選んでいない」を表す（この列を足す前の行も 0）。 */
export const COHORTS = [1, 2, 3, 4, 5] as const;
export type Cohort = (typeof COHORTS)[number];

export interface LearnerSchool {
  university: University | "";
  cohort: number;
}

export function isUniversity(value: unknown): value is University {
  return UNIVERSITIES.includes(value as University);
}

export function isCohort(value: unknown): value is Cohort {
  return typeof value === "number" && COHORTS.includes(value as Cohort);
}

/**
 * 学校の入れ物。DBの行（`university` は素の string）も、画面の選択も同じ形で渡せるようにする。
 * 中身が正しいかは `isUniversity` / `isCohort` で確かめるので、入口は広く取ってよい。
 */
type SchoolLike = { university?: string | null; cohort?: number | null } | null | undefined;

/** 保存してよい選び方か（学校と期生の両方がそろっているか）。 */
export function isSchoolChosen(school: SchoolLike): boolean {
  if (!school) return false;
  return isUniversity(school.university) && isCohort(school.cohort);
}

/** 先生の画面とCSVに出す表示（例: `AUPP 3期生`）。選んでいなければ空。 */
export function formatSchool(school: SchoolLike): string {
  if (!isSchoolChosen(school)) return "";
  return `${school!.university} ${school!.cohort}期生`;
}
