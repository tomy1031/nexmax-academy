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
 * 最後に 開いた ステージ（トップでも、中の 教材でも）。**進み具合とは 関係ない**。
 * 地図は ひらいた ときに ここへ 下りる（`mapLanding`・2026-09-30 の 指定）。
 */
const LAST_OPENED_KEY = "nexmax.lastOpened.v1";

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

/**
 * 保存してある文字列そのまま（無ければ ""）。`clearedIdsSnapshot` と 同じく スナップショット用。
 *
 * 読み書きとも 例外を 外へ 出さない（プライベートモード・容量超過）。これは 地図と
 * **全教材の 画面**から 呼ばれるので、投げると 学習の 画面ごと エラー画面に 替わる。
 */
export function studyingStageSnapshot(): string {
  try {
    return storage()?.getItem(STUDYING_KEY) ?? "";
  } catch {
    return "";
  }
}

/** 最後に 開いた ステージ（無ければ ""）。例外を 外へ 出さない 理由は `studyingStageSnapshot` と 同じ。 */
export function lastOpenedStageSnapshot(): string {
  try {
    return storage()?.getItem(LAST_OPENED_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * 開いた ステージを 覚える（ステージの トップと 教材の 枠が 開いた ときに 呼ぶ）。
 *
 * クリア済みでも、のぞいた だけでも 書く。これは「どこまで 進んだか」では なく
 * 「どこから 地図へ 戻って きたか」の 控えなので、見直しも のぞきも 数える。
 */
export function rememberOpenedStage(stageId: string): void {
  try {
    storage()?.setItem(LAST_OPENED_KEY, stageId);
  } catch {
    /* 覚えられなくても 学習は 続けられる（地図は いま ここ へ 下りる） */
  }
}

/**
 * 教材を おえた ステージを「いま 学習中」として 覚える。
 *
 * **クリア済みの ステージでは 書かない。** 見直しに 戻った だけで「いま ここ」が
 * 後ろへ 引き戻されると、地図を 開くたびに 見直した ステージへ 飛ばされる。
 */
export function rememberStudyingStage(stageId: string): void {
  try {
    const store = storage();
    if (!store) return;
    if (getClearedStageIds([stageId]).length > 0) return;
    store.setItem(STUDYING_KEY, stageId);
  } catch {
    /* 覚えられなくても 学習は 続けられる（地図は いちばん 先の クリアの つぎに 戻る） */
  }
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

/**
 * 地図を ひらいた ときに 下りる 先（2026-09-29 の 指定「毎回 一番上は きつい」）。
 *
 * - **最後に 開いた ステージ**（`lastOpenedStageId`・地図に ある もの）… そこ。
 *   進み具合とは 関係なく、戻って きた 場所に 戻す（2026-09-30 の 指定）
 * - それが 無ければ いま ここ の ステージ … `{ kind: "stage" }`
 * - ぜんぶ クリア … `{ kind: "goal" }`（地図は ゴールへ。カードには ゴールが 無いので 下りない）
 * - **はじめての 学習者**（まだ 何も クリアして いない・教材も おえて いない）… null。
 *   一番上の START の 看板から 見せる
 *
 * 2026-09-29 版は 進み具合（いま ここ）へ 下りて いた。すると「報告を 開いて 戻ったのに、
 * 先まで 進めて いた 要件定義に 下りる」——見て いた 場所から 引き離される（ユーザーの 指摘）。
 * 画面の 行き来は 進み具合で なく **最後に 開いた もの** で 決める。
 *
 * `lastOpened.stageIds` は 地図の 並び。最後に 開いた ステージが 地図に 無い（消した・
 * 地図に 出さない）ときは 数えない。並びを 渡し忘れられない よう、ID と 対で 受け取る。
 *
 * 地図は ログインの 内側に あって 通しの 検証から 見えない。見張れるのは 単体テスト
 * だけなので、判断は 部品に 書かず ここに 置く（map-data.ts の `mapStageActions` と 同じ 理由）。
 */
export type MapLanding = { kind: "stage"; stageId: string } | { kind: "goal" } | null;

export function mapLanding(
  progress: StageProgress,
  studyingStageId: string | null,
  lastOpened?: { stageId: string | null; stageIds: readonly string[] },
): MapLanding {
  if (lastOpened?.stageId && lastOpened.stageIds.includes(lastOpened.stageId)) {
    return { kind: "stage", stageId: lastOpened.stageId };
  }
  if (progress.currentStageId === null) {
    return progress.clearedCount > 0 ? { kind: "goal" } : null;
  }
  const fresh = progress.clearedCount === 0 && progress.currentStageId !== studyingStageId;
  return fresh ? null : { kind: "stage", stageId: progress.currentStageId };
}

/**
 * 地図を ひらいた ときに はじめから 開いて おく パネル。**下りた 先の ステージ**。
 * 下りた 先が ステージで ない（ゴール・一番上）ときは「いま ここ」。
 *
 * 下りた 先の パネルが 閉じて いると、戻って きた 場所なのに 押せる ものが 無い。
 */
export function mapInitialPanel(landing: MapLanding, progress: StageProgress): string | null {
  return landing?.kind === "stage" ? landing.stageId : progress.currentStageId;
}

export function stageStatus(stageId: string, progress: StageProgress): StageStatus {
  if (progress.clearedIds.includes(stageId)) return "cleared";
  if (stageId === progress.currentStageId) return "current";
  return progress.skippedIds.includes(stageId) ? "skipped" : "locked";
}
