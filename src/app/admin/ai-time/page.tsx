import type { Metadata } from "next";
import { ClassSettings, type ClassStage } from "@/components/admin/class-settings";
import { listStages } from "@/lib/content";
import { mapListedStages, sortStages } from "@/lib/map-data";
import { loadUnitIndex } from "@/lib/records/units";

/**
 * クラスの 設定（先生向け・管理者だけ）— 願い #586・#589
 *
 * 大学 × 期生 ごとに「AIの 時間」と「表示する 教材」を 決める。中身は
 * `src/components/admin/class-settings.tsx`。ここは **地図に 出る ステージと
 * その 教材の 名前**を サーバで 読んで 渡す だけ（ローダーは サーバ専用のため。
 * 学習の きろく `/admin/records` と 同じ 形）。設定そのものは ブラウザから
 * Supabase を 直に 読む——RLS が 関所で、Worker に 仕事を させない。
 *
 * 先生だけが 開く 画面なので、毎回 読む（スタジオで 足した ステージも すぐ 出る）。
 * 道は 前の 名前（`/admin/ai-time`）の まま——先生の ブックマークを 切らない。
 */
export const metadata: Metadata = { title: "クラスの 設定" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const [stages, index] = await Promise.all([listStages(), loadUnitIndex()]);
  const titles = new Map(index.units.map((unit) => [`${unit.type}:${unit.id}`, unit.title]));
  const listed: ClassStage[] = mapListedStages(sortStages(stages)).map((stage, at) => ({
    id: stage.id,
    number: at + 1,
    title: stage.title,
    contents: stage.contents.map((ref) => ({
      id: ref.ref,
      type: ref.type,
      title: titles.get(`${ref.type}:${ref.ref}`) ?? ref.ref,
    })),
  }));
  return <ClassSettings stages={listed} />;
}
