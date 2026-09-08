"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * 「いま 順路の 鍵は 外れて いるか」の 覚え書き
 *
 * ## なぜ 端末に 覚えるのか
 *
 * `src/lib/admin-flag.ts` と まったく 同じ 事情である。教材の ページ
 *（`/[stage]/[content]`）は **ISR で 配る**ので、HTML には いまの せっていを
 * 焼けない。かと いって 学習者 全員が 必ず通る 画面で 毎回 DB へ 聞くと、
 * 30人 同時の 上限（docs/constraints.md・2026-08-11 の Error 1102）に 効いてくる。
 *
 * そこで 覚え書きを 置き、**古く なった ときだけ** 聞き直す。
 *
 * ## 賞味期限が 先生バイパスより ずっと 短い 理由
 *
 * 「その人が 先生か」は めったに 変わらないので 12時間 でよい。こちらは
 * **授業の 最中に 先生が 動かす** スイッチなので、長いと 「外したのに 開かない」に
 * なる。3分に して、教材を 1本 めくる ころには 効いて いるようにする。
 *
 * ## ずれても 危なくない
 *
 * ここが 決めるのは **順路の 鍵を 素通りするか**だけで、読めるデータは どのみち
 * RLS が 決める。読めなかった ときは **鍵が かかったまま**（false）に 倒す——
 * 通信の 失敗で 学習者 全員の 順路が 勝手に 消えるほうが 困る。
 * ログアウトでは `clearNexmaxCache()` が `nexmax.` ごと 消す（だから この
 * 鍵の 名前は **`nexmax.` で 始める**）。
 */

/** 保存の鍵。`nexmax.` 始まりにして、ログアウトで 道連れに 消えるようにする。 */
export const UNLOCK_FLAG_KEY = "nexmax.gatesUnlocked.v1";

/** 覚え書きの 賞味期限。授業中に 動かす スイッチなので 短く する。 */
export const UNLOCK_FLAG_FRESH_MS = 3 * 60 * 1000;

export interface UnlockFlag {
  /** 順路の 鍵を 外して いるか。 */
  readonly unlocked: boolean;
  /** 書いた時刻（`Date.now()`）。 */
  readonly at: number;
}

/** 壊れた保存値は「無い」とみなす（画面は 落とさない）。 */
export function parseUnlockFlag(raw: string | null): UnlockFlag | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const flag = parsed as Partial<UnlockFlag>;
    if (typeof flag.unlocked !== "boolean") return null;
    if (typeof flag.at !== "number" || !Number.isFinite(flag.at)) return null;
    return { unlocked: flag.unlocked, at: flag.at };
  } catch {
    return null;
  }
}

/** まだ 聞き直さなくてよいか。未来の時刻（時計のずれ）も 新しい扱いにする。 */
export function isUnlockFlagFresh(flag: UnlockFlag | null, now: number): boolean {
  return flag !== null && now - flag.at < UNLOCK_FLAG_FRESH_MS;
}

function readRaw(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(UNLOCK_FLAG_KEY) ?? "";
  } catch {
    // プライベートモード等。聞き直しが 増えるだけなので 黙って諦める
    return "";
  }
}

const listeners = new Set<() => void>();

/**
 * `useSyncExternalStore` 用のスナップショット。**生の文字列**を返す——
 * ここで JSON を解くと 呼ぶたびに 別のオブジェクトになり、React が 描き直し続ける。
 */
export function unlockFlagSnapshot(): string {
  return readRaw();
}

export function subscribeUnlockFlag(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** いま 分かっている「鍵は 外れて いるか」。サーバ側・未保存は false（＝鍵は かかったまま）。 */
export function readGatesUnlocked(): boolean {
  return parseUnlockFlag(readRaw())?.unlocked === true;
}

/** 読んだ結果を 端末に 控える。 */
export function rememberUnlockFlag(unlocked: boolean, now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  const next = JSON.stringify({ unlocked, at: now } satisfies UnlockFlag);
  try {
    if (window.localStorage.getItem(UNLOCK_FLAG_KEY) === next) return;
    window.localStorage.setItem(UNLOCK_FLAG_KEY, next);
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

/** 同じ画面で 何度 呼ばれても 聞きに行くのは 1回。 */
let inflight: Promise<void> | null = null;

/**
 * 覚え書きが 無い／古い ときだけ DB へ 聞き直す。
 *
 * Supabase 未設定（デモモード）や 未ログインでは `null` が 返るので **何もしない**
 *（控えも 消さない）。通しの 検証で 積んだ 覚え書きが そのまま 残る。
 */
export function refreshUnlockFlag(now: number = Date.now()): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isUnlockFlagFresh(parseUnlockFlag(readRaw()), now)) return Promise.resolve();
  if (inflight) return inflight;
  /*
   * Supabase の 一式は **聞きに行くときだけ** 読み込む（動的 import）。
   * 上に import すると、教材の ページの 束に まるごと 入る（admin-flag と 同じ）。
   */
  inflight = import("@/lib/settings-db")
    .then(({ fetchAppSettings }) => fetchAppSettings())
    .then((settings) => {
      if (settings) rememberUnlockFlag(settings.gatesUnlocked);
    })
    .catch(() => {
      // 通信が だめでも 学習は 止めない（鍵は これまでどおり かかったまま）
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * 「順路の 鍵は 外れて いるか」を 画面から 使う。最初の描画は 覚え書きの まま
 *（ちらつかない）で、古ければ 裏で 聞き直して 描き直す。
 */
export function useGatesUnlocked(): boolean {
  const raw = useSyncExternalStore(subscribeUnlockFlag, unlockFlagSnapshot, () => "");
  useEffect(() => {
    void refreshUnlockFlag();
  }, []);
  return parseUnlockFlag(raw)?.unlocked === true;
}
