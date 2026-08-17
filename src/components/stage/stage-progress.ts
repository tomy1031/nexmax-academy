/**
 * ステージ詳細の純ロジック（設計07 §3）
 *
 * 画面（stage-detail.tsx）から「順番・進み具合・行き先」の計算だけを抜いたもの。
 * ここに JSX を持ち込まないので node 環境の単体テストでそのまま検証できる。
 */

import type { ContentRefType } from "@/content/schema";
import { contentKindMeta } from "@/lib/content-kinds";
import type { ContentProgress } from "@/lib/progress/store";

/**
 * 種別の見た目・呼び名・行き先は src/lib/content-kinds.ts が唯一の出どころ。
 * ここで再定義すると、同じ教材が画面ごとに違う名前で呼ばれる。
 */
export { contentHref, contentKindMeta } from "@/lib/content-kinds";

/**
 * その教材が 関門か を決める。**ステージ側の 指定が 種別の 既定に 勝つ**
 *（ステージの `contents[].gates` — schema.ts）。
 *
 * 1行で 書ける式を わざわざ 関数に したのは、`??` を `||` に 書き換えると
 * **`gates: false` が 素通りして 既定の true に 戻る**ため（false は falsy）。
 * 画面の中に 埋めたままだと この取り違えを テストで 捕まえられない。
 */
export function resolveGates(type: ContentRefType, override?: boolean): boolean {
  return override ?? contentKindMeta(type).gates;
}

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

/**
 * 関門の計算（どこまで開けるか）
 *
 * 学習者が まだ おわっていない教材を 飛ばして 先へ 行けないようにするための土台。
 * ただし**関門にしない種別**がある（`gates: false` — いまは スライド）。
 * その教材は「見ていなくても先へ進めるし、自分自身も いつでも開ける」。
 * 先生の しりょうを 通行の条件にすると、資料1枚で ステージ全体が止まるため
 *（2026-08-14 ユーザー指定）。
 *
 * JSX を持たない純関数なので、node 環境の単体テストでそのまま検証できる。
 */
export interface StageGating {
  /** その教材を「通った」とみなすか（おわった、または 関門でない）。 */
  readonly passed: readonly boolean[];
  /** いま その教材を ひらけるか。 */
  readonly openable: readonly boolean[];
  /** まだ通っていない 最初の関門の位置。ぜんぶ通っていたら -1。 */
  readonly blockedAt: number;
  /** ステージを おえたことに してよいか（関門をぜんぶ通ったか）。 */
  readonly allPassed: boolean;
}

/**
 * @param codes  教材ごとの進捗（statusCode）
 * @param gates  教材ごとに 関門か（content-kinds.ts の `gates`）
 */
export function gateStage(
  codes: readonly ContentStatusCode[],
  gates: readonly boolean[],
): StageGating {
  const passed = codes.map((code, index) => code === "2" || gates[index] === false);
  const blockedAt = passed.findIndex((ok) => !ok);
  // 関門の手前までは開ける。関門そのものも開ける（開けないと おわらせられない）
  const openUntil = blockedAt < 0 ? passed.length - 1 : blockedAt;
  const openable = passed.map((_, index) => index <= openUntil || gates[index] === false);
  return { passed, openable, blockedAt, allPassed: codes.length > 0 && blockedAt < 0 };
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
