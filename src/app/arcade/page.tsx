import type { Metadata } from "next";
import { ArcadeGame } from "@/components/arcade/arcade-game";
import { listWordStages } from "@/lib/content";

export const metadata: Metadata = {
  title: "ことばアーケード | Japanese IT Pathway",
};

/**
 * 単語だけで開いたときの入り口。ステージ選択から始まる（旧アプリと同じ流れ）。
 * レッスンから来たときは /arcade/[stage] で直接モード選択に入る。
 */
export default function ArcadeIndexPage() {
  return <ArcadeGame stages={listWordStages()} />;
}
