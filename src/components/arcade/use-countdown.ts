"use client";

import { useEffect, useState } from "react";

/**
 * 残り時間の割合（1 → 0）を返す単一の requestAnimationFrame ループ。
 *
 * 旧アプリは setTimeout と rAF が混在していたため、タブを離れると時間だけが進み、
 * 戻ったときには終わっていた。ここでは deltaTime で進め、タブが隠れている間は止める。
 *
 * onExpire は安定した関数（useCallback 等）を渡すこと。毎レンダーで作り直すと
 * カウントがやり直しになる。
 */
export function useCountdown({
  seconds,
  active,
  onExpire,
  /** キーが変わるとカウントを最初からやり直す。 */
  resetKey,
}: {
  seconds: number;
  active: boolean;
  onExpire: () => void;
  resetKey: string | number;
}): number {
  const [tracked, setTracked] = useState({ key: resetKey, remaining: 1 });

  useEffect(() => {
    if (!active || seconds <= 0) return;

    let elapsed = 0;
    let last = performance.now();
    let frame = 0;
    let stopped = false;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      // タブが隠れている間は進めない（戻ったときに一瞬で時間切れにしない）
      if (!document.hidden) elapsed += delta;

      const remaining = Math.max(0, 1 - elapsed / (seconds * 1000));
      setTracked({ key: resetKey, remaining });

      if (remaining <= 0) {
        stopped = true;
        onExpire();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      if (!stopped) cancelAnimationFrame(frame);
    };
  }, [seconds, active, resetKey, onExpire]);

  // キーが変わった直後は、まだ古い残量を見せない（描画時に導出する）
  return tracked.key === resetKey ? tracked.remaining : 1;
}
