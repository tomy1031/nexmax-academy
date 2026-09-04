"use client";

import { useEffect } from "react";
import { hasAuthCookieInBrowser } from "@/lib/auth-cookie";
import { isSupabaseConfigured } from "@/lib/env";
import { subscribeProgress } from "@/lib/progress/store";

/**
 * 端末の きろくを 台帳へ 写す 係（画面は 出さない）
 *
 * 全ページの 土台（`layout.tsx`）に 置く。教材の 画面ごとに 置かないのは、
 * **1つ 置き忘れた 教材だけが 先生から 見えなく なる**から——しかも その 抜けは
 * どこにも 出ない（`src/lib/records/sync.ts` の 冒頭）。
 *
 * ## 重さ
 * `RegisterOnLogin` と 同じ 作り。ここが 全ページに 積むのは この 小さな ファイルだけで、
 * 写す 中身（Supabase の つなぎ）は **送る ものが できてから** `import()` で 取りに行く。
 *
 * ## いつ 流すか
 *   1. 端末の 記録が 変わった **10秒あと**（そのあいだの 変化は 1回に たたまれる）
 *   2. 画面を 閉じる・タブを 隠す とき（授業の チャイムで 消えない ように）
 *   3. 開いた 直後に 1回（前の 授業で 送れなかった ぶん・デモモードで ためた ぶん）
 */
export function RecordsSync() {
  useEffect(() => {
    // 鍵ゼロの デモモードには 写す 先が 無い。ここで 止めれば 中身を 取りに 行かない。
    if (!isSupabaseConfigured) return;
    // ログインして いない 人の 記録は まだ 誰の ものか 決まらない。
    // クッキーが 無ければ 未ログインは 確実なので、往復ゼロで 決めてよい。
    if (!hasAuthCookieInBrowser()) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (disposed) return;
      void import("@/lib/records/sync")
        .then(({ flushRecords }) => flushRecords())
        .catch(() => {
          // 写せなくても 学習は 続く。画面に 何も 出さない。
        });
    };

    /**
     * ためる。すでに 待って いれば **延ばさない**——延ばし続ける 作りに すると、
     * まんがを めくり続ける あいだ 1回も 送られず、途中で 閉じた ぶんが まるごと 遅れる。
     */
    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(flush, FLUSH_DELAY_MS);
    };

    const flushNow = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    };

    const onHide = () => {
      if (document.visibilityState === "hidden") flushNow();
    };

    const unsubscribe = subscribeProgress(schedule);
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", onHide);
    // 開いた 直後の 1回。描画と 取り合わない ように 少し 待つ。
    const first = setTimeout(flush, FIRST_FLUSH_DELAY_MS);

    return () => {
      disposed = true;
      clearTimeout(first);
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}

/*
 * 待ち時間は **この ファイルに 直に 置く**（`@/lib/records/sync` から import しない）。
 * あちらを import すると Supabase の つなぎが 全ページの 荷物に 入り、
 * 遅らせた 意味が 無くなる（Worker の 大きさ＝デプロイ §罠5）。
 * 値は `FLUSH_DELAY_MS` と そろえて ある（`tests/records_sync.test.ts` が 見張る）。
 */
const FLUSH_DELAY_MS = 10_000;
const FIRST_FLUSH_DELAY_MS = 3_000;
