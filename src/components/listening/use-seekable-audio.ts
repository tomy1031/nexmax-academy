"use client";

import { useEffect, useState } from "react";

/**
 * 音を **1回 まるごと 取って**、手もとの Blob で 鳴らす（2026-09-30）
 *
 * ## なぜ 直接 `src` に しないのか
 * 配信元（Cloudflare Workers の 静的ファイル）は「途中から 送って」（`Range`）と
 * 頼まれても **全体を 200 で 返す**（`206` も `Accept-Ranges` も 無い）。Chrome は
 * これを「位置を 動かせない 音」と みなして、つまみを 動かしても **0秒に 戻す**
 *（2026-09-30 STG で 実測 `seekable` = `[0,0]`。鳴らしながらも、止めてからも 効かない）。
 * 手もとの Blob なら 位置を 動かせる（`seekable` = `[0, 長さ]`）。
 *
 * 版番号つきの URL（`assetUrl`）は ブラウザが 長く 持つので、2回目からは すぐ 取れる。
 *
 * ## 決まり
 * - **`enabled` に なるまで 取らない**。「はじめる」を 押す 前に 教室の 細い 回線を 食わない。
 * - 取れ 終わるまで `url` は `undefined`（`<audio>` に 何も 渡さない＝ 途中の 音は 鳴らない）。
 * - **取れなくても 音は 残す**。失敗したら `fallback` で 元の URL を 返す
 *   （つまみは 効かないが、無音の 教材には しない）。
 * - 1度 取ったら 部品が 消えるまで 持つ（`enabled` が 戻っても 取り直さない）。
 */
export type SeekableAudio = {
  /** `<audio src>` に 渡す もの。取り終わるまでは `undefined`。 */
  url: string | undefined;
  /** idle=まだ 取らない ／ loading=取っている ／ ready=手もとの Blob ／ fallback=元の URL */
  status: "idle" | "loading" | "ready" | "fallback";
  /** 取れた 割合（整数の %）。長さが 分からない ときは `null`。取り終わるまで 99 まで。 */
  progress: number | null;
};

type Fetched = {
  src: string;
  status: "loading" | "ready" | "fallback";
  url: string | undefined;
  progress: number | null;
};

const IDLE: SeekableAudio = { url: undefined, status: "idle", progress: null };

export function useSeekableAudio(src: string | undefined, enabled: boolean): SeekableAudio {
  // 1度 `enabled` に なったら 戻さない（取った 音を 捨てて 取り直さない ため）
  const [wanted, setWanted] = useState(enabled);
  if (enabled && !wanted) setWanted(true);

  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    if (!wanted || !src) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;

    void (async () => {
      try {
        const res = await fetch(src, { signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`音を 取れません（${res.status}）`);

        const total = Number(res.headers.get("content-length")) || 0;
        const reader = res.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;
        let last: number | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          // 整数が 変わった ときだけ 描き直す（細切れの 到着ごとに 描かない）
          const percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : null;
          if (percent !== last) {
            last = percent;
            setFetched({ src, status: "loading", url: undefined, progress: percent });
          }
        }

        if (controller.signal.aborted) return;
        const blob = new Blob(chunks, { type: res.headers.get("content-type") ?? "audio/wav" });
        objectUrl = URL.createObjectURL(blob);
        setFetched({ src, status: "ready", url: objectUrl, progress: 100 });
      } catch {
        // 取り消し（部品が 消えた・src が 変わった）は 何も しない
        if (controller.signal.aborted) return;
        setFetched({ src, status: "fallback", url: src, progress: null });
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wanted, src]);

  if (!wanted || !src) return IDLE;
  // src が 変わった 直後は 前の 音を 返さない
  if (!fetched || fetched.src !== src) return { url: undefined, status: "loading", progress: null };
  return { url: fetched.url, status: fetched.status, progress: fetched.progress };
}
