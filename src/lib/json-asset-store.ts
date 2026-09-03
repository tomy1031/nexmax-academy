"use client";

import { useSyncExternalStore } from "react";

/**
 * 大きな 一覧を **ブラウザが 1回だけ 取りに 行く**ための 置き場（2026-09-03）
 *
 * ## なぜ サーバから 渡さないのか
 * サーバ部品から クライアント部品へ 渡した ものは、**HTML と RSC の 両方に 積まれる**。
 * 実測では 213〜250KB の データが **作りおき 1.1〜1.7MB** に なった（およそ 5〜7倍）。
 * OpenNext の 横取りは 作りおきに **当たって いても** 中身を 毎回 JSON から 起こし直し、
 * 指紋（etag）を 取り直すので、**作りおきの 大きさが そのまま CPU に なる**。
 * 無料枠の CPU 上限は 1リクエスト 10ms（docs/deploy.md §0.13・§0.14）。
 *
 * ## `public/` は Worker を 通らない
 * `public/` の ファイルは `.open-next/assets` に 入り、Cloudflare が **Worker を
 * 起こさずに** 返す（`wrangler.jsonc` に `run_worker_first` を 書いて いないので
 * 既定の false ＝ アセットが 先）。だから ここへ 移した ぶんの CPU は **0** に なる。
 *
 * ## 取れるまでの あいだ
 * 空の 一覧を 返す。**画面は それでも 出る**ように 呼ぶ側を 作る（本文は 読める・
 * 一覧の 行は サーバで 描く 等）。取れなくても 学習が 止まらない ことを 先に 決める。
 *
 * ## 1回しか 取らない
 * 束は モジュールに 1つ 持つ。画面の 中を 行き来しても 取り直さない。
 */
export function createJsonListStore<T>(url: string): () => readonly T[] {
  const EMPTY: readonly T[] = [];
  let items: readonly T[] = EMPTY;
  let started = false;
  const listeners = new Set<() => void>();

  function fetchOnce(): void {
    if (started) return;
    started = true;
    void fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!Array.isArray(data) || data.length === 0) return;
        items = data as readonly T[];
        for (const notify of listeners) notify();
      })
      .catch(() => {
        /* 取れなくても 画面は 出る（呼ぶ側が 空で 描ける ように 作って ある）。 */
      });
  }

  function subscribe(onChange: () => void): () => void {
    fetchOnce();
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }

  /** サーバでの 描画では 必ず 空 —— それが ねらい（積み荷を ふくらませない）。 */
  return function useJsonList(): readonly T[] {
    return useSyncExternalStore(
      subscribe,
      () => items,
      () => EMPTY,
    );
  };
}
