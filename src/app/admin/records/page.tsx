import type { Metadata } from "next";
import { RecordsShell } from "@/components/admin/records-shell";
import { loadUnitIndex } from "@/lib/records/units";

/**
 * 学習の きろく（先生向け・管理者だけ — 設計07 §10.1）
 *
 * 教材の 名前は サーバで 読んで 渡す（ローダーは サーバ専用のため。`loadStudioData`
 * と 同じ 形）。記録そのものは ブラウザから Supabase を 直に 読む——RLS が 関所で、
 * Worker に 仕事を させない（docs/constraints.md 2026-08-26）。
 *
 * ログイン状態で 見せる 中身が 変わるので、静的化は しない。
 */
export const metadata: Metadata = { title: "学習の きろく" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <RecordsShell index={await loadUnitIndex()} />;
}
