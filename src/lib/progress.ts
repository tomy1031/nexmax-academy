import { STAGES } from "@/content/stages";

const PROGRESS_KEY = "nexmax.progress.v1";

const STAGE_ORDER = new Map(STAGES.map((stage, index) => [stage.id, index]));

export type StageStatus = "cleared" | "current" | "locked";

export interface StageProgress {
  /** クリア済みステージの id（STAGES の並び順） */
  clearedIds: readonly string[];
  /** いま取り組むステージ。すべてクリア済みなら null */
  currentStageId: string | null;
  clearedCount: number;
  totalCount: number;
  /** 0–100 の整数 */
  percent: number;
}

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

/** 未知の id を捨て、重複を除き、STAGES の並び順に整える */
function normalize(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && STAGE_ORDER.has(id)) seen.add(id);
  }
  return [...seen].sort((a, b) => STAGE_ORDER.get(a)! - STAGE_ORDER.get(b)!);
}

export function getClearedStageIds(): string[] {
  const value = storage()?.getItem(PROGRESS_KEY);
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? normalize(parsed) : [];
  } catch {
    return [];
  }
}

export function saveClearedStageIds(ids: readonly string[]): void {
  storage()?.setItem(PROGRESS_KEY, JSON.stringify(normalize(ids)));
}

/** クリア済み id の一覧から、画面表示に使う進捗をまとめて導く */
export function deriveProgress(clearedIds: readonly string[]): StageProgress {
  const cleared = new Set(clearedIds);
  const totalCount = STAGES.length;
  const clearedCount = STAGES.filter((stage) => cleared.has(stage.id)).length;

  return {
    clearedIds,
    currentStageId: STAGES.find((stage) => !cleared.has(stage.id))?.id ?? null,
    clearedCount,
    totalCount,
    percent: totalCount === 0 ? 0 : Math.round((clearedCount / totalCount) * 100),
  };
}

export function stageStatus(stageId: string, progress: StageProgress): StageStatus {
  if (progress.clearedIds.includes(stageId)) return "cleared";
  return stageId === progress.currentStageId ? "current" : "locked";
}
