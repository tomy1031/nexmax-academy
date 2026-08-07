import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/studio-shell";
import { loadStudioData } from "@/lib/studio-data";

/**
 * コンテンツスタジオ（先生向け・管理者だけ — 設計07 §10.1）
 *
 * git 由来の教材はサーバで読んで渡す（ローダーはサーバ専用のため）。
 * DB由来の下書きはブラウザから /api/studio/content を叩いて足す。
 * ログイン状態で見せる内容が変わるので、静的化はしない。
 */
export const metadata: Metadata = { title: "ステージ" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <StudioShell section="stages" {...await loadStudioData()} />;
}
