import { MapShell } from "@/components/map-shell";
import { listWordStages } from "@/lib/content";

export default function MapPage() {
  // 単語ステージはビルド時に読み、レッスンカードの進捗と行き先に使う。
  const wordStages = listWordStages().map((stage) => ({ id: stage.id, title: stage.title }));
  return <MapShell wordStages={wordStages} />;
}
