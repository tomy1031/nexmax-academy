import type { Metadata } from "next";
import { StudioShell, type ContentSummary } from "@/components/studio/studio-shell";
import { listArticles, listMangas, listMeetings, listQuizSets, listStages } from "@/lib/content";

/**
 * コンテンツスタジオ（先生向け・管理者だけ — 設計07 §10.1）
 *
 * git 由来の教材はサーバで読んで渡す（ローダーはサーバ専用のため）。
 * DB由来の下書きはブラウザから /api/studio/content を叩いて足す。
 * ログイン状態で見せる内容が変わるので、静的化はしない。
 */

export const metadata: Metadata = { title: "コンテンツスタジオ" };
export const dynamic = "force-dynamic";

function toSummary(item: { id: string; title: string; description: string }): ContentSummary {
  return { id: item.id, title: item.title, description: item.description };
}

export default async function StudioPage() {
  const [stages, mangas, articles] = await Promise.all([
    listStages(),
    listMangas(),
    listArticles(),
  ]);

  return (
    <StudioShell
      stages={stages}
      mangas={mangas}
      articles={articles}
      quizSets={listQuizSets().map(toSummary)}
      meetings={listMeetings().map(toSummary)}
    />
  );
}
