/**
 * 授業ごとの回答分析を画面に出す前に整える（要望 #599・2026-10-11）
 *
 * 分析は Claude の定期タスクが JSON を組み立てて DB に書く。形が少し崩れていても
 * 先生の画面を落とさないように、ここで読める項目だけを拾う（崩れた項目は黙って捨てず、
 * 数えて画面に「読めなかった項目」として出す）。
 */

import type { ClassReportRow } from "@/lib/records/records-db";

export interface ClassReportView {
  readonly id: string;
  readonly classDate: string;
  readonly university: string;
  readonly cohort: number;
  readonly students: number;
  readonly summary: string;
  readonly followUp: readonly {
    readonly profileId: string;
    readonly name: string;
    readonly reasons: readonly string[];
    readonly quotes: readonly string[];
  }[];
  readonly aiSuspects: readonly {
    readonly profileId: string;
    readonly name: string;
    readonly quote: string;
    readonly reason: string;
  }[];
  readonly stumbles: readonly {
    readonly title: string;
    readonly detail: string;
    readonly quotes: readonly string[];
  }[];
  readonly nextSteps: readonly string[];
  /** 形が合わずに読めなかった項目の数。 */
  readonly dropped: number;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(text).filter((one) => one !== "") : [];
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((one): one is Record<string, unknown> => typeof one === "object" && one !== null)
    : [];
const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

export function toClassReportView(row: ClassReportRow): ClassReportView {
  const followUp = list(row.follow_up)
    .map((one) => ({
      profileId: text(one.profile_id),
      name: text(one.name),
      reasons: texts(one.reasons),
      quotes: texts(one.quotes),
    }))
    .filter((one) => one.name !== "");
  const aiSuspects = list(row.ai_suspects)
    .map((one) => ({
      profileId: text(one.profile_id),
      name: text(one.name),
      quote: text(one.quote),
      reason: text(one.reason),
    }))
    .filter((one) => one.name !== "" && one.quote !== "");
  const stumbles = list(row.stumbles)
    .map((one) => ({ title: text(one.title), detail: text(one.detail), quotes: texts(one.quotes) }))
    .filter((one) => one.title !== "");
  const nextSteps = texts(row.next_steps);
  const dropped =
    count(row.follow_up) -
    followUp.length +
    count(row.ai_suspects) -
    aiSuspects.length +
    count(row.stumbles) -
    stumbles.length +
    count(row.next_steps) -
    nextSteps.length;
  return {
    id: row.id,
    classDate: row.class_date,
    university: text(row.university),
    cohort: Number.isInteger(row.cohort) ? row.cohort : 0,
    students: Number.isInteger(row.students) ? row.students : 0,
    summary: text(row.summary),
    followUp,
    aiSuspects,
    stumbles,
    nextSteps,
    dropped,
  };
}

/** 「AUPP 2期生」の形。組の無い行は「組の指定なし」。 */
export function groupLabel(report: Pick<ClassReportView, "university" | "cohort">): string {
  if (report.university === "" && report.cohort === 0) return "組の指定なし";
  return `${report.university}${report.cohort > 0 ? ` ${report.cohort}期生` : ""}`.trim();
}

/** 「10/7（水）」の形（授業の日はカンボジア時間の日付だけで持つ）。 */
export function classDateLabel(classDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(classDate);
  if (!match) return classDate;
  const [, y, m, d] = match;
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
  return `${Number(m)}/${Number(d)}（${"日月火水木金土"[day]}）`;
}
