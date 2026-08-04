import { MapShell } from "@/components/map-shell";
import { STAGES } from "@/content/stages";
import { listStages, listWordStages } from "@/lib/content";
import { composeMapBands, listMapSegments } from "@/lib/map-segments";
import { toStagePins } from "@/lib/stage-pins";

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した教材は、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;

export default async function MapPage() {
  // 単語ステージはビルド時に読み、レッスンカードの進捗と行き先に使う。
  const wordStages = listWordStages().map((stage) => ({ id: stage.id, title: stage.title }));
  // 定番ステージとデータ化ステージを step で重ねてピンにする。データ側が勝つので、
  // スタジオで直した見出しや説明がそのままマップに出る。
  const stages = (await listStages()).filter((stage) => stage.status === "published");
  const pins = toStagePins(STAGES, stages);
  // STEP 6 以降は「1ステージ = 1枚の絵」。public/img/scenes/ に map_step6_*.webp を
  // おくと、次の再生成でその帯がマップに足される（コードは触らない）。絵がまだ無い
  // ステージは色だけの帯で出す。node:fs を使うのはここ（サーバ）だけで、画面には
  // props で渡す（設計07 §11.1）。
  const { bands, baseBandCount } = composeMapBands(
    listMapSegments(),
    pins.map((pin) => pin.step),
  );
  return (
    <MapShell wordStages={wordStages} pins={pins} bands={bands} baseBandCount={baseBandCount} />
  );
}
