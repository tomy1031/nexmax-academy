import type { Metadata } from "next";
import { ArcadeGame } from "@/components/arcade/arcade-game";
import { listStages, listWordStages } from "@/lib/content";
import { learnerWordGroups } from "@/lib/wordstage-merge";

export const metadata: Metadata = {
  title: "単語テスト | Japanese IT Pathway",
};

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した単語ステージは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 300;

/**
 * 単語だけで開いたときの入り口。ステージ選択から始まる（旧アプリと同じ流れ）。
 * レッスンから来たときは /wordtest/[stage] で直接モード選択に入る。
 */
export default async function ArcadeIndexPage() {
  const [stages, words] = await Promise.all([listStages(), listWordStages()]);
  /*
   * 一覧は **1ステージ 1行**（同じ ステージが 何行も ならばない）。押した 先で
   * 初級・中級・上級を えらぶ（願い #280・2026-08-31「会社を知るを選ぶと、
   * 初級・中級・上級が選択できるようにしてください」）。
   */
  const { heads, sets } = learnerWordGroups(stages, words);
  return <ArcadeGame stages={sets} groups={heads} />;
}
