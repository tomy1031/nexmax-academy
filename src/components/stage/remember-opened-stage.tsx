"use client";

import { useEffect } from "react";
import { rememberOpenedStage } from "@/lib/progress";

/**
 * 開いた ステージを「最後に 開いた ステージ」として 覚えるだけの 部品（何も 描かない）。
 *
 * ステージの トップ（StageDetail）と 教材の 枠（ContentFrame）は 自分で 覚える。
 * これは **サーバの ページから 置く** ための もの——単語テスト（`/wordtest/<ステージ>`）は
 * 画面の 部品が ステージを 知らないので、ページが 持ち主の ステージを 渡す。
 * 地図の「単語を 勉強」から 入って 端末の「戻る」で 地図へ 戻った ときも、
 * そのステージへ 下りる ように する（2026-09-30 の 指定・`mapLanding`）。
 */
export function RememberOpenedStage({ stageId }: { stageId: string }) {
  useEffect(() => {
    rememberOpenedStage(stageId);
  }, [stageId]);
  return null;
}
