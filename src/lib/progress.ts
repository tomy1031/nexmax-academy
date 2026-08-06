/**
 * マップの進み具合（クリア済みステージ）
 *
 * ステージの並びはもうコードに無い。先生がスタジオで作り、並び替えたものが正なので、
 * 並びは呼ぶ側が渡す（`stageIds` = マップに出ている順のID）。
 * 渡さない設計に戻すと、ステージを1つ足すたびにここも直すことになる。
 *
 * 保存してある id のうち、いまマップに無いものは捨てる——消したステージの
 * クリア記録が残っていると、「5つ中6つ おわった」のような表示が出る。
 */

const PROGRESS_KEY = "nexmax.progress.v1";

export type StageStatus = "cleared" | "current" | "locked";

export interface StageProgress {
  /** クリア済みステージの id（マップの並び順） */
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

/** いまマップに無い id を捨て、重複を除き、マップの並び順に整える */
function normalize(ids: readonly unknown[], stageIds: readonly string[]): string[] {
  const order = new Map(stageIds.map((id, index) => [id, index]));
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && order.has(id)) seen.add(id);
  }
  return [...seen].sort((a, b) => order.get(a)! - order.get(b)!);
}

/**
 * 保存してある文字列そのまま。`useSyncExternalStore` のスナップショットに使う。
 *
 * ここで正規化しない。正規化にはステージの並びが要り、並びが変わるたびに
 * 別の文字列が返るとスナップショットが安定せず、React が描画を繰り返す。
 */
export function clearedIdsSnapshot(): string {
  return storage()?.getItem(PROGRESS_KEY) ?? "[]";
}

export function getClearedStageIds(stageIds: readonly string[]): string[] {
  try {
    const parsed: unknown = JSON.parse(clearedIdsSnapshot());
    return Array.isArray(parsed) ? normalize(parsed, stageIds) : [];
  } catch {
    return [];
  }
}

export function saveClearedStageIds(ids: readonly string[], stageIds: readonly string[]): void {
  storage()?.setItem(PROGRESS_KEY, JSON.stringify(normalize(ids, stageIds)));
}

/** クリア済み id の一覧から、画面表示に使う進捗をまとめて導く */
export function deriveProgress(
  clearedIds: readonly string[],
  stageIds: readonly string[],
): StageProgress {
  const cleared = new Set(clearedIds);
  const totalCount = stageIds.length;
  const clearedCount = stageIds.filter((id) => cleared.has(id)).length;

  return {
    clearedIds,
    currentStageId: stageIds.find((id) => !cleared.has(id)) ?? null,
    clearedCount,
    totalCount,
    percent: totalCount === 0 ? 0 : Math.round((clearedCount / totalCount) * 100),
  };
}

export function stageStatus(stageId: string, progress: StageProgress): StageStatus {
  if (progress.clearedIds.includes(stageId)) return "cleared";
  return stageId === progress.currentStageId ? "current" : "locked";
}
