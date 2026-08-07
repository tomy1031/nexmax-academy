import type { Metadata } from "next";
import { BatchPanel } from "@/components/studio/batch-panel";
import { loadStudioData } from "@/lib/studio-data";

/**
 * まとめて つくる（先生向け・管理者だけ）
 *
 * 足りない絵と音を1画面に集めて、上から1件ずつ作る。
 * エディタを1つずつ開いて探す作業そのものが「作らない理由」になっていた。
 */
export const metadata: Metadata = { title: "まとめて つくる" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <BatchPanel {...await loadStudioData()} />;
}
