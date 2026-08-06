import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/studio-shell";
import { loadStudioData } from "@/lib/studio-data";

/**
 * とうじょう人物（先生向け・管理者だけ）。
 * まんがのコマで顔や服がぶれないよう、設定画を1枚ここで作る。
 */
export const metadata: Metadata = { title: "とうじょう人物" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <StudioShell section="characters" {...await loadStudioData()} />;
}
