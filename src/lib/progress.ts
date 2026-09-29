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

/**
 * 最後に 教材を 開いた ステージ（まだ クリアして いない もの）。
 * 地図の「いま ここ」を 決める 手がかりに なる（`deriveProgress`）。
 */
const STUDYING_KEY = "nexmax.studying.v1";

/**
 * - cleared … クリア済み
 * - current … いま ここ
 * - skipped … とばした（いま ここ／クリア済みの ステージより 前に あって、まだ おわって いない）
 * - locked  … まだ 来て いない（いま ここ より 先）
 */
export type StageStatus = "cleared" | "current" | "skipped" | "locked";

export interface StageProgress {
  /** クリア済みステージの id（マップの並び順） */
  clearedIds: readonly string[];
  /** いま取り組むステージ。すべてクリア済みなら null */
  currentStageId: string | null;
  /** とばしたステージの id（マップの並び順）。`StageStatus` の skipped。 */
  skippedIds: readonly string[];
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

/**
 * ステージ1つをクリア済みにする。
 *
 * ステージの並び（`stageIds`）を要求しない。並びを知っているのはマップだけで、
 * 教材の画面は自分のステージしか知らないためである。並びが要らないのは
 * **読むときに正規化している**から（`getClearedStageIds`）——ここでは足すだけでよく、
 * 消したステージのIDが残っても読み側が捨てる。
 */
export function markStageCleared(stageId: string): void {
  const store = storage();
  if (!store) return;
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(PROGRESS_KEY) ?? "[]");
    if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    ids = [];
  }
  if (ids.includes(stageId)) return;
  store.setItem(PROGRESS_KEY, JSON.stringify([...ids, stageId]));
}

/** 保存してある文字列そのまま（無ければ ""）。`clearedIdsSnapshot` と 同じく スナップショット用。 */
export function studyingStageSnapshot(): string {
  return storage()?.getItem(STUDYING_KEY) ?? "";
}

/**
 * 教材を 開いた ステージを「いま 学習中」として 覚える。
 *
 * **クリア済みの ステージでは 書かない。** 見直しに 戻った だけで「いま ここ」が
 * 後ろへ 引き戻されると、地図を 開くたびに 見直した ステージへ 飛ばされる。
 */
export function rememberStudyingStage(stageId: string): void {
  const store = storage();
  if (!store) return;
  if (getClearedStageIds([stageId]).length > 0) return;
  store.setItem(STUDYING_KEY, stageId);
}

/**
 * クリア済み id の一覧から、画面表示に使う進捗をまとめて導く。
 *
 * 「いま ここ」は **最後に 教材を 開いた ステージ**（`studyingStageId`）。
 * それが 無い・もう クリアした・地図に 無い ときは、**いちばん 先まで クリアした
 * ステージの つぎ**にする。
 *
 * 以前は「上から 数えて 最初の 未クリア」だった。それだと **いくつか とばした
 * 学習者は、ずっと とばした ステージに 引き戻される**——授業は ステージ7 なのに、
 * 地図の「いま ここ」は 休んだ 日の ステージ3 に 立つ（2026-09-29 の 指定）。
 * とばした ステージは `skippedIds` に 入り、地図では 🔒 を 出さない。
 */
export function deriveProgress(
  clearedIds: readonly string[],
  stageIds: readonly string[],
  studyingStageId: string | null = null,
): StageProgress {
  const cleared = new Set(clearedIds);
  const totalCount = stageIds.length;
  const clearedCount = stageIds.filter((id) => cleared.has(id)).length;

  const furthestCleared = stageIds.findLastIndex((id) => cleared.has(id));
  const studying =
    studyingStageId && stageIds.includes(studyingStageId) && !cleared.has(studyingStageId)
      ? studyingStageId
      : null;
  const currentStageId =
    studying ??
    stageIds[furthestCleared + 1] ??
    // 先は ぜんぶ クリア済み。残って いるのは とばした ステージだけ
    stageIds.find((id) => !cleared.has(id)) ??
    null;

  const passedUntil = Math.max(
    currentStageId ? stageIds.indexOf(currentStageId) : -1,
    furthestCleared,
  );
  const skippedIds = stageIds.filter(
    (id, index) => index < passedUntil && id !== currentStageId && !cleared.has(id),
  );

  return {
    clearedIds,
    currentStageId,
    skippedIds,
    clearedCount,
    totalCount,
    percent: totalCount === 0 ? 0 : Math.round((clearedCount / totalCount) * 100),
  };
}

export function stageStatus(stageId: string, progress: StageProgress): StageStatus {
  if (progress.clearedIds.includes(stageId)) return "cleared";
  if (stageId === progress.currentStageId) return "current";
  return progress.skippedIds.includes(stageId) ? "skipped" : "locked";
}
