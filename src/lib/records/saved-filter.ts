/**
 * 学習の きろくの 絞り込みを **端末に 覚える**（2026-10-11 の 指定・願い #599）
 *
 * 前は 画面を 開くたびに 空の 条件から 始まった。生徒の 画面へ 行って もどるだけで
 * 所属・期生・ステージを 選び直す ことに なり、「遷移のたびに絞り込み条件データが
 * 消えて不自由」だった。先生が 同時に 教える 組は 1つなので、**前回の 条件で 開く**。
 *
 * ## 覚えない もの
 * 「ことばで さがす」（`text`）は 覚えない。開いた とたんに 行が 絞られて いると、
 * 先生には 記録が 消えた ように 見える。照合番号も 1回きりの 検索である。
 *
 * ## 鍵の 名前
 * `nexmax.` で 始めない。ログアウトの 片づけ（`clearNexmaxCache`）は その 接頭辞を
 * まとめて 消すので、先生の 条件まで 毎回 消えて しまう。
 *
 * ## 読めない とき
 * 端末の 保存は 止められて いる ことが ある（シークレット・サイトデータの ブロック）。
 * そのときは 空の 条件で 開く——ここは 何が あっても 投げない。
 */

import { EMPTY_FILTER, type RecordFilter } from "@/lib/records/table";

export const SAVED_FILTER_KEY = "nexmax-admin:records-filter:v1";

/** 端末の 保存の うち、ここで 使う ぶんだけ（試験で 差し替えられる ように）。 */
export type FilterStorage = Pick<Storage, "getItem" | "setItem">;

/** 覚える 項目（`text` を 除く）。 */
type SavedFilter = Omit<RecordFilter, "text">;

/** 復元の とき、いまも ある ものか 確かめる 名簿。 */
export interface KnownIds {
  readonly profileIds: ReadonlySet<string>;
  readonly stageIds: ReadonlySet<string>;
  readonly unitIds: ReadonlySet<string>;
}

/** ブラウザの 保存。触れない 環境では null（SSR・保存の ブロック）。 */
export function browserStorage(): FilterStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 覚えて いる 条件（形の 合わない 値は 落とす）。無ければ null。 */
export function readSavedFilter(storage: FilterStorage | null): Partial<SavedFilter> | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(SAVED_FILTER_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const value = parsed as Record<string, unknown>;
  const text = (key: keyof SavedFilter) =>
    typeof value[key] === "string" ? (value[key] as string) : undefined;
  return {
    university: text("university"),
    cohort: Number.isInteger(value.cohort) ? (value.cohort as number) : undefined,
    profileId: text("profileId"),
    stageId: text("stageId"),
    unitId: text("unitId"),
  };
}

/** 条件を 覚える（`text` は 覚えない）。書けなくても 投げない。 */
export function writeSavedFilter(storage: FilterStorage | null, filter: RecordFilter): void {
  if (!storage) return;
  const saved: SavedFilter = {
    university: filter.university,
    cohort: filter.cohort,
    profileId: filter.profileId,
    stageId: filter.stageId,
    unitId: filter.unitId,
  };
  try {
    storage.setItem(SAVED_FILTER_KEY, JSON.stringify(saved));
  } catch {
    // 保存できない 端末では 毎回 空の 条件で 開く（前と 同じ）
  }
}

/**
 * 所属・期生だけを 書きかえる（授業ごとの分析の ページ・2026-10-26）。
 * 2つの ページで 組を 共有する——分析で 組を 変えて 学習の きろくへ 移っても、
 * 同じ 組で 開く。メンバーの 選びは 外す（学習の きろくで 所属を 変えた ときと 同じ）。
 * ステージ・単元は 残す。
 */
export function writeSavedGroup(
  storage: FilterStorage | null,
  group: { university: string; cohort: number },
): void {
  const saved = readSavedFilter(storage);
  writeSavedFilter(storage, {
    ...EMPTY_FILTER,
    stageId: saved?.stageId ?? "",
    unitId: saved?.unitId ?? "",
    university: group.university,
    cohort: group.cohort,
  });
}

/**
 * 覚えた 条件を、**いまも ある もの**だけ 戻す。
 *
 * 消えた 学生・教材の id を そのまま 戻すと、選びが 画面に 出ない まま 効いて、
 * 先生には 理由の 分からない「きろくが ありません」だけが 出る。
 */
export function restoreFilter(saved: Partial<SavedFilter> | null, known: KnownIds): RecordFilter {
  if (!saved) return EMPTY_FILTER;
  const stageId = saved.stageId && known.stageIds.has(saved.stageId) ? saved.stageId : "";
  return {
    ...EMPTY_FILTER,
    university: saved.university ?? "",
    cohort: saved.cohort ?? 0,
    profileId: saved.profileId && known.profileIds.has(saved.profileId) ? saved.profileId : "",
    stageId,
    unitId: saved.unitId && known.unitIds.has(saved.unitId) ? saved.unitId : "",
  };
}

/** 条件が 1つでも 入って いるか（「条件を 外す」を 出すか）。 */
export function hasAnyFilter(filter: RecordFilter): boolean {
  return (
    filter.university !== "" ||
    filter.cohort !== 0 ||
    filter.profileId !== "" ||
    filter.stageId !== "" ||
    filter.unitId !== "" ||
    filter.text !== ""
  );
}
