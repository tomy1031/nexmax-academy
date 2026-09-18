"use client";

import { useState, useSyncExternalStore } from "react";
import {
  clearLiveDebug,
  formatLiveDebugEntry,
  isLiveDebugOn,
  lastLiveProblem,
  liveDebugReport,
  readLiveDebug,
  readLiveDebugOnServer,
  subscribeLiveDebug,
} from "@/lib/ai/live-debug";

/**
 * 声の つなぎの 記録を 出す（URL に `?debug=1` を 付けた ときだけ）
 *
 * 2026-09-18「マイクが うまく 動かない・エラーの デバッグも 動いて いない」。
 * 先生・開発者が **その 端末で** 何が 起きたかを 見て、コピーして 渡せる ように する。
 * 記録の 中身と 伏せかたは `src/lib/ai/live-debug.ts`。学習者の ふだんの 画面には 出ない。
 *
 * 字は かなと 英字だけ（出る 画面の ふりがなの 見張りに かからない ように）。
 */

/** `?debug=1` は 画面の 中で 変わらない（読み込み直しで 変わる）。購読は 何も しない。 */
const subscribeNever = () => () => {};

/** 画面に 出す 行の 数（コピーは 全部）。 */
const SHOWN = 80;

export function LiveDebugPanel() {
  const on = useSyncExternalStore(subscribeNever, isLiveDebugOn, () => false);
  const list = useSyncExternalStore(subscribeLiveDebug, readLiveDebug, readLiveDebugOnServer);
  const [copied, setCopied] = useState(false);
  if (!on) return null;

  const copy = () => {
    void navigator.clipboard
      ?.writeText(liveDebugReport(list))
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <details
      open
      className="border-hairline mt-3 rounded-xl border-2 border-dashed bg-white p-2 text-left"
      data-testid="live-debug"
    >
      <summary className="text-navy cursor-pointer text-xs font-black">
        🐞 debug（{list.length}）
      </summary>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="border-sky text-navy rounded-lg border-2 px-2 py-1 text-xs font-black"
        >
          {copied ? "コピーしました" : "コピー"}
        </button>
        <button
          type="button"
          onClick={() => {
            clearLiveDebug();
            setCopied(false);
          }}
          className="border-hairline text-ink-soft rounded-lg border-2 px-2 py-1 text-xs font-black"
        >
          けす
        </button>
      </div>
      <pre className="text-ink mt-2 max-h-64 overflow-auto font-mono text-[11px] leading-snug break-all whitespace-pre-wrap">
        {list.length === 0
          ? "(まだ ありません)"
          : list.slice(-SHOWN).map(formatLiveDebugEntry).join("\n")}
      </pre>
    </details>
  );
}

/**
 * つながらなかった 理由の 名前（と、さいごに 止まった ところ）を 小さく 出す。
 *
 * たいわの 画面（`LiveReason`）と「せつぞくを ためす」は もう 出して いた。
 * ミーティング・朝礼の 🎤 だけ「いまは したの らんに かいて こたえて ください」しか
 * 出さず、鍵が 無いのか・マイクの 許可なのか・モデルに 断られたのか 分からなかった。
 * 鍵・トークンは 含まれない（記録は 入る ときに 伏せて ある）。
 */
export function LiveReasonLine({ reason }: { reason: string | null | undefined }) {
  const list = useSyncExternalStore(subscribeLiveDebug, readLiveDebug, readLiveDebugOnServer);
  const problem = lastLiveProblem(list);
  return (
    <p className="text-ink-faint mt-1 text-[11px] font-bold break-all" data-testid="live-reason">
      reason: {reason ?? "unknown"}
      {problem ? ` · ${problem.what} ${problem.detail}` : ""}
    </p>
  );
}
