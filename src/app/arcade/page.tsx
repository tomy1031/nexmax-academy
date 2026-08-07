import type { Metadata } from "next";
import { ArcadeGame } from "@/components/arcade/arcade-game";
import { listWordStages } from "@/lib/content";

export const metadata: Metadata = {
  title: "ことばアーケード | Japanese IT Pathway",
};

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した単語ステージは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;

/**
 * 単語だけで開いたときの入り口。ステージ選択から始まる（旧アプリと同じ流れ）。
 * レッスンから来たときは /arcade/[stage] で直接モード選択に入る。
 */
export default async function ArcadeIndexPage() {
  return <ArcadeGame stages={await listWordStages()} />;
}
