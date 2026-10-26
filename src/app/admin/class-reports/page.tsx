import type { Metadata } from "next";
import { ClassReportsShell } from "@/components/admin/class-reports-shell";

/**
 * 授業ごとの分析（先生向け・管理者だけ — 要望 #599）
 *
 * 2026-10-26 に 学習の きろく（`/admin/records`）の いちばん 上から 移した。
 * 中身は `src/components/admin/class-reports-shell.tsx`。分析は ブラウザから
 * Supabase を 直に 読む——RLS が 関所で、Worker に 仕事を させない。
 */
export const metadata: Metadata = { title: "授業ごとの分析" };

export default function Page() {
  return <ClassReportsShell />;
}
