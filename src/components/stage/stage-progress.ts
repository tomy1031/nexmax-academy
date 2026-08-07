/**
 * ステージ詳細の純ロジック（設計07 §3）
 *
 * 画面（stage-detail.tsx）から「順番・進み具合・行き先」の計算だけを抜いたもの。
 * ここに JSX を持ち込まないので node 環境の単体テストでそのまま検証できる。
 */

import type { ContentProgress } from "@/lib/progress/store";

/**
 * 種別の見た目・呼び名・行き先は src/lib/content-kinds.ts が唯一の出どころ。
 * ここで再定義すると、同じ教材が画面ごとに違う名前で呼ばれる。
 */
export { contentHref, contentKindMeta } from "@/lib/content-kinds";

/**
 * 進捗を1文字にたたむ。useSyncExternalStore のスナップショットは
 * 値が同じなら同じ文字列でなければならないため、配列ではなく文字列で持つ。
 */
export type ContentStatusCode = "0" | "1" | "2";

export const STATUS_BADGE: Record<ContentStatusCode, { mark: string; label: string }> = {
  "0": { mark: "○", label: "これから" },
  "1": { mark: "▶", label: "とちゅう" },
  "2": { mark: "✅", label: "おわった" },
};

export function statusCode(progress: ContentProgress | null | undefined): ContentStatusCode {
  if (progress?.status === "completed") return "2";
  if (progress?.status === "started") return "1";
  return "0";
}

export function decodeStatuses(key: string): ContentStatusCode[] {
  return [...key].map((c) => (c === "1" || c === "2" ? c : "0"));
}

export interface StageProgressSummary {
  readonly done: number;
  readonly total: number;
  readonly percent: number;
  /** 最初の「まだ おわっていない」コンテンツの位置。全部おわったら 0、コンテンツ0件なら -1。 */
  readonly nextIndex: number;
  readonly allDone: boolean;
}

/** 「4つ中2つ おわった」と「つづきから」の行き先をまとめて出す。 */
export function summarizeStageProgress(codes: readonly ContentStatusCode[]): StageProgressSummary {
  const total = codes.length;
  const done = codes.filter((c) => c === "2").length;
  if (total === 0) return { done: 0, total: 0, percent: 0, nextIndex: -1, allDone: false };
  const firstUnfinished = codes.findIndex((c) => c !== "2");
  const allDone = firstUnfinished === -1;
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    // 全部おわっていたら先頭に戻す（「もういちど 見る」の行き先）
    nextIndex: allDone ? 0 : firstUnfinished,
    allDone,
  };
}
