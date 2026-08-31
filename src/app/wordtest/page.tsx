import type { Metadata } from "next";
import { ArcadeGame } from "@/components/arcade/arcade-game";
import { listStages, listWordStages } from "@/lib/content";
import { learnerWordStages } from "@/lib/wordstage-merge";

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
  // 一覧も **1ステージ＝1つ**（同じ ことばが 2つの 名前で 出ないように）。
  return <ArcadeGame stages={learnerWordStages(stages, words)} />;
}
