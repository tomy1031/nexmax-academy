import { MapShell } from "@/components/map-shell";
import { listStages, listWordStages } from "@/lib/content";

export default async function MapPage() {
  // 単語ステージはビルド時に読み、レッスンカードの進捗と行き先に使う。
  const wordStages = listWordStages().map((stage) => ({ id: stage.id, title: stage.title }));
  // データ化された公開ステージ。step が一致するピンから詳細ページへ行けるようにする。
  const stages = (await listStages())
    .filter((stage) => stage.status === "published")
    .map((stage) => ({ id: stage.id, step: stage.step }));
  return <MapShell wordStages={wordStages} stages={stages} />;
}
