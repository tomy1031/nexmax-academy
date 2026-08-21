/**
 * 学校と 何期生（願い #27）と 所属（願い #153-6）。
 *
 * 先生がクラスを見分けるための情報。学習者が自分で選ぶので、選べる値は
 * ここだけに置く（画面ごとに一覧を書くと、増えたときに片方だけ直る）。
 */

export const UNIVERSITIES = ["AUPP", "CADT"] as const;

/**
 * 学校ではない所属（願い #153-6）。**学習者の画面には出さない**——学習者が
 * 自分で「講師・スタッフ」を選べてしまうと、先生の一覧が汚れるため。
 * 先生の画面（ユーザー管理）だけがこの値を付けられる。
 */
export const STAFF_AFFILIATION = "講師・スタッフ";

/** 先生の画面で選べる所属の全部（学校＋講師・スタッフ）。 */
export const AFFILIATIONS = [...UNIVERSITIES, STAFF_AFFILIATION] as const;

export type University = (typeof AFFILIATIONS)[number];

/** 期生は1〜5。0 は「まだ選んでいない」を表す（この列を足す前の行も 0）。 */
export const COHORTS = [1, 2, 3, 4, 5] as const;
export type Cohort = (typeof COHORTS)[number];

export interface LearnerSchool {
  university: University | "";
  cohort: number;
}

export function isUniversity(value: unknown): value is University {
  return AFFILIATIONS.includes(value as University);
}

/** 学校ではなく 講師・スタッフか。期生を求めない・CSVの見せかたを分ける判断に使う。 */
export function isStaff(value: unknown): boolean {
  return value === STAFF_AFFILIATION;
}

export function isCohort(value: unknown): value is Cohort {
  return typeof value === "number" && COHORTS.includes(value as Cohort);
}

/**
 * 学校の入れ物。DBの行（`university` は素の string）も、画面の選択も同じ形で渡せるようにする。
 * 中身が正しいかは `isUniversity` / `isCohort` で確かめるので、入口は広く取ってよい。
 */
type SchoolLike = { university?: string | null; cohort?: number | null } | null | undefined;

/**
 * 保存してよい選び方か（学校と期生の両方がそろっているか）。
 *
 * **講師・スタッフには期生を求めない。** ここで期生まで求めると、先生の行は
 * いつまでも「未設定」のままになり、`/welcome` と `/map` を往復して詰む。
 */
export function isSchoolChosen(school: SchoolLike): boolean {
  if (!school) return false;
  if (isStaff(school.university)) return true;
  return isUniversity(school.university) && isCohort(school.cohort);
}

/** 先生の画面とCSVに出す表示（例: `AUPP 3期生`）。選んでいなければ空。 */
export function formatSchool(school: SchoolLike): string {
  if (!isSchoolChosen(school)) return "";
  if (isStaff(school!.university)) return STAFF_AFFILIATION;
  return `${school!.university} ${school!.cohort}期生`;
}
