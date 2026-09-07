import type { Metadata } from "next";
import { RecordsShell } from "@/components/admin/records-shell";
import { RECORD_KINDS } from "@/lib/records/table";
import { loadUnitIndex } from "@/lib/records/units";

/**
 * 学習の きろく（先生向け・管理者だけ — 設計07 §10.1）
 *
 * 教材の 名前は サーバで 読んで 渡す（ローダーは サーバ専用のため。`loadStudioData`
 * と 同じ 形）。記録そのものは ブラウザから Supabase を 直に 読む——RLS が 関所で、
 * Worker に 仕事を させない（docs/constraints.md 2026-08-26）。
 *
 * ログイン状態で 見せる 中身が 変わるので、静的化は しない。
 *
 * `?kind=` は 畳んだ 古い URL（`/admin/meetings`・`/admin/quizzes`）の 行き先。
 * 先生の ブックマークが「ミーティングの きろく」を 指して いても、開いた ときに
 * **会話の タブ**に 座る（一覧の いちばん 上から 探し直させない）。
 */
export const metadata: Metadata = { title: "学習の きろく" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const initial = RECORD_KINDS.find((one) => one.id === kind)?.id;
  return <RecordsShell index={await loadUnitIndex()} initialKind={initial} />;
}
