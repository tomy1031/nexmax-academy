"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * 「いま 見ている人は 先生（管理者）か」の 覚え書き
 *
 * ## なぜ 端末に 覚えるのか
 *
 * 教材の ページ（`/[stage]/[content]`）は **ISR で 配る**ので、HTML には
 * 誰が 見ているかを 焼けない。だから 判定は ブラウザ側で しかできない。
 * ところが 素直に 毎回 DB へ 聞くと、**学習者 全員が 必ず通る 画面**に
 * 外部往復が 1つ 増える——30人 同時の 上限（docs/constraints.md・
 * 2026-08-11 の Error 1102）に 効いてくるのは まさに この足し算である。
 *
 * そこで:
 *
 * 1. マップのように **すでに 本人の行を 読んでいる 画面**が、ついでに ここへ書く
 *    （`rememberAdminFlag`）。学習者は ログイン後 かならず マップを 通るので、
 *    ふだんは これだけで 足りる＝**往復は 増えない**。
 * 2. 覚え書きが 無い／古い ときだけ、教材の画面から 1列（`is_admin`）を 読む
 *    （`refreshAdminFlag`）。1人あたり 12時間に 1回で 頭打ちに なる。
 *
 * ## 覚え書きが ずれても 危なくない
 *
 * ここが 決めるのは **順路の 鍵を 素通りするか**だけで、読めるデータは
 * どのみち RLS が 決める。鍵そのものにも 昔から「それでも 見る」の 逃げ道が
 * あるので、まちがって true でも 誰かの 秘密が 開くわけでは ない。
 * ログアウトでは `clearNexmaxCache()` が `nexmax.` ごと 消す（だから この
 * 鍵の 名前は **`nexmax.` で 始める**）。
 */

/** 保存の鍵。`nexmax.` 始まりにして、ログアウトで 道連れに 消えるようにする。 */
export const ADMIN_FLAG_KEY = "nexmax.isAdmin.v1";

/** 覚え書きの 賞味期限。先生かどうかは めったに 変わらないので 長くてよい。 */
export const ADMIN_FLAG_FRESH_MS = 12 * 60 * 60 * 1000;

export interface AdminFlag {
  /** 先生（管理者）か。 */
  readonly admin: boolean;
  /** 誰の 覚え書きか（profiles.id）。人が 変わったら 上書きする。 */
  readonly id: string;
  /** 書いた時刻（`Date.now()`）。 */
  readonly at: number;
}

/** 壊れた保存値は「無い」とみなす（画面は 落とさない）。 */
export function parseAdminFlag(raw: string | null): AdminFlag | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const flag = parsed as Partial<AdminFlag>;
    if (typeof flag.admin !== "boolean") return null;
    if (typeof flag.id !== "string" || flag.id.length === 0) return null;
    if (typeof flag.at !== "number" || !Number.isFinite(flag.at)) return null;
    return { admin: flag.admin, id: flag.id, at: flag.at };
  } catch {
    return null;
  }
}

/** まだ 聞き直さなくてよいか。未来の時刻（時計のずれ）も 新しい扱いにする。 */
export function isAdminFlagFresh(flag: AdminFlag | null, now: number): boolean {
  return flag !== null && now - flag.at < ADMIN_FLAG_FRESH_MS;
}

function readRaw(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ADMIN_FLAG_KEY) ?? "";
  } catch {
    // プライベートモード等。先生の便利さが 1つ 消えるだけなので 黙って諦める
    return "";
  }
}

const listeners = new Set<() => void>();

/**
 * `useSyncExternalStore` 用のスナップショット。**生の文字列**を返す——
 * ここで JSON を解くと 呼ぶたびに 別のオブジェクトになり、React が 描き直し続ける。
 */
export function adminFlagSnapshot(): string {
  return readRaw();
}

export function subscribeAdminFlag(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** いま 分かっている「先生か」。サーバ側・未保存は false。 */
export function readIsAdmin(): boolean {
  return parseAdminFlag(readRaw())?.admin === true;
}

/** 本人の行を すでに 読んだ画面が、ついでに ここへ 書く。 */
export function rememberAdminFlag(id: string, admin: boolean, now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  const next = JSON.stringify({ admin, id, at: now } satisfies AdminFlag);
  try {
    if (window.localStorage.getItem(ADMIN_FLAG_KEY) === next) return;
    window.localStorage.setItem(ADMIN_FLAG_KEY, next);
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

/** 同じ画面で 何度 呼ばれても 聞きに行くのは 1回。 */
let inflight: Promise<void> | null = null;

/**
 * 覚え書きが 無い／古い ときだけ DB へ 聞き直す。
 * Supabase 未設定（デモモード）や 未ログインでは 何もしない——**消さない**ので、
 * 通しの検証で 積んだ 覚え書きも そのまま 残る。
 */
export function refreshAdminFlag(now: number = Date.now()): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isAdminFlagFresh(parseAdminFlag(readRaw()), now)) return Promise.resolve();
  if (inflight) return inflight;
  /*
   * Supabase の 一式は **聞きに行くときだけ** 読み込む（動的 import）。
   * ここで 上に import すると、教材の ページの 束に まるごと 入る——ふだんは
   * 覚え書きで 済むのに、学習者 全員が 毎回 その ぶんを 落とすことになる。
   */
  inflight = import("@/lib/profile-db")
    .then(({ fetchOwnAdminFlag }) => fetchOwnAdminFlag())
    .then((own) => {
      if (own) rememberAdminFlag(own.id, own.admin);
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
 * 「先生か」を 画面から 使う。最初の描画は 覚え書きの まま（ちらつかない）で、
 * 古ければ 裏で 聞き直して 描き直す。
 */
export function useIsAdmin(): boolean {
  const raw = useSyncExternalStore(subscribeAdminFlag, adminFlagSnapshot, () => "");
  useEffect(() => {
    void refreshAdminFlag();
  }, []);
  return parseAdminFlag(raw)?.admin === true;
}
