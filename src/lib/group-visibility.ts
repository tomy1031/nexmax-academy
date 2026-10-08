"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * 組（大学 × 期生）ごとの 表示／非表示 — 学習者の 画面の 側（願い #589）
 *
 * 2026-10-08 の 指定:「デフォルトはどの学校のどの期も同じ表示状態からスタートしたいけど、
 * 場合によって非表示にしたりするものもあって欲しい」。先生は「クラスの 設定」
 *（`/admin/ai-time`）で 組ごとに 隠す ステージ・教材を えらぶ。
 *
 * ## 隠すと どう なるか
 * - 地図（`/map`）と ステージの トップから 消える
 * - **順路の 鍵と 進み具合の 数から 外す**——隠した 関門で 学習者が 止まらない ため。
 *   ここを 外し忘れると、見えない 教材の 前で「おわると つぎへ」と 言われつづける
 * - URL を 直接 開けば 見られる（隠すのは 並びから だけ。中身を 守る 関所では ない）
 * - ステージの 番号（STEP 01…）は 付け直さない。地図・ステージ・教材の 枠で
 *   番号が 割れない ように する（番号は サーバで 決まって いる）
 *
 * ## 読みかた
 * `my_group_visibility()`（DB の 関数）を 1回 呼ぶ。組は DB の 側で 引くので、端末が
 * 組を 知らなくて よい。3分 ためる（鍵の 外し `unlock-flag.ts` と 同じ）。
 * Supabase の 一式は **聞きに 行く ときだけ** 読み込む（教材の ページの 束を 太らせない）。
 * 読めない ときは「何も 隠さない」——いまの 画面の まま。
 */

export interface GroupVisibility {
  /** 隠す ステージの id。 */
  readonly hiddenStages: readonly string[];
  /** 隠す 教材（`ステージid/教材id`）。 */
  readonly hiddenContents: readonly string[];
}

export const NO_HIDDEN: GroupVisibility = { hiddenStages: [], hiddenContents: [] };

/** 隠す 教材の 鍵。同じ 教材が 2つの ステージに 入る ことが あるので ステージと 組で 持つ。 */
export function contentVisibilityKey(stageId: string, contentId: string): string {
  return `${stageId}/${contentId}`;
}

export function isStageHidden(visibility: GroupVisibility, stageId: string): boolean {
  return visibility.hiddenStages.includes(stageId);
}

export function isContentHidden(
  visibility: GroupVisibility,
  stageId: string,
  contentId: string,
): boolean {
  return visibility.hiddenContents.includes(contentVisibilityKey(stageId, contentId));
}

/**
 * ステージの 中の 並びから 隠す 教材を 抜く（ステージの トップ・地図の 中身）。
 * 並びの 順は 変えない。
 */
export function visibleContents<T extends { readonly id: string }>(
  items: readonly T[],
  stageId: string,
  visibility: GroupVisibility,
): T[] {
  return items.filter((item) => !isContentHidden(visibility, stageId, item.id));
}

/**
 * 教材の 枠（`ContentFrame`）の 並びと、いま 開いて いる 位置。
 *
 * **いま 開いて いる 教材は 隠して いても 残す**——URL を 直接 開いた 人の 画面から
 * 自分自身が 消えると、「ステージに もどる」も「つぎは」も 位置を 失う。
 * そのかわり 関門は それ以外の 見える 教材だけで 数える。
 */
export function visibleFrame<T extends { readonly id: string }>(
  items: readonly T[],
  currentIndex: number,
  stageId: string,
  visibility: GroupVisibility,
): { items: T[]; currentIndex: number } {
  const current = items[currentIndex];
  const kept = items.filter(
    (item, index) => index === currentIndex || !isContentHidden(visibility, stageId, item.id),
  );
  return { items: kept, currentIndex: current ? kept.indexOf(current) : currentIndex };
}

/**
 * 地図に 出す ステージ（隠した ステージを 抜き、中の 教材も 抜く）。
 *
 * 中の 教材は「つづきから」の 行き先・💎 の 数・カードの 種類の 札に 使う ので、
 * ステージの トップと 同じ 抜き方に そろえる。種類の 札（`kinds`）も 残った 教材から 出し直す。
 * 番号（`number`）は 付け直さない（ファイルの 冒頭の 説明）。
 */
export function visibleMapStages<
  S extends {
    readonly id: string;
    readonly contents: readonly { readonly id: string; readonly type: string }[];
    readonly kinds: readonly string[];
  },
>(stages: readonly S[], visibility: GroupVisibility): S[] {
  return stages
    .filter((stage) => !isStageHidden(visibility, stage.id))
    .map((stage) => {
      const contents = visibleContents(stage.contents, stage.id, visibility);
      if (contents.length === stage.contents.length) return stage;
      const kinds = stage.kinds.filter((kind) => contents.some((one) => one.type === kind));
      return { ...stage, contents, kinds };
    });
}

/** 地図の 道のりの エリア（隠した ステージの エリアを 抜く。ステージの 無い エリアは 残す）。 */
export function visibleMapAreas<A extends { readonly stageId: string | null }>(
  areas: readonly A[],
  visibility: GroupVisibility,
): A[] {
  return areas.filter((area) => area.stageId === null || !isStageHidden(visibility, area.stageId));
}

/** 保存の 形（端末）。 */
interface Cached extends GroupVisibility {
  /** 書いた 時刻（`Date.now()`）。 */
  readonly at: number;
}

export const GROUP_VISIBILITY_KEY = "nexmax.groupVisibility.v1";

/** ためて おく 時間（鍵の 外しと 同じ 3分）。先生が 変えてから 生徒に 届くまでの 遅れ。 */
export const GROUP_VISIBILITY_FRESH_MS = 3 * 60 * 1000;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];
}

export function parseGroupVisibility(raw: string | null): Cached | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const bag = parsed as { at?: unknown; hiddenStages?: unknown; hiddenContents?: unknown };
    if (typeof bag.at !== "number" || !Number.isFinite(bag.at)) return null;
    return {
      at: bag.at,
      hiddenStages: strings(bag.hiddenStages),
      hiddenContents: strings(bag.hiddenContents),
    };
  } catch {
    return null;
  }
}

function readRaw(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(GROUP_VISIBILITY_KEY) ?? "";
  } catch {
    return "";
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 覚える（テストからも 呼ぶ）。中身が 同じなら 知らせない（描き直しを 増やさない）。 */
export function rememberGroupVisibility(
  visibility: GroupVisibility,
  now: number = Date.now(),
): void {
  if (typeof window === "undefined") return;
  const next = JSON.stringify({
    at: now,
    hiddenStages: [...visibility.hiddenStages],
    hiddenContents: [...visibility.hiddenContents],
  } satisfies Cached);
  try {
    window.localStorage.setItem(GROUP_VISIBILITY_KEY, next);
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

let inflight: Promise<void> | null = null;

/** 古ければ 聞き直す（3分 ためる）。 */
export function refreshGroupVisibility(now: number = Date.now()): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const cached = parseGroupVisibility(readRaw());
  if (cached && now - cached.at < GROUP_VISIBILITY_FRESH_MS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = import("@/lib/supabase/client")
    .then(async ({ createClient }) => {
      const supabase = createClient();
      // デモモード（Supabase 無し）・未ログインは 何も 隠さない
      if (!supabase) return;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const { data, error } = await supabase.rpc("my_group_visibility");
      if (error) return;
      const row = (Array.isArray(data) ? data[0] : data) as
        { hidden_stages?: unknown; hidden_contents?: unknown } | null | undefined;
      rememberGroupVisibility({
        hiddenStages: strings(row?.hidden_stages),
        hiddenContents: strings(row?.hidden_contents),
      });
    })
    .catch(() => {
      // 通信が だめでも 学習は 止めない（前に 覚えた もの か、何も 隠さない）
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** いまの 組の 隠す もの。読めて いなければ 何も 隠さない。 */
export function useGroupVisibility(): GroupVisibility {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  useEffect(() => {
    void refreshGroupVisibility();
  }, []);
  // 同じ 文字列なら 同じ もの を 返す（並びの 計算を 描くたびに やり直さない）
  return useMemo(() => parseGroupVisibility(raw) ?? NO_HIDDEN, [raw]);
}
